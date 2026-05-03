import { describe, expect, it } from 'vitest';

import { createYoutubePrefetchBatches } from '../../../src/content/youtube/prefetch-queue';

describe('createYoutubePrefetchBatches', () => {
  it('prioritizes urgent cues and separates wider prefetch and background work', () => {
    const batches = createYoutubePrefetchBatches({
      cues: [
        { id: 'cue-0', text: 'Now', startMs: 1000, endMs: 2000 },
        { id: 'cue-1', text: 'Soon', startMs: 20_000, endMs: 22_000 },
        { id: 'cue-2', text: 'Window', startMs: 120_000, endMs: 122_000 },
        { id: 'cue-3', text: 'Later', startMs: 600_000, endMs: 602_000 },
      ],
      nowMs: 0,
      translatedIds: new Set(),
      pendingIds: new Set(),
      translatedTextBySourceText: new Map(),
    });

    expect(batches).toEqual([
      {
        lane: 'urgent',
        segments: [
          { id: 'cue-0', text: 'Now' },
          { id: 'cue-1', text: 'Soon' },
        ],
      },
      { lane: 'prefetch', segments: [{ id: 'cue-2', text: 'Window' }] },
      { lane: 'background', segments: [{ id: 'cue-3', text: 'Later' }] },
    ]);
  });

  it('skips translated, pending, and repeated source text cues', () => {
    const batches = createYoutubePrefetchBatches({
      cues: [
        { id: 'cue-0', text: 'Hello', startMs: 1000, endMs: 2000 },
        { id: 'cue-1', text: 'Pending', startMs: 3000, endMs: 4000 },
        { id: 'cue-2', text: 'Repeated', startMs: 5000, endMs: 6000 },
      ],
      nowMs: 0,
      translatedIds: new Set(['cue-0']),
      pendingIds: new Set(['cue-1']),
      translatedTextBySourceText: new Map([['repeated', '重复']]),
    });

    expect(batches).toEqual([]);
  });
});
