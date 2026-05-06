import type { ExtensionSettings } from './types';

type BuildTimeDefaults = {
  VITE_RELEASE_BUILD?: string;
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
    enableYoutubeSubtitleTranslation: true,
    enablePdfDocumentTranslation: true,
    youtubeAutoCaptionFallback: true,
    youtubeSubtitlePrefetchEnabled: true,
    youtubeSubtitlePrefetchWindowSeconds: 180,
    youtubeExperimentalAudioPrefetchEnabled: false,
    youtubeAsrProvider: {
      providerId: 'openai-compatible',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'whisper-1',
    },
    pdfOcrFallback: 'confirm-first',
    youtubeAsrFallback: 'disabled',
    subtitleDisplayStyle: 'overlay-bottom',
    translationCacheEnabled: true,
    debugLoggingEnabled: false,
    providers: {
      'openai-compatible': {
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      deepseek: {
        apiKey: env.VITE_RELEASE_BUILD === 'true' ? '' : env.VITE_DEFAULT_DEEPSEEK_API_KEY || '',
        baseUrl: 'https://api.deepseek.com/v1',
        model: env.VITE_DEFAULT_DEEPSEEK_MODEL || 'deepseek-v4-flash',
      },
      traditional: {
        apiKey: '',
        endpoint: 'google-translate',
      },
    },
  };
}
