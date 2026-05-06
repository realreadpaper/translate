chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_OFFSCREEN_ASR_STREAM') {
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
