import { createDefaultSettings } from '../shared/config';
import type { ExtensionSettings } from '../shared/types';

const STORAGE_KEY = 'immersive-ai-translate.settings';

export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const savedSettings = result[STORAGE_KEY] as ExtensionSettings | undefined;
  if (savedSettings) {
    return savedSettings;
  }

  const defaults = createDefaultSettings();
  await saveSettings(defaults);
  return defaults;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: settings,
  });
}
