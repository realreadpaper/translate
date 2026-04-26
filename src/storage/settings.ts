import { createDefaultSettings } from '../shared/config';
import type { ExtensionSettings } from '../shared/types';

const STORAGE_KEY = 'immersive-ai-translate.settings';
const LEGACY_DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

function normalizeSettings(
  savedSettings: ExtensionSettings,
  defaults: ExtensionSettings,
): ExtensionSettings {
  const normalizedSettings: ExtensionSettings = {
    ...defaults,
    ...savedSettings,
    providers: {
      ...defaults.providers,
      ...savedSettings.providers,
      'openai-compatible': {
        ...defaults.providers['openai-compatible'],
        ...savedSettings.providers['openai-compatible'],
      },
      deepseek: {
        ...defaults.providers.deepseek,
        ...savedSettings.providers.deepseek,
      },
      traditional: {
        ...defaults.providers.traditional,
        ...savedSettings.providers.traditional,
      },
    },
  };

  if (
    normalizedSettings.providers.deepseek.model === LEGACY_DEEPSEEK_DEFAULT_MODEL
    && defaults.providers.deepseek.model !== LEGACY_DEEPSEEK_DEFAULT_MODEL
  ) {
    normalizedSettings.providers.deepseek.model = defaults.providers.deepseek.model;
  }

  return normalizedSettings;
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const defaults = createDefaultSettings();
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const savedSettings = result[STORAGE_KEY] as ExtensionSettings | undefined;
  if (savedSettings) {
    const normalizedSettings = normalizeSettings(savedSettings, defaults);
    if (JSON.stringify(normalizedSettings) !== JSON.stringify(savedSettings)) {
      await saveSettings(normalizedSettings);
    }
    return normalizedSettings;
  }

  await saveSettings(defaults);
  return defaults;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: settings,
  });
}
