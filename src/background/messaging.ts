import type { ExtensionSettings } from '../shared/types';
import type {
  ApplyTranslationResultMessage,
  ApplyPageTranslationMessage,
  CollectPageSegmentsMessage,
  PageTranslationFinishedMessage,
  StartPageTranslationMessage,
  StartTranslationJobMessage,
  TranslationJobRedirectedMessage,
  TranslationJobStartedMessage,
} from '../shared/messages';
import type {
  TranslationTarget,
  TranslationTargetKind,
} from '../shared/translation-target';

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
  detectTarget: (
    tabId: number,
    requestedKind?: TranslationTargetKind,
  ) => Promise<TranslationTarget>;
  openPdfWorkspace: (
    target: TranslationTarget,
    settings: ExtensionSettings,
  ) => Promise<number>;
  debugLog?: (message: string, details?: Record<string, unknown>) => void;
};

type IncomingMessage = StartPageTranslationMessage | StartTranslationJobMessage | { type: string };

type MessageHandlerResult =
  | PageTranslationFinishedMessage
  | TranslationJobStartedMessage
  | TranslationJobRedirectedMessage;

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
  debugLog = () => undefined,
}: MessageHandlerDependencies) {
  return async function handleMessage(
    message: IncomingMessage,
  ): Promise<MessageHandlerResult> {
    if (!isStartPageTranslationMessage(message) && !isStartTranslationJobMessage(message)) {
      throw new Error(`Unsupported message: ${message.type}`);
    }

    if (!hasTabId(message)) {
      throw new Error('Tab id is required for translation.');
    }

    const settings = await loadSettings();
    const requestedKind = isStartPageTranslationMessage(message) ? 'html-page' : message.targetKind;
    const target = await detectTarget(message.tabId, requestedKind);
    debugLog('routing translation job', {
      messageType: message.type,
      requestedKind,
      targetKind: target.kind,
      tabId: message.tabId,
      url: target.url,
    });

    if (target.kind === 'pdf-document') {
      const workspaceTabId = await openPdfWorkspace(target, settings);
      debugLog('pdf-document translation redirected', {
        tabId: target.tabId,
        workspaceTabId,
        displayName: target.displayName,
        sourceKind: target.sourceKind,
      });
      return {
        type: 'TRANSLATION_JOB_REDIRECTED',
        target,
        workspaceTabId,
      };
    }

    if (target.kind === 'youtube-subtitles') {
      debugLog('youtube-subtitles translation started', {
        tabId: target.tabId,
        videoId: target.videoId,
      });
      return {
        type: 'TRANSLATION_JOB_STARTED',
        target,
      };
    }

    const segments =
      isStartPageTranslationMessage(message) && message.segments
        ? message.segments
        : await sendMessageToTab(message.tabId, { type: 'COLLECT_PAGE_SEGMENTS' });
    debugLog('html-page segments collected', {
      tabId: target.tabId,
      segmentCount: segments.length,
      source: isStartPageTranslationMessage(message) && message.segments ? 'caller' : 'content',
    });
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
    debugLog('html-page translation finished', {
      tabId: target.tabId,
      translatedCount: translationResult.translated.length,
      failedBatchCount: translationResult.failedBatches.length,
      status: translationResult.status,
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
