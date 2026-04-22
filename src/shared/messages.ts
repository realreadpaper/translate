import type { DisplayMode } from './types';

export type StartPageTranslationMessage = {
  type: 'START_PAGE_TRANSLATION';
  tabId: number;
};

export type SetDisplayModeMessage = {
  type: 'SET_DISPLAY_MODE';
  tabId: number;
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
