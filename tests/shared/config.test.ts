import { describe, expect, it } from 'vitest';

import { createDefaultSettings } from '../../src/shared/config';

describe('createDefaultSettings', () => {
  it('returns a local-first bilingual settings object with deepseek defaults', () => {
    expect(createDefaultSettings({})).toEqual({
      providerId: 'deepseek',
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
      displayMode: 'bilingual',
      autoTranslateOnLoad: false,
      providers: {
        'openai-compatible': {
          apiKey: '',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
        deepseek: {
          apiKey: '',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-v4-flash',
        },
        traditional: {
          apiKey: '',
          endpoint: 'google-translate',
        },
      },
    });
  });

  it('applies local build-time deepseek overrides without changing committed defaults', () => {
    expect(
      createDefaultSettings({
        VITE_DEFAULT_PROVIDER_ID: 'deepseek',
        VITE_DEFAULT_TARGET_LANGUAGE: 'en',
        VITE_DEFAULT_DEEPSEEK_API_KEY: 'local-key',
        VITE_DEFAULT_DEEPSEEK_MODEL: 'deepseek-v4-flash',
      }),
    ).toEqual({
      providerId: 'deepseek',
      sourceLanguage: 'auto',
      targetLanguage: 'en',
      displayMode: 'bilingual',
      autoTranslateOnLoad: false,
      providers: {
        'openai-compatible': {
          apiKey: '',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
        deepseek: {
          apiKey: 'local-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-v4-flash',
        },
        traditional: {
          apiKey: '',
          endpoint: 'google-translate',
        },
      },
    });
  });
});
