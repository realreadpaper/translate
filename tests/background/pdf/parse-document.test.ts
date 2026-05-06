import { describe, expect, it, vi } from 'vitest';

import { extractPdfTextBlocks } from '../../../src/background/pdf/parse-document';

describe('extractPdfTextBlocks', () => {
  it('maps pdf.js text items into page-ordered blocks', async () => {
    const pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getTextContent: vi.fn(async () => ({
          items: [
            { str: 'Hello', transform: [1, 0, 0, 1, 20, 700], width: 42, height: 14 },
            { str: 'world', transform: [1, 0, 0, 1, 70, 700], width: 50, height: 14 },
          ],
        })),
      })),
    };

    await expect(extractPdfTextBlocks(pdfDocument as never)).resolves.toEqual([
      expect.objectContaining({
        id: 'page-1-block-0',
        pageNumber: 1,
        text: 'Hello world',
      }),
    ]);
  });
});
