import { describe, expect, it, vi } from 'vitest';

import { createMessageHandler } from '../../src/background/messaging';

describe('createMessageHandler', () => {
  it('starts page translation by reading settings, requesting segments, and replying with success', async () => {
    const sendMessageToTab = vi
      .fn()
      .mockImplementation(async (_tabId: number, message: { type: string }) => {
        if (message.type === 'COLLECT_PAGE_SEGMENTS') {
          return [{ id: 'seg-0', text: 'Hello world' }];
        }

        return undefined;
      });
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
      autoTranslateOnLoad: false,
      providers: {
        'openai-compatible': {
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
        deepseek: {
          apiKey: '',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-v4-flash',
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

    expect(translatePage).toHaveBeenCalledWith(
      [{ id: 'seg-0', text: 'Hello world' }],
      {
        providerId: 'openai-compatible',
        sourceLanguage: 'auto',
        targetLanguage: 'zh-CN',
        providerSettings: {
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
      },
    );

    expect(sendMessageToTab).toHaveBeenNthCalledWith(1, 1, {
      type: 'COLLECT_PAGE_SEGMENTS',
    });
    expect(sendMessageToTab).toHaveBeenNthCalledWith(2, 1, {
      type: 'APPLY_PAGE_TRANSLATION',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      displayMode: 'bilingual',
    });
  });

  it('accepts a content-script initiated start message when tabId is provided by the caller', async () => {
    const sendMessageToTab = vi
      .fn()
      .mockImplementation(async (_tabId: number, message: { type: string }) => {
        if (message.type === 'COLLECT_PAGE_SEGMENTS') {
          return [{ id: 'seg-0', text: 'Hello world' }];
        }

        return undefined;
      });
    const translatePage = vi.fn().mockResolvedValue({
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });
    const loadSettings = vi.fn().mockResolvedValue({
      providerId: 'deepseek',
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
      displayMode: 'bilingual',
      autoTranslateOnLoad: false,
      providers: {
        'openai-compatible': {
          apiKey: '',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
        deepseek: {
          apiKey: 'test-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-v4-flash',
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

    await expect(handler({ type: 'START_PAGE_TRANSLATION', tabId: 9 })).resolves.toMatchObject({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
    });

    expect(sendMessageToTab).toHaveBeenNthCalledWith(1, 9, {
      type: 'COLLECT_PAGE_SEGMENTS',
    });
  });
});
