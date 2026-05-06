import { describe, expect, it } from 'vitest';

import { selectYoutubeAudioFormat } from '../../../src/content/youtube/audio-source';

describe('selectYoutubeAudioFormat', () => {
  it('selects a direct low bitrate audio-only adaptive format', () => {
    const result = selectYoutubeAudioFormat({
      streamingData: {
        adaptiveFormats: [
          { mimeType: 'video/mp4', bitrate: 300000, url: 'https://video.example' },
          {
            mimeType: 'audio/webm; codecs="opus"',
            bitrate: 48000,
            url: 'https://audio-low.example',
          },
          {
            mimeType: 'audio/mp4; codecs="mp4a.40.2"',
            bitrate: 128000,
            url: 'https://audio-high.example',
          },
        ],
      },
    });

    expect(result).toEqual({
      ok: true,
      format: {
        mimeType: 'audio/webm; codecs="opus"',
        bitrate: 48000,
        url: 'https://audio-low.example',
      },
    });
  });

  it('returns a downgrade reason when only signatureCipher audio formats exist', () => {
    const result = selectYoutubeAudioFormat({
      streamingData: {
        adaptiveFormats: [
          {
            mimeType: 'audio/webm; codecs="opus"',
            bitrate: 48000,
            signatureCipher: 's=encrypted&url=https%3A%2F%2Faudio.example',
          },
        ],
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'signature-cipher-not-supported',
    });
  });
});
