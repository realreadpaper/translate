import { createMessageHandler } from './messaging';
import { detectTranslationTarget } from './targets/detect-target';
import { testProviderConnection } from './providers/connection';
import { getProvider } from './providers/registry';
import { postJson } from './providers/transport';
import { DEFAULT_PAGE_TRANSLATION_BATCH_SIZE } from './translator/config';
import { translatePageSegments } from './translator/translate-page';
import { loadSettings } from '../storage/settings';
import { logDebug } from '../shared/debug';
import type {
  ApplyPageTranslationMessage,
  ApplyTranslationResultMessage,
  CollectPageSegmentsMessage,
  StartPageTranslationMessage,
  StartTranslationJobMessage,
  SetDisplayModeMessage,
  TestProviderConnectionMessage,
} from '../shared/messages';
import type {
  TranslationTarget,
  TranslationTargetKind,
} from '../shared/translation-target';
import type {
  DeepSeekProviderSettings,
  OpenAICompatibleProviderSettings,
  TraditionalProviderSettings,
} from '../shared/types';

type SendMessageToTab = {
  (tabId: number, message: CollectPageSegmentsMessage): Promise<Array<{ id: string; text: string }>>;
  (tabId: number, message: ApplyPageTranslationMessage): Promise<void>;
  (tabId: number, message: ApplyTranslationResultMessage): Promise<void>;
  (tabId: number, message: SetDisplayModeMessage): Promise<void>;
};

async function translatePage(
  segments: Array<{ id: string; text: string }>,
  context: {
    providerId: 'openai-compatible' | 'deepseek' | 'traditional';
    sourceLanguage: string;
    targetLanguage: string;
    providerSettings:
      | OpenAICompatibleProviderSettings
      | DeepSeekProviderSettings
      | TraditionalProviderSettings;
  },
) {
  switch (context.providerId) {
    case 'openai-compatible': {
      const provider = getProvider('openai-compatible');
      const settings = context.providerSettings as OpenAICompatibleProviderSettings;
      const validation = provider.validateConfig(settings);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      return translatePageSegments(
        segments,
        context,
        (request) => provider.translateSegments(request, settings, postJson),
        DEFAULT_PAGE_TRANSLATION_BATCH_SIZE,
      );
    }
    case 'deepseek': {
      const provider = getProvider('deepseek');
      const settings = context.providerSettings as DeepSeekProviderSettings;
      const validation = provider.validateConfig(settings);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      return translatePageSegments(
        segments,
        context,
        (request) => provider.translateSegments(request, settings, postJson),
        DEFAULT_PAGE_TRANSLATION_BATCH_SIZE,
      );
    }
    case 'traditional': {
      const provider = getProvider('traditional');
      const settings = context.providerSettings as TraditionalProviderSettings;
      const validation = provider.validateConfig(settings);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      return translatePageSegments(
        segments,
        context,
        (request) => provider.translateSegments(request, settings, postJson),
        DEFAULT_PAGE_TRANSLATION_BATCH_SIZE,
      );
    }
  }
}

function sendMessageToTab(
  tabId: number,
  message: CollectPageSegmentsMessage,
): Promise<Array<{ id: string; text: string }>>;
function sendMessageToTab(tabId: number, message: ApplyPageTranslationMessage): Promise<void>;
function sendMessageToTab(tabId: number, message: ApplyTranslationResultMessage): Promise<void>;
function sendMessageToTab(tabId: number, message: SetDisplayModeMessage): Promise<void>;
function sendMessageToTab(
  tabId: number,
  message:
    | CollectPageSegmentsMessage
    | ApplyPageTranslationMessage
    | ApplyTranslationResultMessage
    | SetDisplayModeMessage,
) {
  return chrome.tabs.sendMessage(tabId, message) as Promise<
    Array<{ id: string; text: string }> | void
  >;
}

async function detectTarget(
  tabId: number,
  requestedKind?: TranslationTargetKind,
): Promise<TranslationTarget> {
  const tab = await chrome.tabs.get(tabId);
  const target = await detectTranslationTarget(tab, requestedKind);
  logDebug('detected translation target', {
    tabId,
    requestedKind,
    targetKind: target.kind,
    url: target.url,
  });
  return target;
}

async function openPdfWorkspace(target: TranslationTarget): Promise<number> {
  logDebug('pdf workspace placeholder invoked', {
    tabId: target.tabId,
    targetKind: target.kind,
  });
  return target.tabId;
}

const handler = createMessageHandler({
  sendMessageToTab,
  translatePage,
  loadSettings,
  detectTarget,
  openPdfWorkspace,
  debugLog: logDebug,
});

function isSetDisplayModeMessage(message: unknown): message is SetDisplayModeMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'SET_DISPLAY_MODE'
  );
}

function isStartPageTranslationMessage(message: unknown): message is StartPageTranslationMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'START_PAGE_TRANSLATION'
  );
}

function isStartTranslationJobMessage(message: unknown): message is StartTranslationJobMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'START_TRANSLATION_JOB'
  );
}

function isTestProviderConnectionMessage(
  message: unknown,
): message is TestProviderConnectionMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'TEST_PROVIDER_CONNECTION'
  );
}

chrome.runtime.onMessage.addListener((
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof message.type === 'string'
  ) {
    logDebug('runtime message received', {
      type: message.type,
      senderTabId: sender.tab?.id,
      messageTabId: 'tabId' in message ? message.tabId : undefined,
    });
  }

  if (
    (isStartPageTranslationMessage(message) || isStartTranslationJobMessage(message)) &&
    typeof message.tabId !== 'number'
  ) {
    if (typeof sender.tab?.id !== 'number') {
      sendResponse({
        type: 'PAGE_TRANSLATION_FAILED',
        message: 'Active tab id is unavailable.',
      });
      return true;
    }

    handler({
      ...message,
      tabId: sender.tab.id,
    })
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          type: 'PAGE_TRANSLATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  }

  if (isTestProviderConnectionMessage(message)) {
    testProviderConnection(
      message.providerId,
      message.providerSettings as never,
      postJson,
    )
      .then((result) => {
        sendResponse({
          type: 'TEST_PROVIDER_CONNECTION_RESULT',
          ...result,
        });
      })
      .catch((error) => {
        sendResponse({
          type: 'TEST_PROVIDER_CONNECTION_RESULT',
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  }

  if (isSetDisplayModeMessage(message)) {
    const tabId = typeof message.tabId === 'number' ? message.tabId : sender.tab?.id;
    if (typeof tabId !== 'number') {
      sendResponse({
        ok: false,
        message: 'Active tab id is unavailable.',
      });
      return true;
    }

    chrome.tabs.sendMessage(tabId, {
      ...message,
      tabId,
    }).then(sendResponse).catch((error) => {
      sendResponse({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    });

    return true;
  }

  handler(message as { type: string })
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        type: 'PAGE_TRANSLATION_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
    });

  return true;
});
