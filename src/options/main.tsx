import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { loadSettings, saveSettings } from '../storage/settings';
import { createDefaultSettings } from '../shared/config';
import { App } from './App';
import './styles.css';

async function bootstrap() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Options root element "#root" was not found.');
  }

  let initialSettings = createDefaultSettings();
  try {
    initialSettings = await loadSettings();
  } catch (error) {
    console.error(error);
  }

  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <App
        initialSettings={initialSettings}
        saveSettings={saveSettings}
        testConnection={async (settings) => {
          const response = (await chrome.runtime.sendMessage({
            type: 'TEST_PROVIDER_CONNECTION',
            providerId: settings.providerId,
            providerSettings: settings.providers[settings.providerId],
          })) as { ok: boolean; message: string };

          if (!response.ok) {
            throw new Error(response.message);
          }
        }}
      />
    </StrictMode>,
  );
}

void bootstrap();
