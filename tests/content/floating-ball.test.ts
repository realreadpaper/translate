import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountFloatingBall } from '../../src/content/floating-ball';

describe('mountFloatingBall', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('starts page translation from the floating ball without rendering a control panel', async () => {
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });

    const controller = mountFloatingBall(document.body, {
      sendRuntimeMessage,
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    expect(trigger.dataset.state).toBe('idle');
    expect(document.querySelector('[data-floating-ball-panel]')).toBeNull();

    await trigger.click();

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'START_PAGE_TRANSLATION',
    });
    expect(trigger.dataset.state).toBe('translated');
    expect(document.body.textContent).not.toContain('双语');
    expect(document.body.textContent).not.toContain('设置');

    controller.markTranslated();
    expect(trigger.dataset.state).toBe('translated');
  });

  it('shows an error state when translation request fails', async () => {
    const sendRuntimeMessage = vi.fn().mockRejectedValue(new Error('DeepSeek 请求失败'));

    mountFloatingBall(document.body, {
      sendRuntimeMessage,
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    await trigger.click();

    expect(trigger.dataset.state).toBe('error');
    expect(trigger.title).toContain('翻译失败：DeepSeek 请求失败');
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
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    await trigger.click();

    expect(trigger.dataset.state).toBe('partial-success');
    expect(trigger.title).toContain('1 个批次失败');
  });

  it('translates viewport segments first and continues when scrolling', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <article>
        <p>Visible paragraph</p>
        <p>Below paragraph</p>
        <p>Far paragraph</p>
      </article>
    `;
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });
    const paragraphs = Array.from(document.querySelectorAll('p')) as HTMLElement[];
    paragraphs[0].getBoundingClientRect = vi.fn(() => ({
      top: 100,
      bottom: 140,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => undefined,
    }));
    paragraphs[1].getBoundingClientRect = vi.fn(() => ({
      top: 760,
      bottom: 800,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 760,
      toJSON: () => undefined,
    }));
    paragraphs[2].getBoundingClientRect = vi.fn(() => ({
      top: 1800,
      bottom: 1840,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 1800,
      toJSON: () => undefined,
    }));
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '可见段落' }],
      failedBatches: [],
    });

    mountFloatingBall(document.body, {
      sendRuntimeMessage,
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    await trigger.click();

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      type: 'START_PAGE_TRANSLATION',
      segments: [{ id: 'seg-0', text: 'Visible paragraph' }],
    });

    sendRuntimeMessage.mockResolvedValueOnce({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'seg-1', translatedText: '下方段落' }],
      failedBatches: [],
    });
    paragraphs[1].getBoundingClientRect = vi.fn(() => ({
      top: 320,
      bottom: 360,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 320,
      toJSON: () => undefined,
    }));

    window.dispatchEvent(new Event('scroll'));
    await vi.runAllTimersAsync();

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'START_PAGE_TRANSLATION',
      segments: [{ id: 'seg-1', text: 'Below paragraph' }],
    });
  });
});
