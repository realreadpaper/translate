import { beforeEach, describe, expect, it } from 'vitest';

import { collectYoutubeSubtitleCues } from '../../../src/content/youtube/subtitle-source';

describe('collectYoutubeSubtitleCues', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section>
        <div data-start-ms="0" data-end-ms="800">Hello</div>
        <div data-start-ms="800" data-end-ms="1600">world</div>
      </section>
    `;
  });

  it('collects time-coded subtitle cues from the document', async () => {
    await expect(collectYoutubeSubtitleCues(document)).resolves.toEqual([
      { id: 'cue-0', startMs: 0, endMs: 800, text: 'Hello' },
      { id: 'cue-1', startMs: 800, endMs: 1600, text: 'world' },
    ]);
  });
});
