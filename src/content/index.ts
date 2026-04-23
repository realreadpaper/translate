import {
  type ApplyPageTranslationMessage,
  type CollectPageSegmentsMessage,
  type SetDisplayModeMessage,
} from '../shared/messages';
import { loadSettings } from '../storage/settings';
import { extractSegments } from './dom-extractor';
import { mountFloatingBall } from './floating-ball';
import { applyTranslations, setDisplayMode } from './segment-renderer';

type IncomingMessage =
  | CollectPageSegmentsMessage
  | ApplyPageTranslationMessage
  | SetDisplayModeMessage
  | { type: string };

function isApplyPageTranslationMessage(
  message: IncomingMessage,
): message is ApplyPageTranslationMessage {
  return message.type === 'APPLY_PAGE_TRANSLATION';
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

let floatingBall = mountFloatingBall(document.body, {
  sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message),
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

chrome.runtime.onMessage.addListener((
  message: IncomingMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => {
  if (message.type === 'COLLECT_PAGE_SEGMENTS') {
    tagSegments(document.body);
    sendResponse(extractSegments(document.body));
    return true;
  }

  if (isApplyPageTranslationMessage(message)) {
    applyTranslations(document.body, message.translated);
    setDisplayMode(document.body, message.displayMode);
    floatingBall.markTranslated(message.displayMode);
    sendResponse({ ok: true });
    return true;
  }

  if (isSetDisplayModeMessage(message)) {
    setDisplayMode(document.body, message.displayMode);
    floatingBall.updateDisplayMode(message.displayMode);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
