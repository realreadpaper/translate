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
import type { YoutubeAsrFallbackMode } from '../shared/types';

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
  contentKind?: 'html-page' | 'pdf-document' | 'youtube-subtitles';
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

      const jobStartedAtMs = performance.now();
      debugLog('youtube-subtitles translation started', {
        tabId: target.tabId,
        videoId: target.videoId,
      });
      const callerProvidedSegments = isStartTranslationJobMessage(message)
        ? message.segments
        : undefined;
      const segmentsSource = callerProvidedSegments ? 'caller' : 'content';
      const collectedSegments: unknown =
        callerProvidedSegments ??
        (await sendMessageToTab(message.tabId, {
          type: 'COLLECT_YOUTUBE_SUBTITLE_SEGMENTS',
          target,
          preferredLanguage: settings.sourceLanguage,
          enableAutoGeneratedCaptions: settings.youtubeAutoCaptionFallback,
          displayMode: settings.displayMode,
          subtitleDisplayStyle: settings.subtitleDisplayStyle,
        }));
      const collectionFinishedAtMs = performance.now();
      if (!Array.isArray(collectedSegments)) {
        const detail =
          typeof collectedSegments === 'object' &&
          collectedSegments !== null &&
          'message' in collectedSegments
            ? String(collectedSegments.message)
            : '字幕采集返回了无效结果。';
        debugLog('youtube asr audio capture unavailable', {
          tabId: target.tabId,
          videoId: target.videoId,
          fallbackMode: settings.youtubeAsrFallback,
          reason: detail,
          audioCapture: 'not-implemented',
          canPrefetchAudioBeforePlayback: false,
        });
        throw new Error(createYoutubeSubtitleUnavailableMessage(settings.youtubeAsrFallback, detail));
      }

      const segments = collectedSegments;
      debugLog('youtube-subtitles segments collected', {
        tabId: target.tabId,
        segmentCount: segments.length,
        source: segmentsSource,
        collectionMs: Math.round(collectionFinishedAtMs - jobStartedAtMs),
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
        debugLog('youtube asr audio capture unavailable', {
          tabId: target.tabId,
          videoId: target.videoId,
          fallbackMode: settings.youtubeAsrFallback,
          reason: 'no subtitle segments',
          audioCapture: 'not-implemented',
          canPrefetchAudioBeforePlayback: false,
        });
        throw new Error(createYoutubeSubtitleUnavailableMessage(settings.youtubeAsrFallback));
      }

      const translationStartedAtMs = performance.now();
      debugLog('youtube-subtitles provider translation starting', {
        tabId: target.tabId,
        videoId: target.videoId,
        source: segmentsSource,
        segmentCount: segments.length,
        firstSegmentId: segments[0]?.id,
      });
      const translationResult = await translatePage(segments, {
        providerId: settings.providerId,
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        providerSettings: settings.providers[settings.providerId],
        contentKind: 'youtube-subtitles',
      });
      const translationFinishedAtMs = performance.now();
      debugLog('youtube-subtitles provider translation completed', {
        tabId: target.tabId,
        videoId: target.videoId,
        source: segmentsSource,
        segmentCount: segments.length,
        translatedCount: translationResult.translated.length,
        failedBatchCount: translationResult.failedBatches.length,
        translationMs: Math.round(translationFinishedAtMs - translationStartedAtMs),
      });

      await sendMessageToTab(message.tabId, {
        type: 'APPLY_TRANSLATION_RESULT',
        target,
        translated: translationResult.translated,
        displayMode: settings.displayMode,
        subtitleDisplayStyle: settings.subtitleDisplayStyle,
      });
      debugLog('youtube-subtitles overlay apply completed', {
        tabId: target.tabId,
        videoId: target.videoId,
        source: segmentsSource,
        translatedCount: translationResult.translated.length,
        applyMs: Math.round(performance.now() - translationFinishedAtMs),
        totalMs: Math.round(performance.now() - jobStartedAtMs),
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
      contentKind: 'html-page',
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

function createYoutubeSubtitleUnavailableMessage(
  youtubeAsrFallback: YoutubeAsrFallbackMode,
  detail = '当前视频没有可用字幕轨道。',
): string {
  const audioBoundary =
    '浏览器扩展无法在视频未播放时直接预取 YouTube 音频；ASR 只能在播放后采集标签页音频。';

  if (youtubeAsrFallback === 'disabled') {
    return `${detail}${audioBoundary} ASR 兜底已关闭。`;
  }

  if (youtubeAsrFallback === 'realtime') {
    return `${detail}${audioBoundary} 实时 ASR 需要视频播放后才能采集标签页音频，字幕和翻译可能滞后；ASR 服务尚未接入。`;
  }

  return `${detail}${audioBoundary} 同步 ASR 需要主动延迟播放 2-4 秒，用缓冲覆盖 ASR 和翻译耗时；ASR 服务尚未接入。`;
}
