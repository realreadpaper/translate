export type DisplayMode = 'bilingual' | 'translated-only' | 'original-only';

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
  providers: ProviderSettingsById;
};
