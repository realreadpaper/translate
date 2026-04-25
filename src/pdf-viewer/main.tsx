import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App
      loadJob={async () => ({
        title: 'PDF 翻译工作台',
        pages: [],
      })}
    />
  </React.StrictMode>,
);
