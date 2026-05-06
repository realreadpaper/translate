import type { DisplayMode } from '../../shared/types';
import type { SubtitleDisplayStyle } from '../../shared/types';
import type { StartTranslationJobMessage } from '../../shared/messages';
import { logDebug } from '../../shared/debug';

export type YoutubeSubtitleCue = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
};

const OVERLAY_STYLE_ID = 'immersive-ai-translate-youtube-subtitle-style';
const OVERLAY_ACTIVE_ATTR = 'data-immersive-youtube-overlay-active';
const RENDERED_CUE_PREFIX = 'rendered-cue-';
const RENDERED_CAPTION_DEBOUNCE_MS = 40;
const TRACK_PREFETCH_DEBOUNCE_MS = 30;
const TRACK_PREFETCH_LOOKAHEAD_MS = 45_000;
const TRACK_PREFETCH_BATCH_SIZE = 6;
let cachedCues: YoutubeSubtitleCue[] = [];
let translatedTextBySourceText = new Map<string, string>();
type YoutubeSubtitleOverlayController = {
  displayMode: DisplayMode;
  displayStyle: SubtitleDisplayStyle;
  overlay: HTMLElement;
  translatedById: Map<string, string>;
  pendingTrackCueIds: Set<string>;
  video: HTMLVideoElement | null;
  trackPrefetchTimer?: number;
  trackPrefetchStarted: boolean;
  renderActiveCue: () => void;
};
let overlayController: YoutubeSubtitleOverlayController | null = null;
type RenderedCaptionLiveController = {
  observer: MutationObserver;
  host: Element;
  knownTexts: Set<string>;
  nextCueIndex: number;
  timer?: number;
};
let liveCaptionController: RenderedCaptionLiveController | null = null;

export function cacheYoutubeSubtitleCues(cues: YoutubeSubtitleCue[]) {
  cachedCues = cues;
  translatedTextBySourceText = new Map();
  if (!hasRenderedCaptionCues()) {
    stopRenderedCaptionLiveTranslation();
  }
  overlayController?.renderActiveCue();
}

export function reserveTrackCueIds(ids: string[]) {
  if (!overlayController) {
    return;
  }

  ids.forEach((id) => overlayController.pendingTrackCueIds.add(id));
}

export function renderYoutubeSubtitleOverlay(
  translated: Array<{ id: string; translatedText: string }>,
  displayMode: DisplayMode,
  displayStyle: SubtitleDisplayStyle = 'overlay-bottom',
  options: {
    sendRuntimeMessage?: (message: StartTranslationJobMessage) => Promise<unknown>;
  } = {},
) {
  ensureOverlayStyles();

  const incomingTranslatedById = new Map(translated.map((item) => [item.id, item.translatedText]));
  rememberTranslatedCueText(translated);
  const host = findPlayerContainer();
  document.documentElement.setAttribute(OVERLAY_ACTIVE_ATTR, 'true');
  host.setAttribute(OVERLAY_ACTIVE_ATTR, 'true');
  let overlay = host.querySelector('[data-youtube-subtitle-overlay]') as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.dataset.youtubeSubtitleOverlay = 'true';
    host.appendChild(overlay);
  }

  const video = document.querySelector('video');
  if (overlayController && overlayController.overlay === overlay) {
    overlayController.displayMode = displayMode;
    overlayController.displayStyle = displayStyle;
    incomingTranslatedById.forEach((translatedText, id) => {
      overlayController?.translatedById.set(id, translatedText);
      overlayController?.pendingTrackCueIds.delete(id);
    });
    overlayController.renderActiveCue();
    maybeStartRenderedCaptionLiveTranslation(options.sendRuntimeMessage);
    maybeStartTrackLookaheadTranslation(options.sendRuntimeMessage);
    return;
  }

  const controller: YoutubeSubtitleOverlayController = {
    displayMode,
    displayStyle,
    overlay,
    translatedById: incomingTranslatedById,
    pendingTrackCueIds: new Set(),
    video,
    trackPrefetchStarted: false,
    renderActiveCue() {
      if (!controller.video) {
        return;
      }

      const nowMs = controller.video.currentTime * 1000;
      const cue = findActiveCue(nowMs);
      if (!cue) {
        controller.overlay.textContent = '';
        controller.overlay.dataset.empty = 'true';
        return;
      }

      controller.overlay.dataset.empty = 'false';
      controller.overlay.dataset.displayStyle = controller.displayStyle;
      const translatedText = controller.translatedById.get(cue.id) ?? '';
      const cueNodes = createCueNodes(cue.text, translatedText, controller.displayMode);
      if (cueNodes.length === 0) {
        controller.overlay.textContent = '';
        controller.overlay.dataset.empty = 'true';
        return;
      }

      controller.overlay.replaceChildren(...cueNodes);
    },
  };

  overlayController = controller;
  controller.renderActiveCue();
  video?.addEventListener('timeupdate', controller.renderActiveCue);
  video?.addEventListener('seeked', controller.renderActiveCue);
  maybeStartRenderedCaptionLiveTranslation(options.sendRuntimeMessage);
  maybeStartTrackLookaheadTranslation(options.sendRuntimeMessage);
}

