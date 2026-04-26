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
    };

    await saveSettings(settings);

    await expect(loadSettings()).resolves.toEqual(settings);
  });
});
