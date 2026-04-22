export type DisplayMode = 'bilingual' | 'translated-only' | 'original-only';

export type ProviderId = 'openai-compatible' | 'deepseek' | 'traditional';

export type ProviderSettings = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  endpoint?: 'google-translate' | 'microsoft-translator';
};

export type ExtensionSettings = {
  providerId: ProviderId;
  sourceLanguage: string;
  targetLanguage: string;
  displayMode: DisplayMode;
  providers: Record<ProviderId, ProviderSettings>;
};
