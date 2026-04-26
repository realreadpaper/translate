import { describe, expect, it, vi } from 'vitest';

import { createMessageHandler } from '../../src/background/messaging';
import type { TranslationTarget } from '../../src/shared/translation-target';

const defaultSettings = {
  providerId: 'openai-compatible' as const,
  sourceLanguage: 'auto',
  targetLanguage: 'zh-CN',
  displayMode: 'bilingual' as const,
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
      endpoint: 'google-translate' as const,
    },
  },
};

describe('createMessageHandler', () => {
  it('routes html-page jobs through the existing page segment flow', async () => {
    const sendMessageToTab = vi
      .fn()
      .mockImplementation(async (_tabId: number, message: { type: string }) => {
        if (message.type === 'COLLECT_PAGE_SEGMENTS') {
          return [{ id: 'seg-0', text: 'Hello world' }];
        }

        return undefined;
      });
    const detectTarget = vi.fn().mockResolvedValue({
      kind: 'html-page',
      tabId: 1,
      url: 'https://example.com/article',
    } satisfies TranslationTarget);
    const translatePage = vi.fn().mockResolvedValue({
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });
    const loadSettings = vi.fn().mockResolvedValue(defaultSettings);
    const debugLog = vi.fn();

    const handler = createMessageHandler({
      sendMessageToTab,
      translatePage,
      loadSettings,
      detectTarget,
      openPdfWorkspace: vi.fn(),
      debugLog,
    });

    await expect(handler({ type: 'START_TRANSLATION_JOB', tabId: 1 })).resolves.toEqual({
      type: 'PAGE_TRANSLATION_FINISHED',
      target: {
        kind: 'html-page',
        tabId: 1,
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

    expect(sendMessageToTab).toHaveBeenNthCalledWith(1, 1, {
      type: 'COLLECT_PAGE_SEGMENTS',
    });
    expect(sendMessageToTab).toHaveBeenNthCalledWith(2, 1, {
      type: 'APPLY_TRANSLATION_RESULT',
      target: {
        kind: 'html-page',
        tabId: 1,
        url: 'https://example.com/article',
      },
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      displayMode: 'bilingual',
    });
    expect(debugLog).toHaveBeenCalledWith(
      'routing translation job',
      expect.objectContaining({
        messageType: 'START_TRANSLATION_JOB',
        requestedKind: undefined,
        targetKind: 'html-page',
        tabId: 1,
      }),
    );
    expect(debugLog).toHaveBeenCalledWith(
      'html-page translation finished',
      expect.objectContaining({
        tabId: 1,
        translatedCount: 1,
        failedBatchCount: 0,
      }),
    );
  });

  it('keeps legacy page translation messages on the html-page path', async () => {
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
      ...defaultSettings,
      providerId: 'deepseek',
      providers: {
        ...defaultSettings.providers,
        deepseek: {
          apiKey: 'test-key',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-v4-flash',
        },
      },
    });
    const detectTarget = vi.fn().mockResolvedValue({
      kind: 'html-page',
      tabId: 9,
      url: 'https://example.com/article',
    } satisfies TranslationTarget);

    const handler = createMessageHandler({
      sendMessageToTab,
      translatePage,
      loadSettings,
      detectTarget,
      openPdfWorkspace: vi.fn(),
    });

    await expect(handler({ type: 'START_PAGE_TRANSLATION', tabId: 9 })).resolves.toMatchObject({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
    });

    expect(sendMessageToTab).toHaveBeenNthCalledWith(1, 9, {
      type: 'COLLECT_PAGE_SEGMENTS',
    });
    expect(detectTarget).toHaveBeenCalledWith(9, 'html-page');
  });

  it('forces page translation messages to html-page even on youtube and pdf tabs', async () => {
    const sendMessageToTab = vi
      .fn()
      .mockImplementation(async (_tabId: number, message: { type: string }) => {
        if (message.type === 'COLLECT_PAGE_SEGMENTS') {
          return [{ id: 'seg-0', text: 'Hello world' }];
        }

        return undefined;
      });
    const detectTarget = vi.fn().mockResolvedValue({
      kind: 'html-page',
      tabId: 10,
      url: 'https://www.youtube.com/watch?v=demo',
    } satisfies TranslationTarget);

    const handler = createMessageHandler({
      sendMessageToTab,
      translatePage: vi.fn().mockResolvedValue({
        status: 'success',
        translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
        failedBatches: [],
      }),
      loadSettings: vi.fn().mockResolvedValue(defaultSettings),
      detectTarget,
      openPdfWorkspace: vi.fn(),
    });

    await expect(handler({ type: 'START_PAGE_TRANSLATION', tabId: 10 })).resolves.toMatchObject({
      type: 'PAGE_TRANSLATION_FINISHED',
      target: { kind: 'html-page' },
    });

    expect(detectTarget).toHaveBeenCalledWith(10, 'html-page');
    expect(sendMessageToTab).toHaveBeenCalledWith(10, { type: 'COLLECT_PAGE_SEGMENTS' });
  });

  it('translates caller-provided page segments without collecting the whole page', async () => {
    const sendMessageToTab = vi.fn().mockResolvedValue(undefined);
    const translatePage = vi.fn().mockResolvedValue({
      status: 'success',
      translated: [{ id: 'seg-3', translatedText: '视口段落' }],
      failedBatches: [],
    });
    const target = {
      kind: 'html-page',
      tabId: 11,
      url: 'https://example.com/article',
    } satisfies TranslationTarget;

    const handler = createMessageHandler({
      sendMessageToTab,
      translatePage,
      loadSettings: vi.fn().mockResolvedValue(defaultSettings),
      detectTarget: vi.fn().mockResolvedValue(target),
      openPdfWorkspace: vi.fn(),
    });

    await expect(
      handler({
        type: 'START_PAGE_TRANSLATION',
        tabId: 11,
        segments: [{ id: 'seg-3', text: 'Visible paragraph' }],
      }),
    ).resolves.toMatchObject({
      type: 'PAGE_TRANSLATION_FINISHED',
      translated: [{ id: 'seg-3', translatedText: '视口段落' }],
    });

    expect(sendMessageToTab).not.toHaveBeenCalledWith(11, { type: 'COLLECT_PAGE_SEGMENTS' });
    expect(translatePage).toHaveBeenCalledWith(
      [{ id: 'seg-3', text: 'Visible paragraph' }],
      expect.objectContaining({
        providerId: 'openai-compatible',
      }),
    );
    expect(sendMessageToTab).toHaveBeenCalledWith(11, {
      type: 'APPLY_TRANSLATION_RESULT',
      target,
      translated: [{ id: 'seg-3', translatedText: '视口段落' }],
      displayMode: 'bilingual',
    });
  });

  it('redirects pdf-document jobs without collecting page segments', async () => {
    const sendMessageToTab = vi.fn();
    const translatePage = vi.fn();
    const target = {
      kind: 'pdf-document',
      tabId: 12,
      url: 'https://example.com/report.pdf',
      sourceKind: 'http-url',
      displayName: 'report.pdf',
    } satisfies TranslationTarget;
    const openPdfWorkspace = vi.fn().mockResolvedValue(21);

    const handler = createMessageHandler({
      sendMessageToTab,
      translatePage,
      loadSettings: vi.fn().mockResolvedValue(defaultSettings),
      detectTarget: vi.fn().mockResolvedValue(target),
      openPdfWorkspace,
    });

    await expect(handler({ type: 'START_TRANSLATION_JOB', tabId: 12 })).resolves.toEqual({
      type: 'TRANSLATION_JOB_REDIRECTED',
      target,
      workspaceTabId: 21,
    });

    expect(openPdfWorkspace).toHaveBeenCalledWith(target, defaultSettings);
    expect(sendMessageToTab).not.toHaveBeenCalled();
    expect(translatePage).not.toHaveBeenCalled();
  });

  it('starts youtube-subtitles jobs without applying page translations', async () => {
    const sendMessageToTab = vi.fn();
    const translatePage = vi.fn();
    const target = {
      kind: 'youtube-subtitles',
      tabId: 7,
      url: 'https://www.youtube.com/watch?v=demo',
      videoId: 'demo',
    } satisfies TranslationTarget;

    const handler = createMessageHandler({
      sendMessageToTab,
      translatePage,
      loadSettings: vi.fn().mockResolvedValue(defaultSettings),
      detectTarget: vi.fn().mockResolvedValue(target),
      openPdfWorkspace: vi.fn(),
    });

    await expect(handler({ type: 'START_TRANSLATION_JOB', tabId: 7 })).resolves.toEqual({
      type: 'TRANSLATION_JOB_STARTED',
      target,
    });

    expect(sendMessageToTab).not.toHaveBeenCalled();
    expect(translatePage).not.toHaveBeenCalled();
  });
});
