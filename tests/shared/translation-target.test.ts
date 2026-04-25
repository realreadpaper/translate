import { describe, expect, it } from 'vitest';

import {
  type TranslationTarget,
  isPdfDocumentTarget,
  isYoutubeSubtitleTarget,
} from '../../src/shared/translation-target';

describe('translation targets', () => {
  it('narrows a youtube subtitle target', () => {
    const target: TranslationTarget = {
      kind: 'youtube-subtitles',
      tabId: 3,
      url: 'https://www.youtube.com/watch?v=abc',
      videoId: 'abc',
    };

    expect(isYoutubeSubtitleTarget(target)).toBe(true);
    expect(isPdfDocumentTarget(target)).toBe(false);
  });

  it('narrows a pdf document target', () => {
    const target: TranslationTarget = {
      kind: 'pdf-document',
      tabId: 9,
      url: 'https://example.com/file.pdf',
      sourceKind: 'http-url',
      displayName: 'file.pdf',
    };

    expect(isPdfDocumentTarget(target)).toBe(true);
    expect(isYoutubeSubtitleTarget(target)).toBe(false);
  });
});
