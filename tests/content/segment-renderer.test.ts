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
});
