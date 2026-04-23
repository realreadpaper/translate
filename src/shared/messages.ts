import type { DisplayMode } from './types';

export type StartPageTranslationMessage = {
  type: 'START_PAGE_TRANSLATION';
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

export type PageTranslationFinishedMessage = {
  type: 'PAGE_TRANSLATION_FINISHED';
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
