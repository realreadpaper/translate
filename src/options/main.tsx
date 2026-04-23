import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { loadSettings, saveSettings } from '../storage/settings';
import { createDefaultSettings } from '../shared/config';
import { App } from './App';

async function bootstrap() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Options root element "#root" was not found.');
  }

  const initialSettings = await loadSettings().catch(() => createDefaultSettings());

  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <App initialSettings={initialSettings} saveSettings={saveSettings} />
    </StrictMode>,
  );
}

void bootstrap();
