import { describe, expect, it, vi } from 'vitest';

import { startAsrSession } from '../../../src/background/media/asr-session';

describe('startAsrSession', () => {
  it('creates an offscreen-backed session after explicit user confirmation', async () => {
    const createOffscreenDocument = vi.fn(async () => undefined);
    const getMediaStreamId = vi.fn(async () => 'stream-id');

    await expect(
      startAsrSession({
        confirmed: true,
        tabId: 4,
        createOffscreenDocument,
        getMediaStreamId,
      }),
    ).resolves.toEqual({
      ok: true,
      streamId: 'stream-id',
    });
  });

  it('refuses to start when confirmation is missing', async () => {
    await expect(
      startAsrSession({
        confirmed: false,
        tabId: 4,
        createOffscreenDocument: vi.fn(),
        getMediaStreamId: vi.fn(),
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'ASR fallback requires explicit confirmation.',
    });
  });
});
