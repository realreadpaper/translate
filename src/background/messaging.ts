import type { ExtensionSettings } from '../shared/types';
import { configureRuntimeDebugLogging } from '../shared/debug';
import type {
  ApplyTranslationResultMessage,
  CollectYoutubeSubtitleSegmentsMessage,
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
  contentKind?: 'html-page' | 'youtube-subtitles';
};

type SendMessageToTab = {
  (tabId: number, message: CollectPageSegmentsMessage): Promise<SourceSegment[]>;
  (tabId: number, message: CollectYoutubeSubtitleSegmentsMessage): Promise<SourceSegment[]>;
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
  startYoutubeAudioAsr?: (
    target: Extract<TranslationTarget, { kind: 'youtube-subtitles' }>,
    settings: ExtensionSettings['youtubeAsrProvider'],
  ) => Promise<SourceSegment[]>;
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
  startYoutubeAudioAsr,
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
    configureRuntimeDebugLogging(settings.debugLoggingEnabled);
    debugLog('background settings loaded for translation job', {
      providerId: settings.providerId,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      displayMode: settings.displayMode,
      enablePdfDocumentTranslation: settings.enablePdfDocumentTranslation,
      enableYoutubeSubtitleTranslation: settings.enableYoutubeSubtitleTranslation,
      debugLoggingEnabled: settings.debugLoggingEnabled,
    });
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
      if (settings.enablePdfDocumentTranslation === false) {
        throw new Error('PDF 文档翻译已在设置中关闭。');
      }

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
      if (settings.enableYoutubeSubtitleTranslation === false) {
        throw new Error('YouTube 字幕翻译已在设置中关闭。');
      }

      debugLog('youtube-subtitles translation started', {
        tabId: target.tabId,
        videoId: target.videoId,
      });
      const callerProvidedSegments = isStartTranslationJobMessage(message)
        ? message.segments
        : undefined;
      const collectedSegments: unknown =
        callerProvidedSegments ??
        (await sendMessageToTab(message.tabId, {
          type: 'COLLECT_YOUTUBE_SUBTITLE_SEGMENTS',
          target,
          preferredLanguage: settings.sourceLanguage,
        }));
      if (!Array.isArray(collectedSegments)) {
        const message =
          typeof collectedSegments === 'object' &&
          collectedSegments !== null &&
          'message' in collectedSegments
            ? String(collectedSegments.message)
            : '字幕采集返回了无效结果。';
        throw new Error(message);
      }

      const segments = collectedSegments;
      debugLog('youtube-subtitles segments collected', {
        tabId: target.tabId,
        segmentCount: segments.length,
      });
      if (segments.length === 0) {
        if (
          settings.youtubeExperimentalAudioPrefetchEnabled &&
          startYoutubeAudioAsr
        ) {
          const audioSegments = await startYoutubeAudioAsr(target, settings.youtubeAsrProvider);
          segments.push(...audioSegments);
        }
      }

      if (segments.length === 0) {
        if (settings.youtubeAsrFallback === 'disabled') {
          throw new Error('当前视频没有可用字幕轨道，ASR 兜底已在设置中关闭。');
        }
        throw new Error('当前视频没有可用字幕轨道。ASR 兜底已预留确认入口，尚未接入识别服务。');
      }

      const translationResult = await translatePage(segments, {
        providerId: settings.providerId,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        providerSettings: settings.providers[settings.providerId],
        contentKind: 'youtube-subtitles',
      });

      await sendMessageToTab(message.tabId, {
        type: 'APPLY_TRANSLATION_RESULT',
        target,
        translated: translationResult.translated,
        displayMode: settings.displayMode,
        subtitleDisplayStyle: settings.subtitleDisplayStyle,
      });

      return {
        type: 'PAGE_TRANSLATION_FINISHED',
        target,
        status: translationResult.status,
        translated: translationResult.translated,
        failedBatches: translationResult.failedBatches,
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
