import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/pdf-viewer/App';

describe('PdfViewer App', () => {
  it('shows an OCR prompt for pages flagged as image-only', async () => {
    render(
      <App
        loadJob={async () => ({
          title: 'scan.pdf',
          pages: [
            {
              pageNumber: 1,
              originalText: '',
              translatedText: '',
              needsOcr: true,
            },
          ],
        })}
      />,
    );

    expect(await screen.findByText('第 1 页需要 OCR 才能继续翻译')).toBeTruthy();
  });
});
