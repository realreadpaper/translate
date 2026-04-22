type RuntimeMessage =
  | { type: 'START_PAGE_TRANSLATION'; tabId: number }
  | {
      type: 'SET_DISPLAY_MODE';
      tabId: number;
      displayMode: 'translated-only';
    };

type AppProps = {
  getActiveTabId: () => Promise<number>;
  sendRuntimeMessage: (message: RuntimeMessage) => Promise<void>;
};

export function App({ getActiveTabId, sendRuntimeMessage }: AppProps) {
  async function handleTranslate() {
    const tabId = await getActiveTabId();
    await sendRuntimeMessage({ type: 'START_PAGE_TRANSLATION', tabId });
  }

  async function handleTranslatedOnly() {
    const tabId = await getActiveTabId();
    await sendRuntimeMessage({
      type: 'SET_DISPLAY_MODE',
      tabId,
      displayMode: 'translated-only',
    });
  }

  return (
    <main>
      <h1>沉浸式 AI 翻译</h1>
      <button type="button" onClick={handleTranslate}>
        翻译当前页面
      </button>
      <button type="button" onClick={handleTranslatedOnly}>
        仅看译文
      </button>
    </main>
  );
}
