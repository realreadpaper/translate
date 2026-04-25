import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountYoutubeSubtitleOverlay } from '../../../src/content/youtube/subtitle-overlay';

describe('mountYoutubeSubtitleOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="player"></div>';
  });

  it('renders bilingual subtitles for the active cue', () => {
    const cue = { id: 'cue-0', startMs: 0, endMs: 1200, text: 'Hello' };
    const overlay = mountYoutubeSubtitleOverlay(document.body, {
      displayStyle: 'overlay-bottom',
      getOriginalCue: () => cue,
      getTranslatedText: (cueId) => (cueId === 'cue-0' ? '你好' : null),
      getDisplayMode: () => 'bilingual',
    });

    overlay.render();

    expect(document.body.textContent).toContain('Hello');
    expect(document.body.textContent).toContain('你好');
  });

  it('renders translated-only subtitles when the mode changes', () => {
    const cue = { id: 'cue-0', startMs: 0, endMs: 1200, text: 'Hello' };
    const getDisplayMode = vi.fn(() => 'translated-only' as const);
    const overlay = mountYoutubeSubtitleOverlay(document.body, {
      displayStyle: 'overlay-top',
      getOriginalCue: () => cue,
      getTranslatedText: () => '你好',
      getDisplayMode,
    });

    overlay.render();

    expect(document.body.textContent).not.toContain('Hello');
    expect(document.body.textContent).toContain('你好');
  });
});
