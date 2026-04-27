import { beforeEach, describe, expect, it, vi } from 'vitest';

import { collectPageSegments, initializeContentTranslation } from '../../src/content/index';
import { createDefaultSettings } from '../../src/shared/config';

describe('initializeContentTranslation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<article><p>Hello world</p></article>';
    vi.useRealTimers();
  });

  it('auto-translates after the page is loaded without mounting the floating ball', async () => {
    vi.useFakeTimers();
    const loadSettings = vi.fn().mockResolvedValue({
      ...createDefaultSettings(),
      autoTranslateOnLoad: true,
    });
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });

    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'loading',
    });
    document.body.innerHTML = '';

    await initializeContentTranslation(document.body, {
      loadSettings,
      sendRuntimeMessage,
    });

    expect(document.querySelector('[data-floating-ball-trigger]')).toBeNull();
    expect(sendRuntimeMessage).not.toHaveBeenCalled();

    document.body.innerHTML = '<article><p>Hello world</p></article>';
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete',
    });
    window.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'START_PAGE_TRANSLATION',
    });
  });

  it('waits for translatable content when auto-translate starts on an empty loaded page', async () => {
    vi.useFakeTimers();
    const loadSettings = vi.fn().mockResolvedValue({
      ...createDefaultSettings(),
      autoTranslateOnLoad: true,
    });
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '动态内容' }],
      failedBatches: [],
    });
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete',
    });
    document.body.innerHTML = '<main></main>';

    await initializeContentTranslation(document.body, {
      loadSettings,
      sendRuntimeMessage,
    });
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(document.querySelector('[data-floating-ball-trigger]')).toBeNull();
    expect(sendRuntimeMessage).not.toHaveBeenCalled();

    document.querySelector('main')?.insertAdjacentHTML('beforeend', '<p>Dynamic content</p>');
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'START_PAGE_TRANSLATION',
    });
  });

  it('mounts the floating ball when auto-translate is disabled', async () => {
    const loadSettings = vi.fn().mockResolvedValue({
      ...createDefaultSettings(),
      autoTranslateOnLoad: false,
    });
    const sendRuntimeMessage = vi.fn().mockResolvedValue(undefined);

    await initializeContentTranslation(document.body, {
      loadSettings,
      sendRuntimeMessage,
    });

    expect(document.querySelector('[data-floating-ball-trigger]')).not.toBeNull();
    expect(sendRuntimeMessage).not.toHaveBeenCalled();
  });

  it('hides ads during initialization before translation controls are used', async () => {
    document.body.innerHTML = `
      <main>
        <p>Readable page text.</p>
        <aside class="ad-banner">Noisy ad copy.</aside>
      </main>
    `;
    const loadSettings = vi.fn().mockResolvedValue({
      ...createDefaultSettings(),
      autoTranslateOnLoad: false,
    });
    const sendRuntimeMessage = vi.fn().mockResolvedValue(undefined);

    await initializeContentTranslation(document.body, {
      loadSettings,
      sendRuntimeMessage,
    });

    const ad = document.querySelector('.ad-banner') as HTMLElement;
    expect(ad.dataset.immersiveAdHidden).toBe('true');
    expect(ad.dataset.immersiveIgnore).toBe('true');
    expect(ad.style.display).toBe('none');
  });

  it('cleans ads before collecting page segments for full-page translation', () => {
    document.body.innerHTML = `
      <main>
        <p>Translate the article.</p>
        <div class="sponsored-card">Do not translate the sponsored copy.</div>
      </main>
    `;

    expect(collectPageSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Translate the article.' },
    ]);
  });
});
