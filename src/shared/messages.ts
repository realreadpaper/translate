import type { DisplayMode } from './types';
import type { TranslationTarget, TranslationTargetKind } from './translation-target';

export type StartPageTranslationMessage = {
  type: 'START_PAGE_TRANSLATION';
  tabId?: number;
  segments?: Array<{ id: string; text: string }>;
};

export type StartTranslationJobMessage = {
  type: 'START_TRANSLATION_JOB';
  tabId?: number;
  targetKind?: TranslationTargetKind;
};

export type SetDisplayModeMessage = {
  type: 'SET_DISPLAY_MODE';
  tabId?: number;
  displayMode: DisplayMode;
};

export type OpenPdfWorkspaceMessage = {
  type: 'OPEN_PDF_WORKSPACE';
  tabId?: number;
};

export type CollectPageSegmentsMessage = {
  type: 'COLLECT_PAGE_SEGMENTS';
};

export type CollectYoutubeSubtitleSegmentsMessage = {
  type: 'COLLECT_YOUTUBE_SUBTITLE_SEGMENTS';
  target: Extract<TranslationTarget, { kind: 'youtube-subtitles' }>;
  preferredLanguage: string;
};

export type ApplyPageTranslationMessage = {
  type: 'APPLY_PAGE_TRANSLATION';
  translated: Array<{ id: string; translatedText: string }>;
  displayMode: DisplayMode;
};

export type ApplyTranslationResultMessage = {
  type: 'APPLY_TRANSLATION_RESULT';
  target: TranslationTarget;
  translated: Array<{ id: string; translatedText: string }>;
  displayMode: DisplayMode;
  subtitleDisplayStyle?: import('./types').SubtitleDisplayStyle;
};

export type PageTranslationFinishedMessage = {
  type: 'PAGE_TRANSLATION_FINISHED';
  target?: TranslationTarget;
  status: 'success' | 'partial-success';
  translated: Array<{ id: string; translatedText: string }>;
  failedBatches: Array<{ segmentIds: string[]; message: string }>;
};

export type TranslationJobStartedMessage = {
  type: 'TRANSLATION_JOB_STARTED';
  target: TranslationTarget;
};

export type TranslationJobRedirectedMessage = {
  type: 'TRANSLATION_JOB_REDIRECTED';
  target: Extract<TranslationTarget, { kind: 'pdf-document' }>;
  workspaceTabId: number;
};

export type PageTranslationFailedMessage = {
  type: 'PAGE_TRANSLATION_FAILED';
  message: string;
};

export type TestProviderConnectionMessage = {
  type: 'TEST_PROVIDER_CONNECTION';
  providerId: DisplayMode extends never ? never : import('./types').ProviderId;
  providerSettings: import('./types').ProviderSettingsById[import('./types').ProviderId];
};

export type TestProviderConnectionResultMessage =
  | {
      type: 'TEST_PROVIDER_CONNECTION_RESULT';
      ok: true;
      message: string;
    }
  | {
      type: 'TEST_PROVIDER_CONNECTION_RESULT';
      ok: false;
      message: string;
    };
