import type { ExtensionSettings } from './types';

type BuildTimeDefaults = {
  VITE_DEFAULT_PROVIDER_ID?: string;
  VITE_DEFAULT_TARGET_LANGUAGE?: string;
  VITE_DEFAULT_DEEPSEEK_API_KEY?: string;
  VITE_DEFAULT_DEEPSEEK_MODEL?: string;
};

export function createDefaultSettings(
  env: BuildTimeDefaults = import.meta.env as BuildTimeDefaults,
): ExtensionSettings {
  return {
    providerId: env.VITE_DEFAULT_PROVIDER_ID === 'deepseek' ? 'deepseek' : 'deepseek',
    sourceLanguage: 'auto',
    targetLanguage: env.VITE_DEFAULT_TARGET_LANGUAGE || 'zh-CN',
    displayMode: 'bilingual',
    autoTranslateOnLoad: false,
    providers: {
      'openai-compatible': {
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      deepseek: {
        apiKey: env.VITE_DEFAULT_DEEPSEEK_API_KEY || '',
        baseUrl: 'https://api.deepseek.com/v1',
        model: env.VITE_DEFAULT_DEEPSEEK_MODEL || 'deepseek-chat',
      },
      traditional: {
        apiKey: '',
        endpoint: 'google-translate',
      },
    },
  };
}
