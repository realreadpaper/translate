export type DisplayMode = 'bilingual' | 'translated-only' | 'original-only';
export type FallbackMode = 'confirm-first' | 'disabled';
export type YoutubeAsrFallbackMode = 'disabled' | 'realtime' | 'sync-delay';
export type SubtitleDisplayStyle = 'overlay-bottom' | 'overlay-top';

export type ProviderId = 'openai-compatible' | 'deepseek' | 'traditional';

export type OpenAICompatibleProviderSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type DeepSeekProviderSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type TraditionalProviderSettings = {
  apiKey: string;
  endpoint: 'google-translate' | 'microsoft-translator';
};

export type YoutubeAsrProviderSettings = {
  providerId: 'openai-compatible';
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type ProviderSettingsById = {
  'openai-compatible': OpenAICompatibleProviderSettings;
  deepseek: DeepSeekProviderSettings;
  traditional: TraditionalProviderSettings;
};

export type ExtensionSettings = {
  providerId: ProviderId;
  sourceLanguage: string;
  targetLanguage: string;
  displayMode: DisplayMode;
  autoTranslateOnLoad: boolean;
  enableYoutubeSubtitleTranslation: boolean;
  enablePdfDocumentTranslation: boolean;
  youtubeAutoCaptionFallback: boolean;
  youtubeSubtitlePrefetchEnabled: boolean;
  youtubeSubtitlePrefetchWindowSeconds: number;
  youtubeExperimentalAudioPrefetchEnabled: boolean;
  youtubeAsrProvider: YoutubeAsrProviderSettings;
  pdfOcrFallback: FallbackMode;
  youtubeAsrFallback: YoutubeAsrFallbackMode;
  subtitleDisplayStyle: SubtitleDisplayStyle;
  translationCacheEnabled: boolean;
  debugLoggingEnabled: boolean;
  providers: ProviderSettingsById;
};
