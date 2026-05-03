import { cacheYoutubeSubtitleCues, type YoutubeSubtitleCue } from './subtitle-overlay';
import { logDebug } from '../../shared/debug';

type YoutubePlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{
        baseUrl?: string;
        languageCode?: string;
        kind?: string;
        name?: unknown;
      }>;
    };
  };
};

const FULL_TRACK_INITIAL_LOOKAHEAD_MS = 180_000;
const FULL_TRACK_INITIAL_MAX_CUES = 80;
const FULL_TRACK_INITIAL_CUE_GRACE_MS = 500;

export async function collectYoutubeSubtitleSegments(
  preferredLanguage = 'auto',
): Promise<Array<{ id: string; text: string }>> {
  logDebug('youtube subtitle collection starting', { preferredLanguage });
  const trackUrl = findCaptionTrackUrl(preferredLanguage);
  if (!trackUrl) {
    logDebug('youtube subtitle track not found');
    cacheYoutubeSubtitleCues([]);
    return [];
  }

  logDebug('youtube subtitle track selected', {
    trackUrlLength: trackUrl.length,
  });
  const response = await fetch(trackUrl);
  if (!response.ok) {
    logDebug('youtube subtitle track request failed', { status: response.status });
    throw new Error(`字幕轨道读取失败：${response.status}`);
  }

  const cues = parseTimedText(await response.text());
  logDebug('youtube subtitle track parsed', { cueCount: cues.length });
  if (cues.length === 0) {
    throw new Error('字幕轨道存在，但 YouTube 返回了空字幕内容。请确认视频字幕可在播放器中打开，或换用其他字幕轨道。');
  }

  cacheYoutubeSubtitleCues(cues);
  return selectInitialTrackCues(cues).map(({ id, text }) => ({ id, text }));
}

function selectInitialTrackCues(cues: YoutubeSubtitleCue[]): YoutubeSubtitleCue[] {
  const video = document.querySelector('video');
  if (!video) {
    return cues.slice(0, FULL_TRACK_INITIAL_MAX_CUES);
  }

  const nowMs = Math.max(0, Math.round(video.currentTime * 1000));
  const lookaheadEndMs = nowMs + FULL_TRACK_INITIAL_LOOKAHEAD_MS;
  const windowCues = cues.filter(
    (cue) =>
      cue.endMs >= nowMs - FULL_TRACK_INITIAL_CUE_GRACE_MS &&
      cue.startMs <= lookaheadEndMs,
  );
  if (windowCues.length > 0) {
    return windowCues.slice(0, FULL_TRACK_INITIAL_MAX_CUES);
  }

  const firstWindowIndex = cues.findIndex(
    (cue) => cue.endMs >= nowMs - FULL_TRACK_INITIAL_CUE_GRACE_MS,
  );
  const startIndex = firstWindowIndex === -1 ? 0 : firstWindowIndex;
  return cues.slice(startIndex, startIndex + FULL_TRACK_INITIAL_MAX_CUES);
}

function findCaptionTrackUrl(preferredLanguage: string): string {
  const playerResponse = readPlayerResponseFromWindow() ?? readPlayerResponseFromScripts();
  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  logDebug('youtube caption tracks discovered', {
    trackCount: tracks.length,
    preferredLanguage,
  });
  const tracksWithUrls = tracks.filter((track) => track.baseUrl);
  const normalizedPreferredLanguage = normalizeLanguageCode(preferredLanguage);
  const selectedTrack =
    normalizedPreferredLanguage === 'auto'
      ? (tracksWithUrls.find(
          (track) => normalizeLanguageCode(track.languageCode ?? '') === 'en' && track.kind !== 'asr',
        ) ??
        tracksWithUrls.find((track) => track.kind !== 'asr') ??
        tracksWithUrls[0] ??
        null)
      : (tracksWithUrls.find(
          (track) => normalizeLanguageCode(track.languageCode ?? '') === normalizedPreferredLanguage,
        ) ??
        tracksWithUrls.find((track) => track.kind !== 'asr') ??
        tracksWithUrls[0] ??
        null);
  return selectedTrack?.baseUrl ?? '';
}

function normalizeLanguageCode(languageCode: string): string {
  return languageCode.trim().toLowerCase().split('-')[0] || 'auto';
}

