import type { DisplayMode, ProviderId, ProviderSettingsById } from './types';
import type { TranslationTarget } from './translation-target';

export type StartPageTranslationMessage = {
  type: 'START_PAGE_TRANSLATION';
  tabId?: number;
};

export type StartTranslationJobMessage = {
  type: 'START_TRANSLATION_JOB';
  tabId?: number;
};

export type SetDisplayModeMessage = {
  type: 'SET_DISPLAY_MODE';
  tabId?: number;
  displayMode: DisplayMode;
};

export type CollectPageSegmentsMessage = {
  type: 'COLLECT_PAGE_SEGMENTS';
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
};

export type PageTranslationFinishedMessage = {
  type: 'PAGE_TRANSLATION_FINISHED';
  target?: TranslationTarget;
  status: 'success' | 'partial-success';
  translated: Array<{ id: string; translatedText: string }>;
  failedBatches: Array<{ segmentIds: string[]; message: string }>;
};

export type PageTranslationFailedMessage = {
  type: 'PAGE_TRANSLATION_FAILED';
  message: string;
};

export type TestProviderConnectionMessage = {
  type: 'TEST_PROVIDER_CONNECTION';
  providerId: ProviderId;
  providerSettings: ProviderSettingsById[ProviderId];
};

export type TranslationJobStartedMessage =
  | {
      type: 'TRANSLATION_JOB_STARTED';
      target: TranslationTarget;
    }
  | {
      type: 'TRANSLATION_JOB_REDIRECTED';
      target: TranslationTarget;
      workspaceTabId: number;
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
