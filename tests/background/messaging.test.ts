import { describe, expect, it, vi } from 'vitest';

import { createMessageHandler } from '../../src/background/messaging';

describe('createMessageHandler', () => {
  it('starts page translation by reading settings, requesting segments, and replying with success', async () => {
    const sendMessageToTab = vi.fn().mockResolvedValue([
      { id: 'seg-0', text: 'Hello world' },
    ]);
    const translatePage = vi.fn().mockResolvedValue({
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });
    const loadSettings = vi.fn().mockResolvedValue({
      providerId: 'openai-compatible',
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
      displayMode: 'bilingual',
      providers: {
        'openai-compatible': {
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
        deepseek: {
          apiKey: '',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        },
        traditional: {
          apiKey: '',
          endpoint: 'google-translate',
        },
      },
    });

    const handler = createMessageHandler({
      sendMessageToTab,
      translatePage,
      loadSettings,
    });

    await expect(handler({ type: 'START_PAGE_TRANSLATION', tabId: 1 })).resolves.toEqual({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });

    expect(sendMessageToTab).toHaveBeenLastCalledWith(1, {
      type: 'APPLY_PAGE_TRANSLATION',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      displayMode: 'bilingual',
    });
  });
});
