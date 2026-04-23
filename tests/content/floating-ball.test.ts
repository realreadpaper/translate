import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountFloatingBall } from '../../src/content/floating-ball';

describe('mountFloatingBall', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('starts page translation from the floating ball and opens mode controls after success', async () => {
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });
    const openOptionsPage = vi.fn();

    const controller = mountFloatingBall(document.body, {
      sendRuntimeMessage,
      openOptionsPage,
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    expect(trigger.dataset.state).toBe('idle');

    await trigger.click();

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'START_PAGE_TRANSLATION',
    });

    expect(document.body.textContent).toContain('已完成 1 段翻译');
    expect(trigger.dataset.state).toBe('translated');

    await trigger.click();
    const translatedButton = document.querySelector(
      '[data-floating-ball-mode="translated-only"]',
    ) as HTMLButtonElement;
    expect(translatedButton).not.toBeNull();

    await translatedButton.click();

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'SET_DISPLAY_MODE',
      displayMode: 'translated-only',
    });
    expect(document.body.textContent).toContain('当前模式：仅译文');

    const settingsButton = document.querySelector(
      '[data-floating-ball-settings]',
    ) as HTMLButtonElement;
    await settingsButton.click();
    expect(openOptionsPage).toHaveBeenCalled();

    controller.updateDisplayMode('original-only');
    expect(document.body.textContent).toContain('当前模式：仅原文');
  });

  it('shows a readable failure state when translation request fails', async () => {
    const sendRuntimeMessage = vi.fn().mockRejectedValue(new Error('DeepSeek 请求失败'));

    mountFloatingBall(document.body, {
      sendRuntimeMessage,
      openOptionsPage: vi.fn(),
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    await trigger.click();

    expect(document.body.textContent).toContain('翻译失败：DeepSeek 请求失败');
    expect(document.body.textContent).toContain('当前模式：双语');
    expect(trigger.dataset.state).toBe('error');
  });

  it('marks partial success distinctly for follow-up retries', async () => {
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'partial-success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [{ segmentIds: ['seg-1'], message: 'rate limited' }],
    });

    mountFloatingBall(document.body, {
      sendRuntimeMessage,
      openOptionsPage: vi.fn(),
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    await trigger.click();

    expect(document.body.textContent).toContain('已完成 1 段翻译，1 个批次失败');
    expect(trigger.dataset.state).toBe('partial-success');
  });

  it('starts translating immediately when auto-start is enabled', async () => {
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });

    mountFloatingBall(document.body, {
      sendRuntimeMessage,
      openOptionsPage: vi.fn(),
      autoStart: true,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'START_PAGE_TRANSLATION',
    });
    expect(document.body.textContent).toContain('已完成 1 段翻译');
  });
});
