import {
  type ApplyPageTranslationMessage,
  type ApplyTranslationResultMessage,
  type CollectPageSegmentsMessage,
  type PageTranslationFailedMessage,
  type PageTranslationFinishedMessage,
  type SetDisplayModeMessage,
  type StartPageTranslationMessage,
} from '../shared/messages';
import type { ExtensionSettings } from '../shared/types';
import { loadSettings } from '../storage/settings';
import { extractSegments } from './dom-extractor';
import { mountFloatingBall } from './floating-ball';
import { applyTranslations, setDisplayMode } from './segment-renderer';

const DEBUG_PREFIX = '[Immersive AI Translate]';

type IncomingMessage =
  | CollectPageSegmentsMessage
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
    message: StartPageTranslationMessage,
  ) => Promise<void | PageTranslationFinishedMessage | PageTranslationFailedMessage>;
};

function logDebug(message: string, details?: Record<string, unknown>) {
  console.log(DEBUG_PREFIX, message, details ?? {});
}

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
  const settings = await loadSettings();
  logDebug('content translation initialized', {
    autoTranslateOnLoad: settings.autoTranslateOnLoad,
    displayMode: settings.displayMode,
    providerId: settings.providerId,
  });
  const controller = mountFloatingBall(root, {
    sendRuntimeMessage,
  });

  if (settings.autoTranslateOnLoad) {
    logDebug('auto translate on load starting');
    await controller.startTranslation();
  }

  return controller;
}

let contentController: ContentController | null = null;

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
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
    logDebug('content message received', { type: message.type });

    if (message.type === 'COLLECT_PAGE_SEGMENTS') {
      const segments = extractSegments(document.body);
      logDebug('content collected page segments', { segmentCount: segments.length });
      sendResponse(segments);
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
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });
}
