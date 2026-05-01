import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('PDF workspace root element "#root" was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
