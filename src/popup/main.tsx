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

function readActiveTabKind(tab: chrome.tabs.Tab): 'html-page' | 'pdf-document' | 'youtube-subtitles' {
  const url = tab.url ?? '';
  if (isPdfUrlLike(url) || extractPdfViewerSourceUrl(url)) {
    return 'pdf-document';
  }

  try {
    const parsedUrl = new URL(url);
    if (
      (parsedUrl.hostname === 'www.youtube.com' || parsedUrl.hostname === 'youtube.com') &&
      parsedUrl.pathname === '/watch'
    ) {
      return 'youtube-subtitles';
    }
  } catch {
    return 'html-page';
  }

  return 'html-page';
}

function isPdfUrlLike(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.pdf') || pathname === '/pdf' || pathname.startsWith('/pdf/');
  } catch {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.endsWith('.pdf') || lowerUrl.includes('/pdf/');
  }
}

function extractPdfViewerSourceUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (
      parsedUrl.protocol !== 'chrome-extension:' &&
      parsedUrl.protocol !== 'edge-extension:'
    ) {
      return '';
    }

    return parsedUrl.searchParams.get('src') ?? '';
  } catch {
    return '';
  }
}

async function bootstrap() {
  const settings = await loadSettings();
  const activeTab = tabIdOverride !== null
    ? await chrome.tabs.get(tabIdOverride)
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const activeTabKind = activeTab ? readActiveTabKind(activeTab) : 'html-page';

  ReactDOM.createRoot(popupRoot).render(
    <StrictMode>
      <App
        getActiveTabId={async () => {
          if (tabIdOverride !== null) {
            return tabIdOverride;
          }

          if (typeof activeTab?.id !== 'number') {
            throw new Error('Active tab id is unavailable.');
          }
          return activeTab.id;
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
        activeTabKind={activeTabKind}
        openPdfWorkspace={async () => {
          const tabId = tabIdOverride ?? activeTab?.id;
          if (typeof tabId !== 'number') {
            throw new Error('Active tab id is unavailable.');
          }

          const response = await chrome.runtime.sendMessage({
            type: 'OPEN_PDF_WORKSPACE',
            tabId,
          });
          if (response?.type === 'PAGE_TRANSLATION_FAILED') {
            throw new Error(response.message);
          }
        }}
        providerName={readProviderName(settings.providerId)}
        targetLanguageLabel={readLanguageLabel(settings.targetLanguage)}
        openOptionsPage={() => chrome.runtime.openOptionsPage()}
      />
    </StrictMode>,
  );
}

void bootstrap();
