import {
  type ApplyPageTranslationMessage,
  type ApplyTranslationResultMessage,
  type CollectPageSegmentsMessage,
  type CollectYoutubeSubtitleSegmentsMessage,
  type PageTranslationFailedMessage,
  type PageTranslationFinishedMessage,
  type SetDisplayModeMessage,
  type StartPageTranslationMessage,
  type StartTranslationJobMessage,
  type TranslationJobRedirectedMessage,
} from '../shared/messages';
import type { ExtensionSettings } from '../shared/types';
import { loadSettings } from '../storage/settings';
import { configureRuntimeDebugLogging, logDebug } from '../shared/debug';
import { cleanAds, startAdCleaner } from './ad-cleaner';
import { extractSegments } from './dom-extractor';
import { mountFloatingBall } from './floating-ball';
import { applyTranslations, setDisplayMode } from './segment-renderer';
import { collectYoutubeSubtitleSegments } from './youtube/subtitle-source';
import {
  renderYoutubeSubtitleOverlay,
  updateYoutubeSubtitleOverlayDisplayMode,
} from './youtube/subtitle-overlay';

const AUTO_TRANSLATE_SETTLE_MS = 500;

type IncomingMessage =
  | CollectPageSegmentsMessage
  | CollectYoutubeSubtitleSegmentsMessage
  | ApplyPageTranslationMessage
  | ApplyTranslationResultMessage
  | SetDisplayModeMessage
  | { type: string };

type ContentController = {
  markTranslated: () => void;
};

type InitializeContentTranslationDependencies = {
  loadSettings: () => Promise<ExtensionSettings>;
  sendRuntimeMessage: (
    message: StartPageTranslationMessage | StartTranslationJobMessage,
  ) => Promise<
    void | PageTranslationFinishedMessage | PageTranslationFailedMessage | TranslationJobRedirectedMessage
  >;
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

export async function initializeContentTranslation(
  root: HTMLElement,
  { loadSettings, sendRuntimeMessage }: InitializeContentTranslationDependencies,
): Promise<ContentController> {
  logDebug('content initialization starting', {
    url: window.location.href,
    readyState: document.readyState,
  });
  const settings = await loadSettings();
  configureRuntimeDebugLogging(settings.debugLoggingEnabled);
  startAdCleaner(root);
  logDebug('content settings loaded', {
    autoTranslateOnLoad: settings.autoTranslateOnLoad,
    displayMode: settings.displayMode,
    providerId: settings.providerId,
    enablePdfDocumentTranslation: settings.enablePdfDocumentTranslation,
    enableYoutubeSubtitleTranslation: settings.enableYoutubeSubtitleTranslation,
    debugLoggingEnabled: settings.debugLoggingEnabled,
  });

  const controller = mountFloatingBall(root, {
    sendRuntimeMessage,
  });
  logDebug('content floating ball mounted', {
    autoTranslateOnLoad: settings.autoTranslateOnLoad,
  });

  if (settings.autoTranslateOnLoad) {
    logDebug('content auto translate scheduling enabled');
    startAutoTranslationWhenReady(root, sendRuntimeMessage);
    return controller;
  }

  logDebug('content waiting for floating ball trigger');
  return controller;
}

export function collectPageSegments(root: HTMLElement): Array<{ id: string; text: string }> {
  cleanAds(root);
  return extractSegments(root);
}

function startAutoTranslationWhenReady(
  root: HTMLElement,
  sendRuntimeMessage: InitializeContentTranslationDependencies['sendRuntimeMessage'],
) {
  logDebug('auto translate wait pipeline starting', {
    readyState: document.readyState,
  });
  void waitForDocumentLoaded()
    .then(() => {
      logDebug('auto translate document ready');
      return waitForTranslatableContent(root);
    })
    .then(() => {
      logDebug('auto translate content ready', {
        segmentCount: collectPageSegments(root).length,
      });
    })
    .then(() => {
      window.setTimeout(() => {
        logDebug('auto translate on load starting', {
          segmentCount: collectPageSegments(root).length,
        });
        void sendRuntimeMessage({ type: 'START_PAGE_TRANSLATION' });
      }, AUTO_TRANSLATE_SETTLE_MS);
    });
}

export function getIncomingMessageType(message: unknown): string | null {
  if (
    typeof message !== 'object' ||
    message === null ||
    !('type' in message) ||
    typeof message.type !== 'string'
  ) {
    return null;
  }

  return message.type;
}

function waitForDocumentLoaded(): Promise<void> {
  if (document.readyState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.addEventListener('load', () => resolve(), { once: true });
  });
}

