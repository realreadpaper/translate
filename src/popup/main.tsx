import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      getActiveTabId={async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab.id!;
      }}
      sendRuntimeMessage={(message) => chrome.runtime.sendMessage(message)}
    />
  </StrictMode>,
);
