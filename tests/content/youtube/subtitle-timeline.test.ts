import { describe, expect, it } from 'vitest';

import { findActiveCue } from '../../../src/content/youtube/subtitle-timeline';

describe('findActiveCue', () => {
  it('returns the cue active at the current playback time', () => {
    const cues = [
      { id: 'cue-0', startMs: 0, endMs: 1200, text: 'Hello' },
      { id: 'cue-1', startMs: 1200, endMs: 2500, text: 'World' },
    ];

    expect(findActiveCue(cues, 1.3)).toEqual(cues[1]);
  });
});
