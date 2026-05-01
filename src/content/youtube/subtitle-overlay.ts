import type { DisplayMode } from '../../shared/types';
import type { SubtitleDisplayStyle } from '../../shared/types';

export type YoutubeSubtitleCue = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
};

const OVERLAY_STYLE_ID = 'immersive-ai-translate-youtube-subtitle-style';
let cachedCues: YoutubeSubtitleCue[] = [];
let overlayController: {
  displayMode: DisplayMode;
  displayStyle: SubtitleDisplayStyle;
  overlay: HTMLElement;
  translatedById: Map<string, string>;
  video: HTMLVideoElement | null;
  renderActiveCue: () => void;
} | null = null;

export function cacheYoutubeSubtitleCues(cues: YoutubeSubtitleCue[]) {
  cachedCues = cues;
  overlayController?.renderActiveCue();
}

export function renderYoutubeSubtitleOverlay(
  translated: Array<{ id: string; translatedText: string }>,
  displayMode: DisplayMode,
  displayStyle: SubtitleDisplayStyle = 'overlay-bottom',
) {
  ensureOverlayStyles();

  const translatedById = new Map(translated.map((item) => [item.id, item.translatedText]));
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
    overlayController.translatedById = translatedById;
    overlayController.renderActiveCue();
    return;
  }

  const controller = {
    displayMode,
    displayStyle,
    overlay,
    translatedById,
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