function readPlayerResponseFromWindow(): YoutubePlayerResponse | null {
  const candidate = (window as unknown as { ytInitialPlayerResponse?: YoutubePlayerResponse })
    .ytInitialPlayerResponse;
  return candidate ?? null;
}

function readPlayerResponseFromScripts(): YoutubePlayerResponse | null {
  for (const script of Array.from(document.scripts)) {
    const text = script.textContent ?? '';
    const marker = 'ytInitialPlayerResponse';
    const markerIndex = text.indexOf(marker);
    if (markerIndex === -1) {
      continue;
    }

    const jsonStart = text.indexOf('{', markerIndex);
    if (jsonStart === -1) {
      continue;
    }

    const jsonText = readBalancedJsonObject(text, jsonStart);
    if (!jsonText) {
      continue;
    }

    try {
      return JSON.parse(jsonText) as YoutubePlayerResponse;
    } catch {
      continue;
    }
  }

  return null;
}

function readBalancedJsonObject(text: string, startIndex: number): string {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return '';
}

function parseTimedText(xml: string): YoutubeSubtitleCue[] {
  const trimmed = xml.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('{')) {
    return parseJson3TimedText(trimmed);
  }

  if (trimmed.startsWith('WEBVTT')) {
    return parseWebVttTimedText(trimmed);
  }

  const document = new DOMParser().parseFromString(trimmed, 'text/xml');
  return Array.from(document.querySelectorAll('text'))
    .map((node, index) => {
      const text = normalizeCueText(node.textContent ?? '');
      const startSeconds = Number.parseFloat(node.getAttribute('start') ?? '0');
      const durationSeconds = Number.parseFloat(node.getAttribute('dur') ?? '0');
      return {
        id: `cue-${index}`,
        text,
        startMs: Math.max(0, Math.round(startSeconds * 1000)),
        endMs: Math.max(0, Math.round((startSeconds + durationSeconds) * 1000)),
      };
    })
    .filter((cue) => cue.text.length > 0 && cue.endMs > cue.startMs);
}

function normalizeCueText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function parseJson3TimedText(json: string): YoutubeSubtitleCue[] {
  try {
    const parsed = JSON.parse(json) as {
      events?: Array<{
        tStartMs?: number;
        dDurationMs?: number;
        segs?: Array<{ utf8?: string }>;
      }>;
    };

    return (parsed.events ?? [])
      .map((event, index) => {
        const text = normalizeCueText(
          (event.segs ?? []).map((segment) => segment.utf8 ?? '').join(''),
        );
        const startMs = Math.max(0, Math.round(event.tStartMs ?? 0));
        const durationMs = Math.max(0, Math.round(event.dDurationMs ?? 0));
        return {
          id: `cue-${index}`,
          text,
          startMs,
          endMs: startMs + durationMs,
        };
      })
      .filter((cue) => cue.text.length > 0 && cue.endMs > cue.startMs);
  } catch {
    return [];
  }
}

function parseWebVttTimedText(vtt: string): YoutubeSubtitleCue[] {
  return vtt
    .split(/\n\n+/)
    .map((block, index) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const timingLineIndex = lines.findIndex((line) => line.includes('-->'));
      if (timingLineIndex === -1) {
        return null;
      }

      const [start, end] = lines[timingLineIndex].split('-->').map((value) => value.trim());
      const text = normalizeCueText(lines.slice(timingLineIndex + 1).join(' '));
      const startMs = parseVttTimestamp(start);
      const endMs = parseVttTimestamp(end);
      if (!text || endMs <= startMs) {
        return null;
      }

      return {
        id: `cue-${index}`,
        text,
        startMs,
        endMs,
      };
    })
    .filter((cue): cue is YoutubeSubtitleCue => cue !== null);
}

function parseVttTimestamp(timestamp: string): number {
  const normalized = timestamp.split(/\s+/)[0];
  const parts = normalized.split(':');
  const secondsText = parts.pop() ?? '0';
  const minutesText = parts.pop() ?? '0';
  const hoursText = parts.pop() ?? '0';
  const seconds = Number.parseFloat(secondsText);
  const minutes = Number.parseInt(minutesText, 10);
  const hours = Number.parseInt(hoursText, 10);

  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}
