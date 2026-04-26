import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initializeContentTranslation } from '../../src/content/index';
import { createDefaultSettings } from '../../src/shared/config';

describe('initializeContentTranslation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<article><p>Hello world</p></article>';
  });

  it('keeps the floating ball available when auto-translate is enabled', async () => {
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

    await initializeContentTranslation(document.body, {
      loadSettings,
      sendRuntimeMessage,
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;

    expect(trigger).not.toBeNull();
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'START_PAGE_TRANSLATION',
      segments: [{ id: 'seg-0', text: 'Hello world' }],
    });
    expect(trigger.dataset.state).toBe('translated');
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
});
