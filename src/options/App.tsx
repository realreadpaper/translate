import { useState } from 'react';

import type { ExtensionSettings } from '../shared/types';

type AppProps = {
  initialSettings: ExtensionSettings;
  saveSettings: (settings: ExtensionSettings) => Promise<void>;
};

export function App({ initialSettings, saveSettings }: AppProps) {
  const [settings, setSettings] = useState(initialSettings);

  return (
    <main>
      <h1>设置</h1>
      <label>
        源语言
        <input
          aria-label="源语言"
          value={settings.sourceLanguage}
          onChange={(event) =>
            setSettings({
              ...settings,
              sourceLanguage: event.target.value,
            })
          }
        />
      </label>
      <label>
        目标语言
        <input
          aria-label="目标语言"
          value={settings.targetLanguage}
          onChange={(event) =>
            setSettings({
              ...settings,
              targetLanguage: event.target.value,
            })
          }
        />
      </label>
      <label>
        OpenAI API Key
        <input
          aria-label="OpenAI API Key"
          value={settings.providers['openai-compatible'].apiKey}
          onChange={(event) =>
            setSettings({
              ...settings,
              providers: {
                ...settings.providers,
                'openai-compatible': {
                  ...settings.providers['openai-compatible'],
                  apiKey: event.target.value,
                },
              },
            })
          }
        />
      </label>
      <label>
        OpenAI Base URL
        <input
          aria-label="OpenAI Base URL"
          value={settings.providers['openai-compatible'].baseUrl}
          onChange={(event) =>
            setSettings({
              ...settings,
              providers: {
                ...settings.providers,
                'openai-compatible': {
                  ...settings.providers['openai-compatible'],
                  baseUrl: event.target.value,
                },
              },
            })
          }
        />
      </label>
      <label>
        OpenAI Model
        <input
          aria-label="OpenAI Model"
          value={settings.providers['openai-compatible'].model}
          onChange={(event) =>
            setSettings({
              ...settings,
              providers: {
                ...settings.providers,
                'openai-compatible': {
                  ...settings.providers['openai-compatible'],
                  model: event.target.value,
                },
              },
            })
          }
        />
      </label>
      <button type="button" onClick={() => saveSettings(settings)}>
        保存设置
      </button>
    </main>
  );
}
