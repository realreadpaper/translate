import type { DisplayMode } from '../../shared/types';
import type { SubtitleDisplayStyle } from '../../shared/types';
import type { StartTranslationJobMessage } from '../../shared/messages';
import {
  createSourceTextCacheKey,
  createYoutubePrefetchBatches,
} from './prefetch-queue';

export type YoutubeSubtitleCue = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
};

const OVERLAY_STYLE_ID = 'immersive-ai-translate-youtube-subtitle-style';
let cachedCues: YoutubeSubtitleCue[] = [];
let translatedTextBySourceText = new Map<string, string>();
let overlayController: {
  displayMode: DisplayMode;
  displayStyle: SubtitleDisplayStyle;
  overlay: HTMLElement;
  translatedById: Map<string, string>;
  pendingTrackCueIds: Set<string>;
  video: HTMLVideoElement | null;
  renderActiveCue: () => void;
} | null = null;

export function cacheYoutubeSubtitleCues(cues: YoutubeSubtitleCue[]) {
  cachedCues = cues;
  translatedTextBySourceText = new Map();
  overlayController?.renderActiveCue();
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

  const translatedById = new Map(translated.map((item) => [item.id, item.translatedText]));
  rememberTranslatedCueText(translated);
  const host = findPlayerContainer();
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
    translatedById.forEach((translatedText, id) => {
      overlayController?.translatedById.set(id, translatedText);
      overlayController?.pendingTrackCueIds.delete(id);
    });
    overlayController.renderActiveCue();
    requestTrackPrefetchTranslation(overlayController, options.sendRuntimeMessage);
    return;
  }

  const controller = {
    displayMode,
    displayStyle,
    overlay,
    translatedById,
    pendingTrackCueIds: new Set<string>(),
    video,
    renderActiveCue() {
      if (!controller.video) {
        return;
      }

      const nowMs = controller.video.currentTime * 1000;
      const cue = cachedCues.find((item) => nowMs >= item.startMs && nowMs <= item.endMs);
      if (!cue) {
        controller.overlay.textContent = '';
        controller.overlay.dataset.empty = 'true';
        return;
      }

      controller.overlay.dataset.empty = 'false';
      controller.overlay.dataset.displayStyle = controller.displayStyle;
      const translatedText = controller.translatedById.get(cue.id) ?? '';
      controller.overlay.replaceChildren(
        ...createCueNodes(cue.text, translatedText, controller.displayMode),
      );
    },
  };

  overlayController = controller;
  controller.renderActiveCue();
  video?.addEventListener('timeupdate', controller.renderActiveCue);
  video?.addEventListener('seeked', controller.renderActiveCue);
  requestTrackPrefetchTranslation(controller, options.sendRuntimeMessage);
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

  if (displayMode !== 'original-only') {
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

function requestTrackPrefetchTranslation(
  controller: NonNullable<typeof overlayController>,
  sendRuntimeMessage?: (message: StartTranslationJobMessage) => Promise<unknown>,
) {
  if (!sendRuntimeMessage || !controller.video) {
    return;
  }

  const nowMs = Math.max(0, Math.round(controller.video.currentTime * 1000));
  const batches = createYoutubePrefetchBatches({
    cues: cachedCues,
    nowMs,
    translatedIds: new Set(controller.translatedById.keys()),
    pendingIds: controller.pendingTrackCueIds,
    translatedTextBySourceText,
  });

  batches.forEach((batch) => {
    batch.segments.forEach((segment) => controller.pendingTrackCueIds.add(segment.id));
    void sendRuntimeMessage({
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: batch.segments,
    })
      .then((response) => {
        applyImmediateTranslationResponse(response);
      })
      .finally(() => {
        batch.segments.forEach((segment) => controller.pendingTrackCueIds.delete(segment.id));
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
    }
  });
  rememberTranslatedCueText(translated);
  overlayController?.renderActiveCue();
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