function waitForTranslatableContent(root: HTMLElement): Promise<void> {
  if (collectPageSegments(root).length > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (collectPageSegments(root).length === 0) {
        return;
      }

      observer.disconnect();
      resolve();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

let contentController: ContentController | null = null;

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  window.addEventListener('error', (event) => {
    logDebug('content uncaught error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    logDebug('content unhandled promise rejection', {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  void initializeContentTranslation(document.body, {
    loadSettings,
    sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
  }).then((controller) => {
    contentController = controller;
  }).catch((error) => {
    console.error('Failed to load translation settings for content script.', error);
  });

  chrome.runtime.onMessage.addListener((
    message: IncomingMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    const messageType = getIncomingMessageType(message);
    if (!messageType) {
      logDebug('content ignored malformed runtime message', {
        valueType: typeof message,
        isNull: message === null,
      });
      return false;
    }

    logDebug('content message received', { type: messageType });

    if (messageType === 'COLLECT_PAGE_SEGMENTS') {
      const segments = collectPageSegments(document.body);
      logDebug('content collected page segments', { segmentCount: segments.length });
      sendResponse(segments);
      return true;
    }

    if (messageType === 'COLLECT_YOUTUBE_SUBTITLE_SEGMENTS') {
      const youtubeMessage = message as CollectYoutubeSubtitleSegmentsMessage;
      void collectYoutubeSubtitleSegments(youtubeMessage.preferredLanguage)
        .then((segments) => {
          logDebug('content collected youtube subtitle segments', {
            targetKind: youtubeMessage.target.kind,
            segmentCount: segments.length,
          });
          sendResponse(segments);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }

    if (isApplyPageTranslationMessage(message)) {
      logDebug('content applying legacy page translation result', {
        translatedCount: message.translated.length,
        displayMode: message.displayMode,
      });
      applyTranslations(document.body, message.translated);
      setDisplayMode(document.body, message.displayMode);
      contentController?.markTranslated();
      sendResponse({ ok: true });
      return true;
    }

    if (isApplyTranslationResultMessage(message)) {
      if (message.target.kind === 'youtube-subtitles') {
        renderYoutubeSubtitleOverlay(
          message.translated,
          message.displayMode,
          message.subtitleDisplayStyle,
        );
        sendResponse({ ok: true });
        return true;
      }

      if (message.target.kind !== 'html-page') {
        logDebug('content ignored non-html translation result', {
          targetKind: message.target.kind,
        });
        sendResponse({ ok: false, message: `Unsupported content target: ${message.target.kind}` });
        return true;
      }

      logDebug('content applying html-page translation result', {
        tabId: message.target.tabId,
        translatedCount: message.translated.length,
        displayMode: message.displayMode,
      });
      applyTranslations(document.body, message.translated);
      setDisplayMode(document.body, message.displayMode);
      contentController?.markTranslated();
      sendResponse({ ok: true });
      return true;
    }

    if (isSetDisplayModeMessage(message)) {
      logDebug('content setting display mode', { displayMode: message.displayMode });
      setDisplayMode(document.body, message.displayMode);
      updateYoutubeSubtitleOverlayDisplayMode(message.displayMode);
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });
}
