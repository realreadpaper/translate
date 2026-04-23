import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Popup root element "#root" was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <App
      getActiveTabId={async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (typeof tab?.id !== 'number') {
          throw new Error('Active tab id is unavailable.');
        }
        return tab.id;
      }}
      sendRuntimeMessage={(message) => chrome.runtime.sendMessage(message)}
    />
  </StrictMode>,
);
