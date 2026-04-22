import { describe, expect, it } from 'vitest';

import {
  applyTranslations,
  restoreOriginalContent,
  setDisplayMode,
} from '../../src/content/segment-renderer';

describe('segment renderer', () => {
  it('renders bilingual blocks and toggles display modes without losing the original text', () => {
    document.body.innerHTML = `<article><p data-segment-id="seg-0">Hello world</p></article>`;

    applyTranslations(document.body, [{ id: 'seg-0', translatedText: '你好，世界' }]);

    expect(document.body.textContent).toContain('Hello world');
    expect(document.body.textContent).toContain('你好，世界');

    setDisplayMode(document.body, 'translated-only');
    expect(document.querySelector('[data-original-hidden="true"]')).not.toBeNull();

    restoreOriginalContent(document.body);
    expect(document.body.textContent).toContain('Hello world');
    expect(document.body.textContent).not.toContain('你好，世界');
  });

  it('preserves pre-existing inline display:none through translated-only then restore', () => {
    document.body.innerHTML =
      '<article><p data-segment-id="seg-0" style="display:none">Hidden original</p></article>';

    applyTranslations(document.body, [{ id: 'seg-0', translatedText: '隐藏原文' }]);

    setDisplayMode(document.body, 'translated-only');
    restoreOriginalContent(document.body);

    const original = document.querySelector('[data-segment-id="seg-0"]') as HTMLElement;
    expect(original.style.display).toBe('none');
  });

  it('original-only hides translations and shows originals', () => {
    document.body.innerHTML = '<article><p data-segment-id="seg-0">Hello world</p></article>';
    applyTranslations(document.body, [{ id: 'seg-0', translatedText: '你好，世界' }]);

    setDisplayMode(document.body, 'translated-only');
    setDisplayMode(document.body, 'original-only');

    const original = document.querySelector('[data-segment-id="seg-0"]') as HTMLElement;
    const translated = document.querySelector(
      '[data-translation-for="seg-0"]',
    ) as HTMLElement;

    expect(original.style.display).not.toBe('none');
    expect(translated.style.display).toBe('none');
  });

  it('reuses existing translation node for repeated applyTranslations calls', () => {
    document.body.innerHTML = '<article><p data-segment-id="seg-0">Hello world</p></article>';

    applyTranslations(document.body, [{ id: 'seg-0', translatedText: '你好，世界' }]);
    applyTranslations(document.body, [{ id: 'seg-0', translatedText: '你好，地球' }]);

    const translatedNodes = document.querySelectorAll('[data-translation-for="seg-0"]');
    expect(translatedNodes).toHaveLength(1);
    expect(translatedNodes[0]?.textContent).toBe('你好，地球');
  });
});
