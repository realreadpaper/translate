import { createMessageHandler } from './messaging';
import { testProviderConnection } from './providers/connection';
import { getProvider } from './providers/registry';
import { postJson } from './providers/transport';
import { detectTranslationTarget } from './targets/detect-target';
import { translatePageSegments } from './translator/translate-page';
import { loadSettings } from '../storage/settings';
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
  DeepSeekProviderSettings,
  OpenAICompatibleProviderSettings,
  TraditionalProviderSettings,
} from '../shared/types';
import type { TranslationTarget } from '../shared/translation-target';

const DEFAULT_BATCH_SIZE = 20;

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
        DEFAULT_BATCH_SIZE,
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
        DEFAULT_BATCH_SIZE,
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
        DEFAULT_BATCH_SIZE,
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

const handler = createMessageHandler({
  sendMessageToTab,
  translatePage,
  loadSettings,
  detectTarget: async (tabId) => {
    const tab = await chrome.tabs.get(tabId);
    return detectTranslationTarget(tab);
  },
  openPdfWorkspace: async (target, settings) => openPdfTranslationWorkspace(target, settings),
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

async function openPdfTranslationWorkspace(
  target: TranslationTarget,
  _settings: {
    targetLanguage: string;
  },
) {
  if (target.kind !== 'pdf-document') {
    throw new Error('PDF workspace can only be opened for pdf-document targets.');
  }

  const url = chrome.runtime.getURL(`src/pdf-viewer/index.html?source=${encodeURIComponent(target.url)}`);
  const createdTab = await chrome.tabs.create({ url });
  return createdTab.id ?? -1;
}
