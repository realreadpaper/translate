import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSettings } from '../../src/shared/config';
import { loadSettings, saveSettings } from '../../src/storage/settings';

const store = new Map<string, unknown>();

beforeEach(() => {
  store.clear();
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store.get(key) })),
        set: vi.fn(async (payload: Record<string, unknown>) => {
          Object.entries(payload).forEach(([key, value]) => store.set(key, value));
        }),
      },
    },
  } as unknown as typeof chrome;
});

describe('settings storage', () => {
  it('loads defaults and persists them when nothing has been saved', async () => {
    const defaults = createDefaultSettings();

    await expect(loadSettings()).resolves.toEqual(defaults);
    expect(store.get('immersive-ai-translate.settings')).toEqual(defaults);
  });

  it('migrates the legacy deepseek default model to the current default', async () => {
    const legacySettings = {
      ...createDefaultSettings(),
      providers: {
        ...createDefaultSettings().providers,
        deepseek: {
          ...createDefaultSettings().providers.deepseek,
          model: 'deepseek-chat',
        },
      },
    };

    store.set('immersive-ai-translate.settings', legacySettings);

    await expect(loadSettings()).resolves.toEqual({
      ...legacySettings,
      providers: {
        ...legacySettings.providers,
        deepseek: {
          ...legacySettings.providers.deepseek,
          model: 'deepseek-v4-flash',
        },
      },
    });
    expect(store.get('immersive-ai-translate.settings')).toEqual({
      ...legacySettings,
      providers: {
        ...legacySettings.providers,
        deepseek: {
          ...legacySettings.providers.deepseek,
          model: 'deepseek-v4-flash',
        },
      },
    });
  });

  it('persists and reloads settings', async () => {
    const settings = {
      ...createDefaultSettings(),
      targetLanguage: 'ja',
      autoTranslateOnLoad: true,
      enableYoutubeSubtitleTranslation: false,
      enablePdfDocumentTranslation: true,
      youtubeAutoCaptionFallback: false,
      pdfOcrFallback: 'disabled' as const,
      youtubeAsrFallback: 'realtime' as const,
      subtitleDisplayStyle: 'overlay-top' as const,
      translationCacheEnabled: false,
      debugLoggingEnabled: true,
    };

    await saveSettings(settings);

    await expect(loadSettings()).resolves.toEqual(settings);
  });

  it('migrates saved settings that do not have pdf and youtube controls yet', async () => {
    const legacySettings = createDefaultSettings() as Partial<ReturnType<typeof createDefaultSettings>>;
    delete legacySettings.enableYoutubeSubtitleTranslation;
    delete legacySettings.enablePdfDocumentTranslation;
    delete legacySettings.youtubeAutoCaptionFallback;
    delete legacySettings.pdfOcrFallback;
    delete legacySettings.youtubeAsrFallback;
    delete legacySettings.subtitleDisplayStyle;
    delete legacySettings.translationCacheEnabled;
    delete legacySettings.debugLoggingEnabled;

    store.set('immersive-ai-translate.settings', legacySettings);

    await expect(loadSettings()).resolves.toEqual(createDefaultSettings());
  });

  it('migrates saved settings that do not have youtube prefetch and asr provider settings yet', async () => {
    const legacySettings = createDefaultSettings() as Partial<ReturnType<typeof createDefaultSettings>>;
    delete legacySettings.youtubeSubtitlePrefetchEnabled;
    delete legacySettings.youtubeSubtitlePrefetchWindowSeconds;
    delete legacySettings.youtubeExperimentalAudioPrefetchEnabled;
    delete legacySettings.youtubeAsrProvider;
    store.set('immersive-ai-translate.settings', legacySettings);

    const settings = await loadSettings();

    expect(settings.youtubeSubtitlePrefetchEnabled).toBe(true);
    expect(settings.youtubeSubtitlePrefetchWindowSeconds).toBe(180);
    expect(settings.youtubeExperimentalAudioPrefetchEnabled).toBe(false);
    expect(settings.youtubeAsrProvider).toEqual({
      providerId: 'openai-compatible',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'whisper-1',
    });
  });
});
