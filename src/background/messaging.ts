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

type MessageHandlerDependencies = {
  sendMessageToTab: (
    tabId: number,
    message: CollectPageSegmentsMessage | ApplyPageTranslationMessage,
  ) => Promise<SourceSegment[] | void>;
  translatePage: (
    segments: SourceSegment[],
    context: TranslateContext,
  ) => Promise<TranslationResult>;
  loadSettings: () => Promise<ExtensionSettings>;
};

export function createMessageHandler({
  sendMessageToTab,
  translatePage,
  loadSettings,
}: MessageHandlerDependencies) {
  return async function handleMessage(
    message: StartPageTranslationMessage | { type: string },
  ): Promise<PageTranslationFinishedMessage> {
    if (message.type !== 'START_PAGE_TRANSLATION') {
      throw new Error(`Unsupported message: ${message.type}`);
    }

    const settings = await loadSettings();
    const segments = await sendMessageToTab(message.tabId, { type: 'COLLECT_PAGE_SEGMENTS' });
    const translationResult = await translatePage(segments as SourceSegment[], {
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
