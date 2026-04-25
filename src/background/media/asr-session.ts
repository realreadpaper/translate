export async function startAsrSession(input: {
  confirmed: boolean;
  tabId: number;
  createOffscreenDocument: (options: {
    url: string;
    reasons: chrome.offscreen.Reason[];
    justification: string;
  }) => Promise<void>;
  getMediaStreamId: (tabId: number) => Promise<string>;
}) {
  if (!input.confirmed) {
    return {
      ok: false as const,
      message: 'ASR fallback requires explicit confirmation.',
    };
  }

  await input.createOffscreenDocument({
    url: 'src/offscreen/index.html',
    reasons: ['AUDIO_PLAYBACK' as unknown as chrome.offscreen.Reason],
    justification: 'Capture YouTube audio for ASR subtitle fallback.',
  });

  const streamId = await input.getMediaStreamId(input.tabId);

  return {
    ok: true as const,
    streamId,
  };
}
