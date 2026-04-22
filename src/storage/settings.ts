import { createDefaultSettings } from '../shared/config';
import type { ExtensionSettings } from '../shared/types';

const STORAGE_KEY = 'immersive-ai-translate.settings';

export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as ExtensionSettings | undefined) ?? createDefaultSettings();
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: settings,
  });
}
