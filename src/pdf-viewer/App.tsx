import { useEffect, useState } from 'react';

import type { DisplayMode } from '../shared/types';

type PdfViewerPage = {
  pageNumber: number;
  originalText: string;
  translatedText: string;
};

type PdfViewerAppProps = {
  loadJob: () => Promise<{
    title: string;
    pages: PdfViewerPage[];
  }>;
};

export function App({ loadJob }: PdfViewerAppProps) {
  const [mode, setMode] = useState<DisplayMode>('bilingual');
  const [documentState, setDocumentState] = useState<{
    title: string;
    pages: PdfViewerPage[];
  } | null>(null);

  useEffect(() => {
    void loadJob().then(setDocumentState);
  }, [loadJob]);

  if (!documentState) {
    return <main>正在加载 PDF 翻译工作台...</main>;
  }

  return (
    <main className="pdf-viewer-shell">
      <header className="pdf-viewer-header">
        <h1>{documentState.title}</h1>
        <div className="pdf-viewer-modes">
          <button type="button" onClick={() => setMode('bilingual')}>双语</button>
          <button type="button" onClick={() => setMode('original-only')}>原文</button>
          <button type="button" onClick={() => setMode('translated-only')}>译文</button>
        </div>
      </header>
      <section className="pdf-viewer-body">
        {documentState.pages.map((page) => (
          <section className="pdf-viewer-page" key={page.pageNumber}>
            {mode !== 'translated-only' ? <article>{page.originalText}</article> : null}
            {mode !== 'original-only' ? <article>{page.translatedText}</article> : null}
          </section>
        ))}
      </section>
    </main>
  );
}
