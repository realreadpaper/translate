import { describe, expect, it, vi } from 'vitest';

import { transcribeYoutubeAudioChunks } from '../../src/background/youtube-asr';

describe('transcribeYoutubeAudioChunks', () => {
  it('rejects asr when the api key is missing', async () => {
    await expect(
      transcribeYoutubeAudioChunks({
        chunks: [],
        settings: {
          providerId: 'openai-compatible',
          apiKey: '',
          baseUrl: 'https://api.openai.com/v1',
          model: 'whisper-1',
        },
        postForm: vi.fn(),
      }),
    ).rejects.toThrow('请先配置 YouTube ASR API Key。');
  });

  it('converts provider text into a coarse asr cue for each audio chunk', async () => {
    const postForm = vi.fn().mockResolvedValue({ text: 'Hello from audio' });

    await expect(
      transcribeYoutubeAudioChunks({
        chunks: [
          {
            id: 'chunk-0',
            source: 'youtube-adaptive-format',
            startMs: 0,
            endMs: 5000,
            mimeType: 'audio/webm',
            data: new Blob(['audio'], { type: 'audio/webm' }),
          },
        ],
        settings: {
          providerId: 'openai-compatible',
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'whisper-1',
        },
        postForm,
      }),
    ).resolves.toEqual([
      { id: 'asr-cue-0-0', text: 'Hello from audio', startMs: 0, endMs: 5000 },
    ]);
  });
});
