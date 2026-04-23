import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/popup/App';

afterEach(() => {
  cleanup();
});

describe('Popup App', () => {
  it('sends translation and display-mode requests for the active tab and shows success state', async () => {
    const getActiveTabId = vi.fn().mockResolvedValue(3);
    const updateAutoTranslateOnLoad = vi.fn().mockResolvedValue(undefined);
    let resolveTranslation: ((value: {
      type: 'PAGE_TRANSLATION_FINISHED';
      status: 'success';
      translated: Array<{ id: string; translatedText: string }>;
      failedBatches: Array<{ segmentIds: string[]; message: string }>;
    }) => void) | undefined;
    const sendRuntimeMessage = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveTranslation = resolve;
          }),
      )
      .mockResolvedValue(undefined);

    render(
      <App
        getActiveTabId={getActiveTabId}
        sendRuntimeMessage={sendRuntimeMessage}
        autoTranslateOnLoad={false}
        updateAutoTranslateOnLoad={updateAutoTranslateOnLoad}
      />,
    );

    expect(screen.getByText('让整页阅读更自然')).toBeTruthy();
    expect(screen.getByText('DeepSeek')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: '打开页面自动翻译' })).toBeTruthy();

    const translateButton = screen.getByRole('button', { name: '立即翻译当前页面' });
    fireEvent.click(translateButton);
    expect((translateButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '双语' }));
    fireEvent.click(screen.getByRole('button', { name: '原文' }));
    fireEvent.click(screen.getByRole('button', { name: '译文' }));

    await waitFor(() => {
      expect(getActiveTabId).toHaveBeenCalled();
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        type: 'START_PAGE_TRANSLATION',
        tabId: 3,
      });
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        type: 'SET_DISPLAY_MODE',
        tabId: 3,
        displayMode: 'bilingual',
      });
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        type: 'SET_DISPLAY_MODE',
        tabId: 3,
        displayMode: 'original-only',
      });
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        type: 'SET_DISPLAY_MODE',
        tabId: 3,
        displayMode: 'translated-only',
      });
    });

    resolveTranslation?.({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });

    await waitFor(() => {
      expect((translateButton as HTMLButtonElement).disabled).toBe(false);
      expect(screen.getByText('已完成 1 段翻译')).toBeTruthy();
      expect(screen.getByText('当前模式：仅译文')).toBeTruthy();
    });

    expect(getActiveTabId).toHaveBeenCalledTimes(4);
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(4);
    expect(updateAutoTranslateOnLoad).not.toHaveBeenCalled();
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      type: 'START_PAGE_TRANSLATION',
      tabId: 3,
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'SET_DISPLAY_MODE',
      tabId: 3,
      displayMode: 'bilingual',
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
      type: 'SET_DISPLAY_MODE',
      tabId: 3,
      displayMode: 'original-only',
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(4, {
      type: 'SET_DISPLAY_MODE',
      tabId: 3,
      displayMode: 'translated-only',
    });
  });

  it('shows a readable failure message when translation fails', async () => {
    const getActiveTabId = vi.fn().mockResolvedValue(3);
    const updateAutoTranslateOnLoad = vi.fn().mockResolvedValue(undefined);
    const sendRuntimeMessage = vi
      .fn()
      .mockResolvedValueOnce({
        type: 'PAGE_TRANSLATION_FAILED',
        message: 'DeepSeek 请求失败',
      })
      .mockResolvedValue(undefined);

    render(
      <App
        getActiveTabId={getActiveTabId}
        sendRuntimeMessage={sendRuntimeMessage}
        autoTranslateOnLoad={true}
        updateAutoTranslateOnLoad={updateAutoTranslateOnLoad}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '立即翻译当前页面' }));

    await waitFor(() => {
      expect(screen.getByText('翻译失败：DeepSeek 请求失败')).toBeTruthy();
      expect(screen.getByText('当前模式：双语')).toBeTruthy();
    });
  });

  it('updates the auto-translate preference from popup', async () => {
    const updateAutoTranslateOnLoad = vi.fn().mockResolvedValue(undefined);

    render(
      <App
        getActiveTabId={vi.fn().mockResolvedValue(3)}
        sendRuntimeMessage={vi.fn().mockResolvedValue(undefined)}
        autoTranslateOnLoad={false}
        updateAutoTranslateOnLoad={updateAutoTranslateOnLoad}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: '打开页面自动翻译' });
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(updateAutoTranslateOnLoad).toHaveBeenCalledWith(true);
      expect(screen.getByText('已开启：进入页面后自动翻译')).toBeTruthy();
    });
  });
});
