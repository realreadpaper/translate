import { beforeEach, describe, expect, it, vi } from 'vitest';

import { collectYoutubeSubtitleSegments } from '../../../src/content/youtube/subtitle-source';

describe('collectYoutubeSubtitleSegments', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('collects complete subtitle cues from YouTube caption tracks', async () => {
    Object.assign(window, {
      ytInitialPlayerResponse: {
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=en' }],
          },
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `
          <transcript>
            <text start="1.5" dur="2">Hello &amp; welcome</text>
            <text start="4" dur="1.25">Back again</text>
          </transcript>
        `,
      }),
    );

    await expect(collectYoutubeSubtitleSegments()).resolves.toEqual([
      { id: 'cue-0', text: 'Hello & welcome' },
      { id: 'cue-1', text: 'Back again' },
    ]);
  });

  it('prefers a caption track that matches the requested source language', async () => {
    Object.assign(window, {
      ytInitialPlayerResponse: {
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              { baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=en', languageCode: 'en' },
              { baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=ja', languageCode: 'ja' },
            ],
          },
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<transcript><text start="0" dur="1">こんにちは</text></transcript>',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectYoutubeSubtitleSegments('ja')).resolves.toEqual([
      { id: 'cue-0', text: 'こんにちは' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('https://www.youtube.com/api/timedtext?v=demo&lang=ja');
  });

  it('prefers an English manual caption track when source language is auto', async () => {
    Object.assign(window, {
      ytInitialPlayerResponse: {
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              { baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=ja', languageCode: 'ja' },
              { baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=en', languageCode: 'en' },
              { baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=en&kind=asr', languageCode: 'en', kind: 'asr' },
            ],
          },
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<transcript><text start="0" dur="1">Hello</text></transcript>',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectYoutubeSubtitleSegments('auto')).resolves.toEqual([
      { id: 'cue-0', text: 'Hello' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('https://www.youtube.com/api/timedtext?v=demo&lang=en');
  });

  it('parses json3 subtitle responses', async () => {
    Object.assign(window, {
      ytInitialPlayerResponse: {
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=en' }],
          },
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({
          events: [
            {
              tStartMs: 1200,
              dDurationMs: 800,
              segs: [{ utf8: 'Hello' }, { utf8: ' world' }],
            },
          ],
        }),
      }),
    );

    await expect(collectYoutubeSubtitleSegments()).resolves.toEqual([
      { id: 'cue-0', text: 'Hello world' },
    ]);
  });

  it('reports empty timedtext responses distinctly from missing caption tracks', async () => {
    Object.assign(window, {
      ytInitialPlayerResponse: {
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=en' }],
          },
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '',
      }),
    );

    await expect(collectYoutubeSubtitleSegments()).rejects.toThrow('字幕轨道存在');
  });
});
