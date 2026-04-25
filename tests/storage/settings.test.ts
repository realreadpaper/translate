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

  it('persists and reloads settings', async () => {
    const settings = {
      ...createDefaultSettings(),
      targetLanguage: 'ja',
      autoTranslateOnLoad: true,
      enableYoutubeSubtitleTranslation: false,
      enablePdfDocumentTranslation: true,
      pdfOcrFallback: 'disabled' as const,
      youtubeAsrFallback: 'confirm-first' as const,
      subtitleDisplayStyle: 'overlay-top' as const,
      translationCacheEnabled: false,
    };

    await saveSettings(settings);

    await expect(loadSettings()).resolves.toEqual(settings);
  });
});
