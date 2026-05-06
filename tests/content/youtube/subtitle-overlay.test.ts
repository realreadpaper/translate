import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cacheYoutubeSubtitleCues,
  renderYoutubeSubtitleOverlay,
  reserveTrackCueIds,
  updateYoutubeSubtitleOverlayDisplayMode,
} from '../../../src/content/youtube/subtitle-overlay';

describe('renderYoutubeSubtitleOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="movie_player"><video></video></div>';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders a translated subtitle overlay that follows the active cue', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([
      { id: 'cue-0', text: 'Hello', startMs: 1000, endMs: 3000 },
      { id: 'cue-1', text: 'Later', startMs: 4000, endMs: 5000 },
    ]);

    renderYoutubeSubtitleOverlay(
      [
        { id: 'cue-0', translatedText: '你好' },
        { id: 'cue-1', translatedText: '稍后' },
      ],
      'bilingual',
    );

    const overlay = document.querySelector('[data-youtube-subtitle-overlay]');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Hello');
    expect(overlay?.textContent).toContain('你好');
  });

  it('updates display mode using the last rendered subtitle result', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([{ id: 'cue-0', text: 'Hello', startMs: 1000, endMs: 3000 }]);
    renderYoutubeSubtitleOverlay([{ id: 'cue-0', translatedText: '你好' }], 'bilingual');

    updateYoutubeSubtitleOverlayDisplayMode('translated-only');

    const overlay = document.querySelector('[data-youtube-subtitle-overlay]');
    expect(overlay?.textContent).not.toContain('Hello');
    expect(overlay?.textContent).toContain('你好');
  });

  it('reuses one video listener set across repeated renders', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    const addEventListener = vi.spyOn(video, 'addEventListener');
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([{ id: 'cue-0', text: 'Hello', startMs: 1000, endMs: 3000 }]);

    renderYoutubeSubtitleOverlay([{ id: 'cue-0', translatedText: '你好' }], 'bilingual');
    renderYoutubeSubtitleOverlay([{ id: 'cue-0', translatedText: '您好' }], 'translated-only');

    expect(addEventListener).toHaveBeenCalledTimes(2);
    expect(addEventListener).toHaveBeenCalledWith('timeupdate', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith('seeked', expect.any(Function));
    expect(document.querySelector('[data-youtube-subtitle-overlay]')?.textContent).toContain(
      '您好',
    );
  });

  it('keeps existing translated cues when an incremental subtitle result arrives', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([
      { id: 'cue-0', text: 'Hello', startMs: 1000, endMs: 3000 },
      { id: 'cue-1', text: 'Later', startMs: 4000, endMs: 5000 },
    ]);
    renderYoutubeSubtitleOverlay([{ id: 'cue-0', translatedText: '你好' }], 'bilingual');
    renderYoutubeSubtitleOverlay([{ id: 'cue-1', translatedText: '稍后' }], 'bilingual');

    const overlay = document.querySelector('[data-youtube-subtitle-overlay]');
    expect(overlay?.textContent).toContain('Hello');
    expect(overlay?.textContent).toContain('你好');
  });

  it('requests incremental translation when rendered YouTube captions change', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container">
          <span class="ytp-caption-segment">Hello</span>
        </div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([{ id: 'rendered-cue-0', text: 'Hello', startMs: 0, endMs: 60000 }]);
    const sendRuntimeMessage = vi.fn().mockResolvedValue(undefined);

    renderYoutubeSubtitleOverlay(
      [{ id: 'rendered-cue-0', translatedText: '你好' }],
      'bilingual',
      'overlay-bottom',
      { sendRuntimeMessage },
    );

    const segment = document.querySelector('.ytp-caption-segment') as HTMLElement;
    segment.textContent = 'Welcome back';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(160);

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: [{ id: 'rendered-cue-1', text: 'Welcome back' }],
    });
  });

  it('hides native YouTube captions and renders both subtitle languages in the overlay', () => {
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container">
          <span class="ytp-caption-segment">Hello from YouTube</span>
        </div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([
      { id: 'cue-0', text: 'Hello from YouTube', startMs: 1000, endMs: 3000 },
    ]);

    renderYoutubeSubtitleOverlay(
      [{ id: 'cue-0', translatedText: '来自 YouTube 的你好' }],
      'bilingual',
    );

    const overlay = document.querySelector('[data-youtube-subtitle-overlay]');
    const player = document.querySelector('#movie_player');
    expect(
      player?.getAttribute('data-immersive-youtube-overlay-active'),
    ).toBe('true');
    expect(overlay?.textContent).toContain('Hello from YouTube');
    expect(overlay?.textContent).toContain('来自 YouTube 的你好');
  });

  it('shows overlay original text while translation is still pending and native captions are hidden', () => {
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container">
          <span class="ytp-caption-segment">Hello from YouTube</span>
        </div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([
      { id: 'cue-0', text: 'Hello from YouTube', startMs: 1000, endMs: 3000 },
    ]);

    renderYoutubeSubtitleOverlay([], 'bilingual');

    const overlay = document.querySelector('[data-youtube-subtitle-overlay]') as HTMLElement;
    const player = document.querySelector('#movie_player');
    expect(
      player?.getAttribute('data-immersive-youtube-overlay-active'),
    ).toBe('true');
    expect(overlay.dataset.empty).toBe('false');
    expect(overlay.textContent).toContain('Hello from YouTube');
  });

  it('marks the document so YouTube captions outside the player are hidden too', () => {
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
      </div>
      <div class="ytp-caption-window-container">
        <span class="ytp-caption-segment">Detached caption</span>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([
      { id: 'cue-0', text: 'Detached caption', startMs: 1000, endMs: 3000 },
    ]);

    renderYoutubeSubtitleOverlay([{ id: 'cue-0', translatedText: '分离字幕' }], 'bilingual');

    const style = document.querySelector('#immersive-ai-translate-youtube-subtitle-style');
    expect(document.documentElement.getAttribute('data-immersive-youtube-overlay-active')).toBe(
      'true',
    );
    expect(style?.textContent).toContain(
      'html[data-immersive-youtube-overlay-active="true"] .ytp-caption-window-container',
    );
    expect(document.querySelector('[data-youtube-subtitle-overlay]')?.textContent).toContain(
      'Detached caption',
    );
  });

  it('prefetches upcoming untranslated cues from a full subtitle track', async () => {
    vi.useFakeTimers();
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([
      { id: 'cue-0', text: 'Hello', startMs: 1000, endMs: 3000 },
      { id: 'cue-1', text: 'Next line', startMs: 5000, endMs: 7000 },
      { id: 'cue-2', text: 'Later line', startMs: 18000, endMs: 20000 },
      { id: 'cue-3', text: 'Far future', startMs: 90000, endMs: 92000 },
    ]);
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [
        { id: 'cue-1', translatedText: '下一句' },
        { id: 'cue-2', translatedText: '稍后一句' },
      ],
      failedBatches: [],
    });

    renderYoutubeSubtitleOverlay(
      [{ id: 'cue-0', translatedText: '你好' }],
      'bilingual',
      'overlay-bottom',
      { sendRuntimeMessage },
    );
    await vi.advanceTimersByTimeAsync(160);

    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: [{ id: 'cue-1', text: 'Next line' }],
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: [{ id: 'cue-2', text: 'Later line' }],
    });
  });

  it('prefetches full-track subtitles without waiting for the old 120ms debounce', async () => {
    vi.useFakeTimers();
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([
      { id: 'cue-0', text: 'Hello', startMs: 1000, endMs: 3000 },
      { id: 'cue-1', text: 'Next line', startMs: 5000, endMs: 7000 },
    ]);
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [],
      failedBatches: [],
    });

    renderYoutubeSubtitleOverlay([], 'bilingual', 'overlay-bottom', { sendRuntimeMessage });
    await vi.advanceTimersByTimeAsync(50);

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: [{ id: 'cue-0', text: 'Hello' }],
    });
  });

  it('requests live rendered caption translation without waiting for the old 120ms debounce', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container">
          <span class="ytp-caption-segment">Hello</span>
        </div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([{ id: 'rendered-cue-0', text: 'Hello', startMs: 0, endMs: 60000 }]);
    const sendRuntimeMessage = vi.fn().mockResolvedValue(undefined);

    renderYoutubeSubtitleOverlay(
      [{ id: 'rendered-cue-0', translatedText: '你好' }],
      'bilingual',
      'overlay-bottom',
      { sendRuntimeMessage },
    );

    const segment = document.querySelector('.ytp-caption-segment') as HTMLElement;
    segment.textContent = 'Welcome back';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60);

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: [{ id: 'rendered-cue-1', text: 'Welcome back' }],
    });
  });

  it('logs live rendered subtitles as original text and translated Chinese text', async () => {
    vi.useFakeTimers();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container">
          <span class="ytp-caption-segment">Hello</span>
        </div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([{ id: 'rendered-cue-0', text: 'Hello', startMs: 0, endMs: 60000 }]);
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'rendered-cue-1', translatedText: '欢迎回来' }],
      failedBatches: [],
    });

    renderYoutubeSubtitleOverlay(
      [{ id: 'rendered-cue-0', translatedText: '你好' }],
      'bilingual',
      'overlay-bottom',
      { sendRuntimeMessage },
    );

    const segment = document.querySelector('.ytp-caption-segment') as HTMLElement;
    segment.textContent = 'Welcome back';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Immersive AI Translate]',
      'youtube subtitle captured',
      { originalText: 'Welcome back' },
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Immersive AI Translate]',
      'youtube subtitle translated',
      { originalText: 'Welcome back', translatedText: '欢迎回来' },
    );
    expect(consoleSpy).not.toHaveBeenCalledWith(
      '[Immersive AI Translate]',
      'youtube rendered caption live translation response received',
      expect.anything(),
    );
  });

  it('prioritizes the nearest unreserved track cue before the wider lookahead batch', async () => {
    vi.useFakeTimers();
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([
      { id: 'cue-0', text: 'Hello', startMs: 1000, endMs: 3000 },
      { id: 'cue-1', text: 'Next line', startMs: 5000, endMs: 7000 },
      { id: 'cue-2', text: 'Later line', startMs: 9000, endMs: 11000 },
      { id: 'cue-3', text: 'Third line', startMs: 13000, endMs: 15000 },
    ]);
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [],
      failedBatches: [],
    });

    renderYoutubeSubtitleOverlay([], 'bilingual', 'overlay-bottom', { sendRuntimeMessage });
    reserveTrackCueIds(['cue-0']);
    await vi.advanceTimersByTimeAsync(160);

    expect(sendRuntimeMessage).toHaveBeenCalledTimes(2);
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: [{ id: 'cue-1', text: 'Next line' }],
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: [
        { id: 'cue-2', text: 'Later line' },
        { id: 'cue-3', text: 'Third line' },
      ],
    });
  });

  it('reuses cached translations for repeated full-track subtitle text without another request', async () => {
    vi.useFakeTimers();
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 5.5,
    });
    cacheYoutubeSubtitleCues([
      { id: 'cue-0', text: 'Repeated line', startMs: 1000, endMs: 3000 },
      { id: 'cue-1', text: 'Repeated line', startMs: 5000, endMs: 7000 },
    ]);
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [],
      failedBatches: [],
    });

    renderYoutubeSubtitleOverlay(
      [{ id: 'cue-0', translatedText: '重复字幕' }],
      'bilingual',
      'overlay-bottom',
      { sendRuntimeMessage },
    );
    await vi.advanceTimersByTimeAsync(160);

    expect(sendRuntimeMessage).not.toHaveBeenCalled();
    expect(document.querySelector('[data-youtube-subtitle-overlay]')?.textContent).toContain(
      '重复字幕',
    );
  });

  it('translates live rendered captions asynchronously without pausing playback', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container">
          <span class="ytp-caption-segment">Hello</span>
        </div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    let paused = false;
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const play = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    cacheYoutubeSubtitleCues([{ id: 'rendered-cue-0', text: 'Hello', startMs: 0, endMs: 60000 }]);
    let resolveTranslation!: (value: unknown) => void;
    const translationPromise = new Promise((resolve) => {
      resolveTranslation = resolve;
    });
    const sendRuntimeMessage = vi.fn().mockReturnValue(translationPromise);

    renderYoutubeSubtitleOverlay(
      [{ id: 'rendered-cue-0', translatedText: '你好' }],
      'bilingual',
      'overlay-bottom',
      { sendRuntimeMessage },
    );

    const segment = document.querySelector('.ytp-caption-segment') as HTMLElement;
    segment.textContent = 'Welcome back';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(160);

    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();

    resolveTranslation({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'rendered-cue-1', translatedText: '欢迎回来' }],
      failedBatches: [],
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(play).not.toHaveBeenCalled();
    expect(document.querySelector('[data-youtube-subtitle-overlay]')?.textContent).toContain(
      '欢迎回来',
    );
  });

  it('leaves paused videos paused while live rendered caption translation runs', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container">
          <span class="ytp-caption-segment">Hello</span>
        </div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'paused', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    const pause = vi.spyOn(video, 'pause');
    const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
    cacheYoutubeSubtitleCues([{ id: 'rendered-cue-0', text: 'Hello', startMs: 0, endMs: 60000 }]);
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'rendered-cue-1', translatedText: '欢迎回来' }],
      failedBatches: [],
    });

    renderYoutubeSubtitleOverlay(
      [{ id: 'rendered-cue-0', translatedText: '你好' }],
      'bilingual',
      'overlay-bottom',
      { sendRuntimeMessage },
    );

    const segment = document.querySelector('.ytp-caption-segment') as HTMLElement;
    segment.textContent = 'Welcome back';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(160);

    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('does not pause or resume playback when live rendered caption translation is slow', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container">
          <span class="ytp-caption-segment">Hello</span>
        </div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    let paused = false;
    Object.defineProperty(video, 'paused', {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    const play = vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return Promise.resolve();
    });
    cacheYoutubeSubtitleCues([{ id: 'rendered-cue-0', text: 'Hello', startMs: 0, endMs: 60000 }]);
    const sendRuntimeMessage = vi.fn().mockReturnValue(new Promise(() => undefined));

    renderYoutubeSubtitleOverlay(
      [{ id: 'rendered-cue-0', translatedText: '你好' }],
      'bilingual',
      'overlay-bottom',
      { sendRuntimeMessage },
    );

    const segment = document.querySelector('.ytp-caption-segment') as HTMLElement;
    segment.textContent = 'Welcome back';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(160);
    expect(play).not.toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2500);

    expect(play).not.toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();

    segment.textContent = 'Another delayed caption';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(160);

    expect(sendRuntimeMessage).toHaveBeenCalledTimes(2);
    expect(video.pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });
});
