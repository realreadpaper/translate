import type { ExtensionSettings } from '../shared/types';
import type {
  ApplyPageTranslationMessage,
  ApplyTranslationResultMessage,
  CollectPageSegmentsMessage,
  TranslationJobResponseMessage,
  StartPageTranslationMessage,
  StartTranslationJobMessage,
} from '../shared/messages';
import type { TranslationTarget } from '../shared/translation-target';

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
  (tabId: number, message: ApplyTranslationResultMessage): Promise<void>;
};

type MessageHandlerDependencies = {
  sendMessageToTab: SendMessageToTab;
  translatePage: (
    segments: SourceSegment[],
    context: TranslateContext,
  ) => Promise<TranslationResult>;
  loadSettings: () => Promise<ExtensionSettings>;
  detectTarget: (tabId: number) => Promise<TranslationTarget>;
  openPdfWorkspace: (target: TranslationTarget, settings: ExtensionSettings) => Promise<number>;
};

type IncomingMessage = StartPageTranslationMessage | StartTranslationJobMessage | { type: string };

function isStartPageTranslationMessage(
  message: IncomingMessage,
): message is StartPageTranslationMessage {
  return message.type === 'START_PAGE_TRANSLATION';
}

function isStartTranslationJobMessage(
  message: IncomingMessage,
): message is StartTranslationJobMessage {
  return message.type === 'START_TRANSLATION_JOB';
}

function hasTabId(
  message: StartPageTranslationMessage | StartTranslationJobMessage,
): message is (StartPageTranslationMessage | StartTranslationJobMessage) & { tabId: number } {
  return typeof message.tabId === 'number';
}

export function createMessageHandler({
  sendMessageToTab,
  translatePage,
  loadSettings,
  detectTarget,
  openPdfWorkspace,
}: MessageHandlerDependencies) {
  return async function handleMessage(
    message: IncomingMessage,
  ): Promise<TranslationJobResponseMessage> {
    if (!isStartPageTranslationMessage(message) && !isStartTranslationJobMessage(message)) {
      throw new Error(`Unsupported message: ${message.type}`);
    }

    if (!hasTabId(message)) {
      throw new Error('Tab id is required for page translation.');
    }

    const settings = await loadSettings();
    const target = await detectTarget(message.tabId);

    if (target.kind === 'pdf-document') {
      const workspaceTabId = await openPdfWorkspace(target, settings);

      return {
        type: 'TRANSLATION_JOB_REDIRECTED',
        target,
        workspaceTabId,
      };
    }

    const segments = await sendMessageToTab(message.tabId, { type: 'COLLECT_PAGE_SEGMENTS' });
    const translationResult = await translatePage(segments, {
      providerId: settings.providerId,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      providerSettings: settings.providers[settings.providerId],
    });

    await sendMessageToTab(message.tabId, {
      type: 'APPLY_TRANSLATION_RESULT',
      target,
      translated: translationResult.translated,
      displayMode: settings.displayMode,
    });

    return {
      type: 'PAGE_TRANSLATION_FINISHED',
      target,
      status: translationResult.status,
      translated: translationResult.translated,
      failedBatches: translationResult.failedBatches,
    };
  };
}
