import type { ExtensionSettings } from './types';

export function createDefaultSettings(): ExtensionSettings {
  return {
    providerId: 'openai-compatible',
    sourceLanguage: 'auto',
    targetLanguage: 'zh-CN',
    displayMode: 'bilingual',
    providers: {
      'openai-compatible': {
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      deepseek: {
        apiKey: '',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      },
      traditional: {
        apiKey: '',
        endpoint: 'google-translate',
      },
    },
  };
}
