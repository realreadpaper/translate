import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createContentMessageHandler } from '../../src/content/index';

describe('createContentMessageHandler', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <article>
        <h1>Hello world</h1>
        <p>Paragraph one.</p>
      </article>
    `;
  });

  it('collects page segments for html-page targets', () => {
    const handler = createContentMessageHandler({
      root: document.body,
      markTranslated: vi.fn(),
      updateDisplayMode: vi.fn(),
    });

    const response = vi.fn();
    const handled = handler(
      {
        type: 'COLLECT_PAGE_SEGMENTS',
      },
      response,
    );

    expect(handled).toBe(true);
    expect(response).toHaveBeenCalledWith([
      { id: 'seg-0', text: 'Hello world' },
      { id: 'seg-1', text: 'Paragraph one.' },
    ]);
  });

  it('applies translated content for html-page targets when receiving the new result message', () => {
    const markTranslated = vi.fn();
    const updateDisplayMode = vi.fn();
    const handler = createContentMessageHandler({
      root: document.body,
      markTranslated,
      updateDisplayMode,
    });

    const response = vi.fn();
    const handled = handler(
      {
        type: 'APPLY_TRANSLATION_RESULT',
        target: {
          kind: 'html-page',
          tabId: 1,
          url: 'https://example.com/article',
        },
        translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
        displayMode: 'bilingual',
      },
      response,
    );

    expect(handled).toBe(true);
    expect(document.body.textContent).toContain('你好，世界');
    expect(markTranslated).toHaveBeenCalledWith('bilingual');
    expect(updateDisplayMode).toHaveBeenCalledWith('bilingual');
    expect(response).toHaveBeenCalledWith({ ok: true });
  });
});
