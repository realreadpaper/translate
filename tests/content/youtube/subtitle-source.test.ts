import { beforeEach, describe, expect, it, vi } from 'vitest';

import { collectYoutubeSubtitleSegments } from '../../../src/content/youtube/subtitle-source';

describe('collectYoutubeSubtitleSegments', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as unknown as { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
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

  it('uses already rendered YouTube captions immediately before fetching timedtext tracks', async () => {
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container">
          <span class="ytp-caption-segment">Already visible caption</span>
        </div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 18,
    });
    Object.assign(window, {
      ytInitialPlayerResponse: {
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=en' }],
          },
        },
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectYoutubeSubtitleSegments()).resolves.toEqual([
      { id: 'rendered-cue-0', text: 'Already visible caption' },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns only the active cue first when a full timedtext track is available', async () => {
    document.body.innerHTML = '<video></video>';
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 120,
    });
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
            <text start="0" dur="2">Intro</text>
            <text start="118" dur="2">Current line</text>
            <text start="125" dur="2">Upcoming line</text>
            <text start="140" dur="2">Far future</text>
          </transcript>
        `,
      }),
    );

    await expect(collectYoutubeSubtitleSegments()).resolves.toEqual([
      { id: 'cue-1', text: 'Current line' },
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

  it('falls back to the current watch page html when caption tracks are not visible in the content script', async () => {
    const currentPageUrl = window.location.href;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === currentPageUrl) {
        return {
          ok: true,
          text: async () => `
            <html>
              <script>
                var ytInitialPlayerResponse = {
                  "captions": {
                    "playerCaptionsTracklistRenderer": {
                      "captionTracks": [
                        {"baseUrl":"https://www.youtube.com/api/timedtext?v=demo&lang=en","languageCode":"en"}
                      ]
                    }
                  }
                };
              </script>
            </html>
          `,
        };
      }

      return {
        ok: true,
        text: async () => '<transcript><text start="0" dur="1">Hello from html fallback</text></transcript>',
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectYoutubeSubtitleSegments('auto')).resolves.toEqual([
      { id: 'cue-0', text: 'Hello from html fallback' },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, currentPageUrl);
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://www.youtube.com/api/timedtext?v=demo&lang=en');
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

  it('parses YouTube srv3 timedtext responses that use p and s nodes', async () => {
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
          <timedtext>
            <body>
              <p t="42000" d="2400">
                <s>&gt;&gt; Right? </s>
                <s>You say, "I can't find my charger."</s>
              </p>
            </body>
          </timedtext>
        `,
      }),
    );

    await expect(collectYoutubeSubtitleSegments()).resolves.toEqual([
      { id: 'cue-0', text: '>> Right? You say, "I can\'t find my charger."' },
    ]);
  });

  it('tries json3 and vtt variants when the selected caption track returns empty text', async () => {
    Object.assign(window, {
      ytInitialPlayerResponse: {
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=en' }],
          },
        },
      },
    });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      text: async () =>
        url.includes('fmt=json3')
          ? JSON.stringify({
              events: [
                {
                  tStartMs: 0,
                  dDurationMs: 1000,
                  segs: [{ utf8: 'Recovered from json3' }],
                },
              ],
            })
          : '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectYoutubeSubtitleSegments()).resolves.toEqual([
      { id: 'cue-0', text: 'Recovered from json3' },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://www.youtube.com/api/timedtext?v=demo&lang=en');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://www.youtube.com/api/timedtext?v=demo&lang=en&fmt=json3',
    );
  });

  it('tries the next caption track when all variants of the preferred track are empty', async () => {
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
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      text: async () =>
        url.includes('lang=ja')
          ? '<transcript><text start="0" dur="1">こんにちは</text></transcript>'
          : '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectYoutubeSubtitleSegments('auto')).resolves.toEqual([
      { id: 'cue-0', text: 'こんにちは' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('https://www.youtube.com/api/timedtext?v=demo&lang=ja');
  });

  it('falls back to the rendered YouTube caption text when timedtext tracks are empty', async () => {
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container">
          <span class="ytp-caption-segment">&gt;&gt; Right? You say,</span>
          <span class="ytp-caption-segment">"I can't find my charger."</span>
        </div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 42,
    });
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

    await expect(collectYoutubeSubtitleSegments()).resolves.toEqual([
      { id: 'rendered-cue-0', text: '>> Right? You say, "I can\'t find my charger."' },
    ]);
  });

  it('waits briefly for rendered YouTube captions when timedtext tracks are empty', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <div class="ytp-caption-window-container"></div>
      </div>
    `;
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 42,
    });
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

    const segmentsPromise = collectYoutubeSubtitleSegments();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);
    document.querySelector('.ytp-caption-window-container')?.insertAdjacentHTML(
      'beforeend',
      '<span class="ytp-caption-segment">Delayed caption text</span>',
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(250);

    await expect(segmentsPromise).resolves.toEqual([
      { id: 'rendered-cue-0', text: 'Delayed caption text' },
    ]);
    vi.useRealTimers();
  });

  it('turns on YouTube auto captions before waiting for rendered captions', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="movie_player">
        <video></video>
        <button class="ytp-subtitles-button" aria-label="Subtitles" aria-pressed="false" title="Subtitles/closed captions"></button>
        <div class="ytp-caption-window-container"></div>
      </div>
    `;
    const captionButton = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
    captionButton.addEventListener('click', () => {
      captionButton.setAttribute('aria-pressed', 'true');
      window.setTimeout(() => {
        document.querySelector('.ytp-caption-window-container')?.insertAdjacentHTML(
          'beforeend',
          '<span class="ytp-caption-segment">Auto generated caption</span>',
        );
      }, 100);
    });
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

    const segmentsPromise = collectYoutubeSubtitleSegments('auto', {
      enableAutoGeneratedCaptions: true,
    });
    await vi.advanceTimersByTimeAsync(700);

    await expect(segmentsPromise).resolves.toEqual([
      { id: 'rendered-cue-0', text: 'Auto generated caption' },
    ]);
    expect(captionButton.getAttribute('aria-pressed')).toBe('true');
    vi.useRealTimers();
  });

  it('does not turn on YouTube auto captions when that fallback is disabled', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="movie_player">
        <button class="ytp-subtitles-button" aria-label="Subtitles" aria-pressed="false" title="Subtitles/closed captions"></button>
      </div>
    `;
    const captionButton = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
    const clickSpy = vi.spyOn(captionButton, 'click');
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

    const segmentsPromise = collectYoutubeSubtitleSegments('auto', {
      enableAutoGeneratedCaptions: false,
    });
    const rejectionExpectation = expect(segmentsPromise).rejects.toThrow('字幕轨道存在');
    await vi.advanceTimersByTimeAsync(3500);

    await rejectionExpectation;
    expect(clickSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
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
