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

  it('retranslates an already translated visible segment when its text expands', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <article>
        <div data-testid="tweetText">Short post</div>
      </article>
    `;
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });
    const tweetText = document.querySelector('[data-testid="tweetText"]') as HTMLElement;
    tweetText.getBoundingClientRect = vi.fn(() => ({
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
    const sendRuntimeMessage = vi
      .fn()
      .mockResolvedValueOnce({
        type: 'PAGE_TRANSLATION_FINISHED',
        status: 'success',
        translated: [{ id: 'seg-0', translatedText: '短帖' }],
        failedBatches: [],
      })
      .mockResolvedValueOnce({
        type: 'PAGE_TRANSLATION_FINISHED',
        status: 'success',
        translated: [{ id: 'seg-0', translatedText: '展开后的长帖' }],
        failedBatches: [],
      });

    mountFloatingBall(document.body, {
      sendRuntimeMessage,
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    await trigger.click();

    tweetText.textContent = 'Short post with expanded content after clicking Show more';
    window.dispatchEvent(new Event('scroll'));
    await vi.runAllTimersAsync();

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      type: 'START_PAGE_TRANSLATION',
      segments: [{ id: 'seg-0', text: 'Short post' }],
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'START_PAGE_TRANSLATION',
      segments: [
        { id: 'seg-0', text: 'Short post with expanded content after clicking Show more' },
      ],
    });
  });

  it('translates visible tweet text inserted after scrolling on dynamic timelines', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main></main>';
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });
    const sendRuntimeMessage = vi
      .fn()
      .mockResolvedValueOnce({
        type: 'PAGE_TRANSLATION_FINISHED',
        status: 'success',
        translated: [],
        failedBatches: [],
      })
      .mockResolvedValueOnce({
        type: 'PAGE_TRANSLATION_FINISHED',
        status: 'success',
        translated: [{ id: 'seg-0', translatedText: '动态帖子' }],
        failedBatches: [],
      });

    mountFloatingBall(document.body, {
      sendRuntimeMessage,
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    await trigger.click();

    const tweetText = document.createElement('div');
    tweetText.dataset.testid = 'tweetText';
    tweetText.textContent = 'Dynamically inserted tweet';
    tweetText.getBoundingClientRect = vi.fn(() => ({
      top: 120,
      bottom: 160,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 120,
      toJSON: () => undefined,
    }));
    document.querySelector('main')?.append(tweetText);

    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'START_PAGE_TRANSLATION',
      segments: [{ id: 'seg-0', text: 'Dynamically inserted tweet' }],
    });
  });

  it('translates generic visible text inserted after viewport mode starts', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main></main>';
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });
    const sendRuntimeMessage = vi
      .fn()
      .mockResolvedValueOnce({
        type: 'PAGE_TRANSLATION_FINISHED',
        status: 'success',
        translated: [],
        failedBatches: [],
      })
      .mockResolvedValueOnce({
        type: 'PAGE_TRANSLATION_FINISHED',
        status: 'success',
        translated: [{ id: 'seg-0', translatedText: '动态卡片' }],
        failedBatches: [],
      });

    mountFloatingBall(document.body, {
      sendRuntimeMessage,
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    await trigger.click();

    const genericCard = document.createElement('div');
    genericCard.textContent = 'Generic card inserted later';
    genericCard.getBoundingClientRect = vi.fn(() => ({
      top: 120,
      bottom: 160,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 120,
      toJSON: () => undefined,
    }));
    document.querySelector('main')?.append(genericCard);

    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'START_PAGE_TRANSLATION',
      segments: [{ id: 'seg-0', text: 'Generic card inserted later' }],
    });
  });

  it('retries dynamic timeline scanning after the current translation finishes', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main></main>';
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });
    let finishFirstTranslation!: (value: {
      type: 'PAGE_TRANSLATION_FINISHED';
      status: 'success';
      translated: [];
      failedBatches: [];
    }) => void;
    const firstTranslation = new Promise((resolve) => {
      finishFirstTranslation = resolve as typeof finishFirstTranslation;
    });
    const sendRuntimeMessage = vi
      .fn()
      .mockReturnValueOnce(firstTranslation)
      .mockResolvedValueOnce({
        type: 'PAGE_TRANSLATION_FINISHED',
        status: 'success',
        translated: [{ id: 'seg-0', translatedText: '翻译中的动态帖子' }],
        failedBatches: [],
      });

    mountFloatingBall(document.body, {
      sendRuntimeMessage,
    });

    const trigger = document.querySelector('[data-floating-ball-trigger]') as HTMLButtonElement;
    void trigger.click();

    const tweetText = document.createElement('div');
    tweetText.dataset.testid = 'tweetText';
    tweetText.textContent = 'Tweet inserted while translating';
    tweetText.getBoundingClientRect = vi.fn(() => ({
      top: 120,
      bottom: 160,
      left: 0,
      right: 100,
      width: 100,
      height: 40,
      x: 0,
      y: 120,
      toJSON: () => undefined,
    }));
    document.querySelector('main')?.append(tweetText);

    await Promise.resolve();
    await vi.runAllTimersAsync();
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);

    finishFirstTranslation({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [],
      failedBatches: [],
    });
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'START_PAGE_TRANSLATION',
      segments: [{ id: 'seg-0', text: 'Tweet inserted while translating' }],
    });
  });
});