export function updateYoutubeSubtitleOverlayDisplayMode(displayMode: DisplayMode) {
  if (!overlayController) {
    return false;
  }

  overlayController.displayMode = displayMode;
  overlayController.renderActiveCue();
  return true;
}

function createCueNodes(
  sourceText: string,
  translatedText: string,
  displayMode: DisplayMode,
): Node[] {
  const nodes: Node[] = [];

  if (displayMode !== 'translated-only') {
    const original = document.createElement('div');
    original.className = 'immersive-youtube-subtitle__original';
    original.textContent = sourceText;
    nodes.push(original);
  }

  if (displayMode !== 'original-only' && translatedText) {
    const translated = document.createElement('div');
    translated.className = 'immersive-youtube-subtitle__translated';
    translated.textContent = translatedText;
    nodes.push(translated);
  }

  return nodes;
}

function findPlayerContainer(): HTMLElement {
  return (
    (document.querySelector('#movie_player') as HTMLElement | null) ??
    (document.querySelector('.html5-video-player') as HTMLElement | null) ??
    document.body
  );
}

function findActiveCue(nowMs: number): YoutubeSubtitleCue | undefined {
  for (let index = cachedCues.length - 1; index >= 0; index -= 1) {
    const cue = cachedCues[index];
    if (nowMs >= cue.startMs && nowMs <= cue.endMs) {
      return cue;
    }
  }

  return undefined;
}

