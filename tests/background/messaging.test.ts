import { describe, expect, it, vi } from 'vitest';

import { createMessageHandler } from '../../src/background/messaging';

describe('createMessageHandler', () => {
  it('routes html-page targets through the existing segment collection flow', async () => {
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
    const settings = {
      providerId: 'openai-compatible' as const,
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
      displayMode: 'bilingual' as const,
      autoTranslateOnLoad: false,
      enableYoutubeSubtitleTranslation: true,
      enablePdfDocumentTranslation: true,
      pdfOcrFallback: 'confirm-first' as const,
      youtubeAsrFallback: 'confirm-first' as const,
      subtitleDisplayStyle: 'overlay-bottom' as const,
      translationCacheEnabled: true,
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
          endpoint: 'google-translate' as const,
        },
      },
    };
    const loadSettings = vi.fn().mockResolvedValue(settings);
    const detectTarget = vi.fn().mockResolvedValue({
      kind: 'html-page',
      tabId: 5,
      url: 'https://example.com/article',
    });
    const openPdfWorkspace = vi.fn();

    const handler = createMessageHandler({
      sendMessageToTab,
      translatePage,
      loadSettings,
      detectTarget,
      openPdfWorkspace,
    });

    await expect(handler({ type: 'START_TRANSLATION_JOB', tabId: 5 })).resolves.toEqual({
      type: 'PAGE_TRANSLATION_FINISHED',
      target: {
        kind: 'html-page',
        tabId: 5,
        url: 'https://example.com/article',
      },
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

    expect(detectTarget).toHaveBeenCalledWith(5);
    expect(sendMessageToTab).toHaveBeenNthCalledWith(1, 5, {
      type: 'COLLECT_PAGE_SEGMENTS',
    });
    expect(sendMessageToTab).toHaveBeenNthCalledWith(2, 5, {
      type: 'APPLY_TRANSLATION_RESULT',
      target: {
        kind: 'html-page',
        tabId: 5,
        url: 'https://example.com/article',
      },
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      displayMode: 'bilingual',
    });
    expect(openPdfWorkspace).not.toHaveBeenCalled();
  });

  it('redirects pdf-document targets into a dedicated workspace instead of collecting page segments', async () => {
    const sendMessageToTab = vi.fn();
    const settings = {
      providerId: 'deepseek' as const,
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
      displayMode: 'bilingual' as const,
      autoTranslateOnLoad: false,
      enableYoutubeSubtitleTranslation: true,
      enablePdfDocumentTranslation: true,
      pdfOcrFallback: 'confirm-first' as const,
      youtubeAsrFallback: 'confirm-first' as const,
      subtitleDisplayStyle: 'overlay-bottom' as const,
      translationCacheEnabled: true,
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
          endpoint: 'google-translate' as const,
        },
      },
    };
    const loadSettings = vi.fn().mockResolvedValue(settings);
    const detectTarget = vi.fn().mockResolvedValue({
      kind: 'pdf-document',
      tabId: 9,
      url: 'https://example.com/report.pdf',
      sourceKind: 'http-url',
      displayName: 'report.pdf',
    });
    const openPdfWorkspace = vi.fn().mockResolvedValue(88);

    const handler = createMessageHandler({
      sendMessageToTab,
      translatePage: vi.fn(),
      loadSettings,
      detectTarget,
      openPdfWorkspace,
    });

    await expect(handler({ type: 'START_TRANSLATION_JOB', tabId: 9 })).resolves.toEqual({
      type: 'TRANSLATION_JOB_REDIRECTED',
      target: {
        kind: 'pdf-document',
        tabId: 9,
        url: 'https://example.com/report.pdf',
        sourceKind: 'http-url',
        displayName: 'report.pdf',
      },
      workspaceTabId: 88,
    });

    expect(sendMessageToTab).not.toHaveBeenCalled();
    expect(openPdfWorkspace).toHaveBeenCalledWith(
      {
        kind: 'pdf-document',
        tabId: 9,
        url: 'https://example.com/report.pdf',
        sourceKind: 'http-url',
        displayName: 'report.pdf',
      },
      settings,
    );
  });
});
