type StartCaptureMessage = {
  type: 'START_OFFSCREEN_AUDIO_CAPTURE';
  streamId: string;
};

chrome.runtime.onMessage.addListener((message: StartCaptureMessage | { type: string }) => {
  if (message.type !== 'START_OFFSCREEN_AUDIO_CAPTURE') {
    return false;
  }

  void startCapture(message.streamId);
  return true;
});

async function startCapture(streamId: string) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as unknown as MediaTrackConstraints,
    video: false,
  });

  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  recorder.start(5000);
}
