import type { ExtensionSettings } from '../shared/types';
import type {
  ApplyPageTranslationMessage,
  CollectPageSegmentsMessage,
  PageTranslationFinishedMessage,
  StartPageTranslationMessage,
} from '../shared/messages';

type SourceSegment = { id: string; text: string };

type TranslationResult = {
  status: 'success' | 'partial-success';
  translated: Array<{ id: string; translatedText: string }>;
  failedBatches: Array<{ segmentIds: string[]; message: string }>;
};

type TranslateContext = {
  providerId: ExtensionSettings['providerId'];
  sourceLanguage: string;
  targetLanguage: string;
  providerSettings: ExtensionSettings['providers'][ExtensionSettings['providerId']];
};

type SendMessageToTab = {
  (tabId: number, message: CollectPageSegmentsMessage): Promise<SourceSegment[]>;
  (tabId: number, message: ApplyPageTranslationMessage): Promise<void>;
};

type MessageHandlerDependencies = {
  sendMessageToTab: SendMessageToTab;
  translatePage: (
    segments: SourceSegment[],
    context: TranslateContext,
  ) => Promise<TranslationResult>;
  loadSettings: () => Promise<ExtensionSettings>;
};

type IncomingMessage = StartPageTranslationMessage | { type: string };

function isStartPageTranslationMessage(
  message: IncomingMessage,
): message is StartPageTranslationMessage {
  return message.type === 'START_PAGE_TRANSLATION';
}

function hasTabId(
  message: StartPageTranslationMessage,
): message is StartPageTranslationMessage & { tabId: number } {
  return typeof message.tabId === 'number';
}

export function createMessageHandler({
  sendMessageToTab,
  translatePage,
  loadSettings,
}: MessageHandlerDependencies) {
  return async function handleMessage(
    message: IncomingMessage,
  ): Promise<PageTranslationFinishedMessage> {
    if (!isStartPageTranslationMessage(message)) {
      throw new Error(`Unsupported message: ${message.type}`);
    }

    if (!hasTabId(message)) {
      throw new Error('Tab id is required for page translation.');
    }

    const settings = await loadSettings();
    const segments = await sendMessageToTab(message.tabId, { type: 'COLLECT_PAGE_SEGMENTS' });
    const translationResult = await translatePage(segments, {
      providerId: settings.providerId,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      providerSettings: settings.providers[settings.providerId],
    });

    await sendMessageToTab(message.tabId, {
      type: 'APPLY_PAGE_TRANSLATION',
      translated: translationResult.translated,
      displayMode: settings.displayMode,
    });

    return {
      type: 'PAGE_TRANSLATION_FINISHED',
      status: translationResult.status,
      translated: translationResult.translated,
      failedBatches: translationResult.failedBatches,
    };
  };
}
