import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/popup/App';

afterEach(() => {
  cleanup();
});

describe('Popup App', () => {
  it('keeps translation in the page floating control and only sends display-mode requests', async () => {
    const getActiveTabId = vi.fn().mockResolvedValue(3);
    const updateAutoTranslateOnLoad = vi.fn().mockResolvedValue(undefined);
    const sendRuntimeMessage = vi.fn().mockResolvedValue(undefined);

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
    expect(screen.queryByRole('button', { name: '手动执行本页翻译' })).toBeNull();
    expect(screen.getByText('在页面右下角点击悬浮球「译」开始翻译')).toBeTruthy();
    expect(screen.getByText('网页和 YouTube 从页面内触发，PDF 使用右键菜单。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '双语' }));
    fireEvent.click(screen.getByRole('button', { name: '原文' }));
    fireEvent.click(screen.getByRole('button', { name: '译文' }));

    await waitFor(() => {
      expect(getActiveTabId).toHaveBeenCalled();
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

    await waitFor(() => {
      expect(screen.getByText('当前模式：仅译文')).toBeTruthy();
    });

    expect(getActiveTabId).toHaveBeenCalledTimes(3);
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(3);
    expect(updateAutoTranslateOnLoad).not.toHaveBeenCalled();
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      type: 'SET_DISPLAY_MODE',
      tabId: 3,
      displayMode: 'bilingual',
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'SET_DISPLAY_MODE',
      tabId: 3,
      displayMode: 'original-only',
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
      type: 'SET_DISPLAY_MODE',
      tabId: 3,
      displayMode: 'translated-only',
    });
  });

  it('shows a readable message when display-mode changes cannot reach the page', async () => {
    const getActiveTabId = vi.fn().mockResolvedValue(3);
    const updateAutoTranslateOnLoad = vi.fn().mockResolvedValue(undefined);
    const sendRuntimeMessage = vi.fn().mockRejectedValue(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );

    render(
      <App
        getActiveTabId={getActiveTabId}
        sendRuntimeMessage={sendRuntimeMessage}
        autoTranslateOnLoad={true}
        updateAutoTranslateOnLoad={updateAutoTranslateOnLoad}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '译文' }));

    await waitFor(() => {
      expect(screen.getByText('当前页面暂时无法切换显示模式，请刷新后通过悬浮球重试')).toBeTruthy();
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
      expect(screen.getByText('自动翻译已开启：进入页面后自动执行翻译')).toBeTruthy();
    });
  });

  it('shows the eye-care pdf translation fallback action for pdf tabs', async () => {
    const openPdfWorkspace = vi.fn().mockResolvedValue(undefined);

    render(
      <App
        getActiveTabId={vi.fn().mockResolvedValue(3)}
        sendRuntimeMessage={vi.fn().mockResolvedValue(undefined)}
        autoTranslateOnLoad={false}
        updateAutoTranslateOnLoad={vi.fn().mockResolvedValue(undefined)}
        activeTabKind="pdf-document"
        openPdfWorkspace={openPdfWorkspace}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '护眼翻译此 PDF' }));

    await waitFor(() => {
      expect(openPdfWorkspace).toHaveBeenCalled();
      expect(screen.getByText('已打开护眼 PDF 翻译工作台')).toBeTruthy();
    });
  });

  it('shows a readable message when the pdf workspace cannot be opened', async () => {
    const openPdfWorkspace = vi.fn().mockRejectedValue(new Error('Active tab id is unavailable.'));

    render(
      <App
        getActiveTabId={vi.fn().mockResolvedValue(3)}
        sendRuntimeMessage={vi.fn().mockResolvedValue(undefined)}
        autoTranslateOnLoad={false}
        updateAutoTranslateOnLoad={vi.fn().mockResolvedValue(undefined)}
        activeTabKind="pdf-document"
        openPdfWorkspace={openPdfWorkspace}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '护眼翻译此 PDF' }));

    await waitFor(() => {
      expect(openPdfWorkspace).toHaveBeenCalled();
      expect(screen.getByText('打开失败：Active tab id is unavailable.')).toBeTruthy();
    });
  });
});
