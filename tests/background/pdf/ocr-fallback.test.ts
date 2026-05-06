import { describe, expect, it } from 'vitest';

import { shouldUsePdfOcrFallback } from '../../../src/background/pdf/ocr-fallback';

describe('shouldUsePdfOcrFallback', () => {
  it('requires OCR when a page has effectively no extracted text', () => {
    expect(
      shouldUsePdfOcrFallback({
        pageNumber: 2,
        textLength: 0,
        imageCoverageRatio: 0.92,
        unreadableGlyphRatio: 0.1,
      }),
    ).toBe(true);
  });

  it('does not require OCR when text extraction is healthy', () => {
    expect(
      shouldUsePdfOcrFallback({
        pageNumber: 1,
        textLength: 420,
        imageCoverageRatio: 0.15,
        unreadableGlyphRatio: 0.0,
      }),
    ).toBe(false);
  });
});
