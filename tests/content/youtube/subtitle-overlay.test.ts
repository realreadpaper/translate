import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cacheYoutubeSubtitleCues,
  renderYoutubeSubtitleOverlay,
  updateYoutubeSubtitleOverlayDisplayMode,
} from '../../../src/content/youtube/subtitle-overlay';

describe('renderYoutubeSubtitleOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="movie_player"><video></video></div>';
    vi.restoreAllMocks();
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

  it('queues untranslated full-track cues for background prefetch translation', () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 1.2,
    });
    cacheYoutubeSubtitleCues([
      { id: 'cue-0', text: 'Hello', startMs: 1000, endMs: 3000 },
      { id: 'cue-1', text: 'Soon', startMs: 20_000, endMs: 22_000 },
      { id: 'cue-2', text: 'Window', startMs: 120_000, endMs: 122_000 },
      { id: 'cue-3', text: 'Later', startMs: 600_000, endMs: 602_000 },
    ]);
    const sendRuntimeMessage = vi.fn().mockResolvedValue({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [],
      failedBatches: [],
    });

    renderYoutubeSubtitleOverlay([], 'bilingual', 'overlay-bottom', { sendRuntimeMessage });

    expect(sendRuntimeMessage).toHaveBeenCalledTimes(3);
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: [
        { id: 'cue-0', text: 'Hello' },
        { id: 'cue-1', text: 'Soon' },
      ],
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: [{ id: 'cue-2', text: 'Window' }],
    });
    expect(sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
      type: 'START_TRANSLATION_JOB',
      targetKind: 'youtube-subtitles',
      segments: [{ id: 'cue-3', text: 'Later' }],
    });
  });
});
