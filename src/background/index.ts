import { createMessageHandler } from './messaging';
import { createPdfContextMenuController } from './pdf-context-menu';
import { createPdfWorkspaceOpener, createPdfWorkspaceUrl } from './pdf-workspace';
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
  CollectYoutubeSubtitleSegmentsMessage,
  OpenPdfWorkspaceMessage,
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
  (
    tabId: number,
    message: CollectYoutubeSubtitleSegmentsMessage,
  ): Promise<Array<{ id: string; text: string }>>;
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
    contentKind?: 'html-page' | 'pdf-document' | 'youtube-subtitles';
  },
) {
  logDebug('background translation provider dispatch', {
    providerId: context.providerId,
    sourceLanguage: context.sourceLanguage,
    targetLanguage: context.targetLanguage,
    segmentCount: segments.length,
  });

  switch (context.providerId) {
    case 'openai-compatible': {
      const provider = getProvider('openai-compatible');
      const settings = context.providerSettings as OpenAICompatibleProviderSettings;
      const validation = provider.validateConfig(settings);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      const result = await translatePageSegments(
        segments,
        context,
        (request) => provider.translateSegments(request, settings, postJson),
        DEFAULT_PAGE_TRANSLATION_BATCH_SIZE,
      );
      logDebug('background translation provider completed', {
        providerId: context.providerId,
        status: result.status,
        translatedCount: result.translated.length,
        failedBatchCount: result.failedBatches.length,
      });
      return result;
    }
    case 'deepseek': {
      const provider = getProvider('deepseek');
      const settings = context.providerSettings as DeepSeekProviderSettings;
      const validation = provider.validateConfig(settings);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      const result = await translatePageSegments(
        segments,
        context,
        (request) => provider.translateSegments(request, settings, postJson),
        DEFAULT_PAGE_TRANSLATION_BATCH_SIZE,
      );
      logDebug('background translation provider completed', {
        providerId: context.providerId,
        status: result.status,
        translatedCount: result.translated.length,
        failedBatchCount: result.failedBatches.length,
      });
      return result;
    }
    case 'traditional': {
      const provider = getProvider('traditional');
      const settings = context.providerSettings as TraditionalProviderSettings;
      const validation = provider.validateConfig(settings);
      if (!validation.ok) {
        throw new Error(validation.message);
      }

      const result = await translatePageSegments(
        segments,
        context,
        (request) => provider.translateSegments(request, settings, postJson),
        DEFAULT_PAGE_TRANSLATION_BATCH_SIZE,
      );
      logDebug('background translation provider completed', {
        providerId: context.providerId,
        status: result.status,
        translatedCount: result.translated.length,
        failedBatchCount: result.failedBatches.length,
      });
      return result;
    }
  }
}

function sendMessageToTab(
  tabId: number,
  message: CollectPageSegmentsMessage,
): Promise<Array<{ id: string; text: string }>>;
function sendMessageToTab(
  tabId: number,
  message: CollectYoutubeSubtitleSegmentsMessage,
): Promise<Array<{ id: string; text: string }>>;
function sendMessageToTab(tabId: number, message: ApplyPageTranslationMessage): Promise<void>;
function sendMessageToTab(tabId: number, message: ApplyTranslationResultMessage): Promise<void>;
function sendMessageToTab(tabId: number, message: SetDisplayModeMessage): Promise<void>;
function sendMessageToTab(
  tabId: number,
  message:
    | CollectPageSegmentsMessage
    | CollectYoutubeSubtitleSegmentsMessage
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
  const target = await detectTranslationTarget(tab, requestedKind, {
    getContentType: getUrlContentType,
  });
  logDebug('detected translation target', {
    tabId,
    requestedKind,
    targetKind: target.kind,
    url: target.url,
  });
  return target;
}

async function getUrlContentType(url: string): Promise<string> {
  const response = await fetch(url, { method: 'HEAD' });
  return response.headers.get('content-type') ?? '';
}

const openPdfWorkspace = createPdfWorkspaceOpener({
  getExtensionUrl: (path) => chrome.runtime.getURL(path),
  createTab: (properties) => chrome.tabs.create(properties),
});

async function openPdfWorkspaceInCurrentTab(
  target: TranslationTarget,
): Promise<number> {
  if (target.kind !== 'pdf-document') {
    throw new Error(`Unsupported PDF workspace target: ${target.kind}`);
  }

  const tab = await chrome.tabs.update(target.tabId, {
    active: true,
    url: createPdfWorkspaceUrl(
      {
        sourceUrl: target.url,
        displayName: target.displayName,
        sourceKind: target.sourceKind,
      },
      (path) => chrome.runtime.getURL(path),
    ),
  });

  if (typeof tab?.id !== 'number') {
    throw new Error('PDF workspace tab id is unavailable.');
  }

  return tab.id;
}

async function ensureYoutubeAudioOffscreenDocument() {
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('src/offscreen/audio-capture.html'),
    reasons: ['USER_MEDIA'],
    justification: 'Capture YouTube tab audio for ASR fallback after user starts translation.',
  });
}

const handler = createMessageHandler({
  sendMessageToTab,
  translatePage,
  loadSettings,
  detectTarget,
  openPdfWorkspace,
  debugLog: logDebug,
});

const pdfContextMenuController = createPdfContextMenuController({
  createMenu: (properties) => chrome.contextMenus.create(properties),
  detectTarget: (tab) =>
    detectTranslationTarget(tab, undefined, {
      getContentType: getUrlContentType,
    }),
  openPdfWorkspace,
  debugLog: logDebug,
});

chrome.contextMenus.removeAll(() => {
  pdfContextMenuController.install();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void pdfContextMenuController.handleClicked(info, tab).catch((error) => {
    logDebug('pdf context menu failed', {
      tabId: tab?.id,
      pageUrl: info.pageUrl,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  });
});

function isSetDisplayModeMessage(message: unknown): message is SetDisplayModeMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'SET_DISPLAY_MODE'
  );
}

function isOpenPdfWorkspaceMessage(message: unknown): message is OpenPdfWorkspaceMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'OPEN_PDF_WORKSPACE'
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

  if (isOpenPdfWorkspaceMessage(message)) {
    const tabId = typeof message.tabId === 'number' ? message.tabId : sender.tab?.id;
    if (typeof tabId !== 'number') {
      sendResponse({
        type: 'PAGE_TRANSLATION_FAILED',
        message: 'Active tab id is unavailable.',
      });
      return true;
    }

    chrome.tabs.get(tabId)
      .then((tab) => pdfContextMenuController.openFromTab(tab))
      .then(() => {
        sendResponse({ type: 'TRANSLATION_JOB_STARTED' });
      })
      .catch((error) => {
        sendResponse({
          type: 'PAGE_TRANSLATION_FAILED',
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