function maybeStartRenderedCaptionLiveTranslation(
  sendRuntimeMessage?: (message: StartTranslationJobMessage) => Promise<unknown>,
) {
  if (!sendRuntimeMessage || !hasRenderedCaptionCues()) {
    return;
  }

  const host =
    document.querySelector('.ytp-caption-window-container') ?? findPlayerContainer();
  if (liveCaptionController?.host === host) {
    return;
  }

  stopRenderedCaptionLiveTranslation();
  const controller: RenderedCaptionLiveController = {
    observer: new MutationObserver(() => {
      if (controller.timer !== undefined) {
        window.clearTimeout(controller.timer);
      }

      controller.timer = window.setTimeout(() => {
        requestRenderedCaptionTranslation(controller, sendRuntimeMessage);
      }, RENDERED_CAPTION_DEBOUNCE_MS);
    }),
    host,
    knownTexts: new Set(
      cachedCues
        .filter((cue) => cue.id.startsWith(RENDERED_CUE_PREFIX))
        .map((cue) => cue.text),
    ),
    nextCueIndex: getNextRenderedCueIndex(),
    timer: undefined,
  };
  liveCaptionController = controller;
  controller.observer.observe(host, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function maybeStartTrackLookaheadTranslation(
  sendRuntimeMessage?: (message: StartTranslationJobMessage) => Promise<unknown>,
) {
  if (!sendRuntimeMessage || !overlayController || hasRenderedCaptionCues()) {
    return;
  }

  const controller = overlayController;
  scheduleTrackLookaheadTranslation(controller, sendRuntimeMessage);
  if (controller.trackPrefetchStarted) {
    return;
  }

  controller.trackPrefetchStarted = true;
  controller.video?.addEventListener('timeupdate', () => {
    scheduleTrackLookaheadTranslation(controller, sendRuntimeMessage);
  });
  controller.video?.addEventListener('seeked', () => {
    scheduleTrackLookaheadTranslation(controller, sendRuntimeMessage);
  });
}

function scheduleTrackLookaheadTranslation(
  controller: YoutubeSubtitleOverlayController,
  sendRuntimeMessage: (message: StartTranslationJobMessage) => Promise<unknown>,
) {
  if (controller.trackPrefetchTimer !== undefined) {
    window.clearTimeout(controller.trackPrefetchTimer);
  }

  controller.trackPrefetchTimer = window.setTimeout(() => {
    requestTrackLookaheadTranslation(controller, sendRuntimeMessage);
  }, TRACK_PREFETCH_DEBOUNCE_MS);
}

function requestTrackLookaheadTranslation(
  controller: YoutubeSubtitleOverlayController,
  sendRuntimeMessage: (message: StartTranslationJobMessage) => Promise<unknown>,
) {
  if (!controller.video) {
    return;
  }

  const nowMs = Math.max(0, Math.round(controller.video.currentTime * 1000));
  const lookaheadEndMs = nowMs + TRACK_PREFETCH_LOOKAHEAD_MS;
  const candidateCues = cachedCues
    .filter((cue) => !cue.id.startsWith(RENDERED_CUE_PREFIX))
    .filter((cue) => cue.endMs >= nowMs - 500 && cue.startMs <= lookaheadEndMs)
    .filter((cue) => !controller.translatedById.has(cue.id))
    .filter((cue) => !controller.pendingTrackCueIds.has(cue.id))
    .slice(0, TRACK_PREFETCH_BATCH_SIZE);

  const segments: Array<{ id: string; text: string }> = [];
  let usedCachedTranslation = false;
  candidateCues.forEach((cue) => {
    const cachedTranslation = readCachedTranslation(cue.text);
    if (cachedTranslation) {
      controller.translatedById.set(cue.id, cachedTranslation);
      usedCachedTranslation = true;
      return;
    }

    segments.push({ id: cue.id, text: cue.text });
  });

  if (usedCachedTranslation) {
    controller.renderActiveCue();
  }

  if (segments.length === 0) {
    return;
  }

  const [urgentSegment, ...backgroundSegments] = segments;
  if (urgentSegment) {
    queueTrackLookaheadSegments(controller, sendRuntimeMessage, [urgentSegment], 'urgent');
  }
  if (backgroundSegments.length > 0) {
    queueTrackLookaheadSegments(
      controller,
      sendRuntimeMessage,
      backgroundSegments,
      'lookahead',
    );
  }
}

function queueTrackLookaheadSegments(
  controller: YoutubeSubtitleOverlayController,
  sendRuntimeMessage: (message: StartTranslationJobMessage) => Promise<unknown>,
  segments: Array<{ id: string; text: string }>,
  lane: 'urgent' | 'lookahead',
) {
  segments.forEach((segment) => controller.pendingTrackCueIds.add(segment.id));
  segments.forEach((segment) => logSubtitleCaptured(segment.text));

  void sendRuntimeMessage({
    type: 'START_TRANSLATION_JOB',
    targetKind: 'youtube-subtitles',
    segments,
  })
    .then((response) => {
      applyImmediateTranslationResponse(response);
    })
    .catch((error) => {
      logDebug('youtube subtitle track lookahead translation failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      segments.forEach((segment) => controller.pendingTrackCueIds.delete(segment.id));
    });
}

function requestRenderedCaptionTranslation(
  controller: RenderedCaptionLiveController,
  sendRuntimeMessage: (message: StartTranslationJobMessage) => Promise<unknown>,
) {
  const text = collectRenderedYoutubeCaptionText();
  if (!text || controller.knownTexts.has(text)) {
    return;
  }

  const cue = createRenderedCaptionCue(text, controller.nextCueIndex);
  controller.nextCueIndex += 1;
  controller.knownTexts.add(text);
  cachedCues = [...cachedCues, cue];
  const cachedTranslation = readCachedTranslation(cue.text);
  if (cachedTranslation) {
    overlayController?.translatedById.set(cue.id, cachedTranslation);
    overlayController?.renderActiveCue();
    logSubtitleTranslated(cue.text, cachedTranslation);
    return;
  }

  overlayController?.renderActiveCue();
  logSubtitleCaptured(cue.text);

  void sendRuntimeMessage({
    type: 'START_TRANSLATION_JOB',
    targetKind: 'youtube-subtitles',
    segments: [{ id: cue.id, text: cue.text }],
  })
    .then((response) => {
      applyImmediateTranslationResponse(response);
    })
    .catch((error) => {
      logDebug('youtube rendered caption live translation failed', {
        id: cue.id,
        message: error instanceof Error ? error.message : String(error),
      });
    });
}

function applyImmediateTranslationResponse(response: unknown) {
  if (
    !response ||
    typeof response !== 'object' ||
    !('type' in response) ||
    response.type !== 'PAGE_TRANSLATION_FINISHED' ||
    !('translated' in response) ||
    !Array.isArray(response.translated)
  ) {
    return;
  }

  const translated: Array<{ id: string; translatedText: string }> = [];
  response.translated.forEach((item) => {
    if (
      item &&
      typeof item === 'object' &&
      'id' in item &&
      'translatedText' in item &&
      typeof item.id === 'string' &&
      typeof item.translatedText === 'string'
    ) {
      overlayController?.translatedById.set(item.id, item.translatedText);
      translated.push({ id: item.id, translatedText: item.translatedText });
      const cue = cachedCues.find((candidate) => candidate.id === item.id);
      if (cue) {
        logSubtitleTranslated(cue.text, item.translatedText);
      }
    }
  });
  rememberTranslatedCueText(translated);
  overlayController?.renderActiveCue();
}

function logSubtitleCaptured(originalText: string) {
  logDebug('youtube subtitle captured', { originalText });
}

function logSubtitleTranslated(originalText: string, translatedText: string) {
  logDebug('youtube subtitle translated', { originalText, translatedText });
}

function rememberTranslatedCueText(translated: Array<{ id: string; translatedText: string }>) {
  translated.forEach((item) => {
    const cue = cachedCues.find((candidate) => candidate.id === item.id);
    if (!cue || !item.translatedText) {
      return;
    }

    translatedTextBySourceText.set(createSourceTextCacheKey(cue.text), item.translatedText);
  });
}

function readCachedTranslation(sourceText: string): string {
  return translatedTextBySourceText.get(createSourceTextCacheKey(sourceText)) ?? '';
}

function createSourceTextCacheKey(sourceText: string): string {
  return normalizeRenderedCaptionText(sourceText).toLowerCase();
}

function createRenderedCaptionCue(text: string, index: number): YoutubeSubtitleCue {
  const nowMs = Math.max(0, Math.round((document.querySelector('video')?.currentTime ?? 0) * 1000));
  return {
    id: `${RENDERED_CUE_PREFIX}${index}`,
    text,
    startMs: Math.max(0, nowMs - 500),
    endMs: nowMs + 60000,
  };
}

function hasRenderedCaptionCues(): boolean {
  return cachedCues.some((cue) => cue.id.startsWith(RENDERED_CUE_PREFIX));
}

function getNextRenderedCueIndex(): number {
  return (
    Math.max(
      -1,
      ...cachedCues.map((cue) => {
        const match = new RegExp(`^${RENDERED_CUE_PREFIX}(\\d+)$`).exec(cue.id);
        return match ? Number.parseInt(match[1], 10) : -1;
      }),
    ) + 1
  );
}

function stopRenderedCaptionLiveTranslation() {
  if (!liveCaptionController) {
    return;
  }

  liveCaptionController.observer.disconnect();
  if (liveCaptionController.timer !== undefined) {
    window.clearTimeout(liveCaptionController.timer);
  }
  liveCaptionController = null;
}

function collectRenderedYoutubeCaptionText(): string {
  const segmentText = collectCaptionTextFromSelector('.ytp-caption-segment');
  if (segmentText) {
    return segmentText;
  }

  return collectCaptionTextFromSelector(
    [
      '.ytp-caption-window-container .caption-visual-line',
      '.ytp-caption-window-container .captions-text',
      '.ytp-caption-window-container .caption-window',
      '.ytp-caption-window-container',
    ].join(','),
  );
}

function collectCaptionTextFromSelector(selector: string): string {
  const lines = Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter(isUsableCaptionElement)
    .map((node) => normalizeRenderedCaptionText(node.textContent ?? ''))
    .filter(Boolean);

  return Array.from(new Set(lines)).join(' ').trim();
}

function isUsableCaptionElement(element: HTMLElement): boolean {
  if (element.closest('[data-youtube-subtitle-overlay]')) {
    return false;
  }

  if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function normalizeRenderedCaptionText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureOverlayStyles() {
  if (document.getElementById(OVERLAY_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    [data-youtube-subtitle-overlay] {
      position: absolute;
      left: 50%;
      z-index: 2147483647;
      transform: translateX(-50%);
      max-width: min(86%, 920px);
      padding: 8px 14px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.72);
      color: #fff;
      font: 600 18px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
      pointer-events: none;
    }

    [data-youtube-subtitle-overlay][data-empty="true"] {
      display: none;
    }

    [data-youtube-subtitle-overlay][data-display-style="overlay-bottom"] {
      bottom: 14%;
    }

    [data-youtube-subtitle-overlay][data-display-style="overlay-top"] {
      top: 12%;
    }

    html[${OVERLAY_ACTIVE_ATTR}="true"] .ytp-caption-window-container,
    html[${OVERLAY_ACTIVE_ATTR}="true"] .caption-window {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      overflow: hidden !important;
      clip-path: inset(50%) !important;
      pointer-events: none !important;
    }

    .immersive-youtube-subtitle__original {
      font-size: 14px;
      opacity: 0.82;
    }

    .immersive-youtube-subtitle__translated {
      font-size: 18px;
    }
  `;
  document.head.appendChild(style);
}
