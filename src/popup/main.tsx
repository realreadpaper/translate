import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { loadSettings, saveSettings } from '../storage/settings';
import { App } from './App';
import './styles.css';

function readTabIdOverride(search: string) {
  const value = new URLSearchParams(search).get('tabId');
  if (!value) {
    return null;
  }

  const tabId = Number.parseInt(value, 10);
  return Number.isInteger(tabId) ? tabId : null;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Popup root element "#root" was not found.');
}
const popupRoot = rootElement;

const tabIdOverride = readTabIdOverride(window.location.search);

function readProviderName(providerId: string) {
  if (providerId === 'deepseek') {
    return 'DeepSeek';
  }

  if (providerId === 'openai-compatible') {
    return 'OpenAI Compatible';
  }

  return 'Traditional';
}

function readLanguageLabel(language: string) {
  if (language === 'zh-CN') {
    return '简体中文';
  }

  if (language === 'auto') {
    return '自动识别';
  }

  return language;
}

async function bootstrap() {
  const settings = await loadSettings();

  ReactDOM.createRoot(popupRoot).render(
    <StrictMode>
      <App
        getActiveTabId={async () => {
          if (tabIdOverride !== null) {
            return tabIdOverride;
          }

          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (typeof tab?.id !== 'number') {
            throw new Error('Active tab id is unavailable.');
          }
          return tab.id;
        }}
        sendRuntimeMessage={(message) => chrome.runtime.sendMessage(message)}
        autoTranslateOnLoad={settings.autoTranslateOnLoad}
        updateAutoTranslateOnLoad={async (enabled) => {
          const nextSettings = {
            ...settings,
            autoTranslateOnLoad: enabled,
          };
          await saveSettings(nextSettings);
        }}
        providerName={readProviderName(settings.providerId)}
        targetLanguageLabel={readLanguageLabel(settings.targetLanguage)}
        openOptionsPage={() => chrome.runtime.openOptionsPage()}
      />
    </StrictMode>,
  );
}

void bootstrap();
