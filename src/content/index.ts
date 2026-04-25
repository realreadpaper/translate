import {
  type ApplyPageTranslationMessage,
  type ApplyTranslationResultMessage,
  type CollectPageSegmentsMessage,
  type SetDisplayModeMessage,
} from '../shared/messages';
import { loadSettings } from '../storage/settings';
import { extractSegments } from './dom-extractor';
import { mountFloatingBall } from './floating-ball';
import { applyTranslations, setDisplayMode } from './segment-renderer';
import { isYoutubeWatchPage } from './youtube/detect-target';
import { mountYoutubeSubtitleOverlay } from './youtube/subtitle-overlay';
import { collectYoutubeSubtitleCues } from './youtube/subtitle-source';
import { findActiveCue, type SubtitleCue } from './youtube/subtitle-timeline';

type IncomingMessage =
  | CollectPageSegmentsMessage
  | ApplyPageTranslationMessage
  | ApplyTranslationResultMessage
  | SetDisplayModeMessage
  | { type: string };

type YoutubeOverlayController = ReturnType<typeof mountYoutubeSubtitleOverlay> | null;

const youtubeState: {
  cues: SubtitleCue[];
  translatedById: Map<string, string>;
  currentMode: 'bilingual' | 'translated-only' | 'original-only';
  overlay: YoutubeOverlayController;
  listenerAttached: boolean;
} = {
  cues: [],
  translatedById: new Map<string, string>(),
  currentMode: 'bilingual',
  overlay: null,
  listenerAttached: false,
};

function isApplyPageTranslationMessage(
  message: IncomingMessage,
): message is ApplyPageTranslationMessage {
  return message.type === 'APPLY_PAGE_TRANSLATION';
}

function isApplyTranslationResultMessage(
  message: IncomingMessage,
): message is ApplyTranslationResultMessage {
  return message.type === 'APPLY_TRANSLATION_RESULT';
}

function isSetDisplayModeMessage(message: IncomingMessage): message is SetDisplayModeMessage {
  return message.type === 'SET_DISPLAY_MODE';
}

function tagSegments(root: HTMLElement) {
  const elements = Array.from(root.querySelectorAll('h1, h2, h3, p, li, blockquote')).filter(
    (element) => !element.closest('[data-immersive-ignore="true"]'),
  );
  elements.forEach((element, index) => {
    element.setAttribute('data-segment-id', `seg-${index}`);
  });
}

function ensureTaggedSegments(root: HTMLElement) {
  if (root.querySelector('[data-segment-id]')) {
    return;
  }

  tagSegments(root);
}

function isYoutubeSubtitleDocument() {
  return typeof window !== 'undefined' && isYoutubeWatchPage(window.location.href);
}

async function collectCurrentYoutubeSegments() {
  const cues = await collectYoutubeSubtitleCues(document);
  youtubeState.cues = cues;

  return cues.map((cue) => ({
    id: cue.id,
    text: cue.text,
  }));
}

function getCurrentVideoElement() {
  return document.querySelector('video') as HTMLVideoElement | null;
}

function ensureYoutubeOverlay(root: HTMLElement) {
  if (youtubeState.overlay) {
    return youtubeState.overlay;
  }

  youtubeState.overlay = mountYoutubeSubtitleOverlay(root, {
    displayStyle: 'overlay-bottom',
    getOriginalCue: () => {
      const video = getCurrentVideoElement();
      if (!video) {
        return null;
      }

      return findActiveCue(youtubeState.cues, video.currentTime);
    },
    getTranslatedText: (cueId) => youtubeState.translatedById.get(cueId) ?? null,
    getDisplayMode: () => youtubeState.currentMode,
  });

  const video = getCurrentVideoElement();
  if (video && !youtubeState.listenerAttached) {
    const rerender = () => youtubeState.overlay?.render();
    video.addEventListener('timeupdate', rerender);
    video.addEventListener('seeked', rerender);
    youtubeState.listenerAttached = true;
  }

  return youtubeState.overlay;
}

export function createContentMessageHandler({
  root,
  markTranslated,
  updateDisplayMode,
}: {
  root: HTMLElement;
  markTranslated: (mode: 'bilingual' | 'translated-only' | 'original-only') => void;
  updateDisplayMode: (mode: 'bilingual' | 'translated-only' | 'original-only') => void;
}) {
  return (message: IncomingMessage, sendResponse: (response?: unknown) => void) => {
    if (message.type === 'COLLECT_PAGE_SEGMENTS') {
      if (isYoutubeSubtitleDocument()) {
        void collectCurrentYoutubeSegments().then(sendResponse);
        return true;
      }

      tagSegments(root);
      sendResponse(extractSegments(root));
      return true;
    }

    if (isApplyPageTranslationMessage(message)) {
      ensureTaggedSegments(root);
      applyTranslations(root, message.translated);
      setDisplayMode(root, message.displayMode);
      markTranslated(message.displayMode);
      updateDisplayMode(message.displayMode);
      sendResponse({ ok: true });
      return true;
    }

    if (isApplyTranslationResultMessage(message) && message.target.kind === 'html-page') {
      ensureTaggedSegments(root);
      applyTranslations(root, message.translated);
      setDisplayMode(root, message.displayMode);
      markTranslated(message.displayMode);
      updateDisplayMode(message.displayMode);
      sendResponse({ ok: true });
      return true;
    }

    if (isApplyTranslationResultMessage(message) && message.target.kind === 'youtube-subtitles') {
      youtubeState.currentMode = message.displayMode;
      youtubeState.translatedById = new Map(
        message.translated.map((segment) => [segment.id, segment.translatedText]),
      );
      const overlay = ensureYoutubeOverlay(root);
      overlay.render();
      markTranslated(message.displayMode);
      updateDisplayMode(message.displayMode);
      sendResponse({ ok: true });
      return true;
    }

    if (isSetDisplayModeMessage(message)) {
      setDisplayMode(root, message.displayMode);
      youtubeState.currentMode = message.displayMode;
      youtubeState.overlay?.render();
      updateDisplayMode(message.displayMode);
      sendResponse({ ok: true });
      return true;
    }

    return false;
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  const floatingBall = mountFloatingBall(document.body, {
    sendRuntimeMessage: (message) =>
      chrome.runtime.sendMessage({
        ...message,
        type: message.type === 'START_PAGE_TRANSLATION' ? 'START_TRANSLATION_JOB' : message.type,
      }),
    openOptionsPage: () => chrome.runtime.openOptionsPage(),
  });

  void loadSettings()
    .then((settings) => {
      if (!settings.autoTranslateOnLoad) {
        return;
      }
      void floatingBall.startTranslation();
    })
    .catch((error) => {
      console.error('Failed to load translation settings for content script.', error);
    });

  const handleMessage = createContentMessageHandler({
    root: document.body,
    markTranslated: (mode) => floatingBall.markTranslated(mode),
    updateDisplayMode: (mode) => floatingBall.updateDisplayMode(mode),
  });

  chrome.runtime.onMessage.addListener((
    message: IncomingMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => handleMessage(message, sendResponse));
}
