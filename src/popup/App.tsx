import { useState } from 'react';

import type {
  PageTranslationFailedMessage,
  PageTranslationFinishedMessage,
} from '../shared/messages';
import type { DisplayMode } from '../shared/types';

type RuntimeMessage =
  | { type: 'START_PAGE_TRANSLATION'; tabId: number }
  | {
      type: 'SET_DISPLAY_MODE';
      tabId: number;
      displayMode: DisplayMode;
    };

type TranslationResponse = PageTranslationFinishedMessage | PageTranslationFailedMessage;

type AppProps = {
  getActiveTabId: () => Promise<number>;
  sendRuntimeMessage: (message: RuntimeMessage) => Promise<void | TranslationResponse>;
  autoTranslateOnLoad: boolean;
  updateAutoTranslateOnLoad: (enabled: boolean) => Promise<void>;
  providerName?: string;
  targetLanguageLabel?: string;
  openOptionsPage?: () => Promise<void> | void;
};

const MODE_LABELS: Record<DisplayMode, string> = {
  bilingual: '双语',
  'original-only': '仅原文',
  'translated-only': '仅译文',
};

export function App({
  getActiveTabId,
  sendRuntimeMessage,
  autoTranslateOnLoad,
  updateAutoTranslateOnLoad,
  providerName = 'DeepSeek',
  targetLanguageLabel = '简体中文',
  openOptionsPage,
}: AppProps) {
  const [translating, setTranslating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('bilingual');
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(autoTranslateOnLoad);
  const [savingAutoTranslate, setSavingAutoTranslate] = useState(false);

  async function handleTranslate() {
    setTranslating(true);
    setStatusMessage('');

    try {
      const tabId = await getActiveTabId();
      const response = (await sendRuntimeMessage({
        type: 'START_PAGE_TRANSLATION',
        tabId,
      })) as TranslationResponse;

      if (response.type === 'PAGE_TRANSLATION_FAILED') {
        setStatusMessage(`翻译失败：${response.message}`);
        return;
      }

      if (response.status === 'partial-success') {
        setStatusMessage(
          `已完成 ${response.translated.length} 段翻译，${response.failedBatches.length} 个批次失败`,
        );
        return;
      }

      setStatusMessage(`已完成 ${response.translated.length} 段翻译`);
    } catch (error) {
      setStatusMessage(
        `翻译失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setTranslating(false);
    }
  }

  async function handleTranslatedOnly() {
    await handleDisplayModeChange('translated-only');
  }

  async function handleDisplayModeChange(nextMode: DisplayMode) {
    const tabId = await getActiveTabId();
    await sendRuntimeMessage({
      type: 'SET_DISPLAY_MODE',
      tabId,
      displayMode: nextMode,
    });
    setDisplayMode(nextMode);
  }

  async function handleAutoTranslateToggle(nextValue: boolean) {
    setSavingAutoTranslate(true);

    try {
      await updateAutoTranslateOnLoad(nextValue);
      setAutoTranslateEnabled(nextValue);
      setStatusMessage(
        nextValue ? '已开启：进入页面后自动翻译' : '已关闭：改为点击悬浮球手动翻译',
      );
    } catch (error) {
      setStatusMessage(
        `保存失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSavingAutoTranslate(false);
    }
  }

  return (
    <main className="popup-shell">
      <section className="popup-card">
        <header className="popup-hero">
          <div>
            <p className="popup-eyebrow">沉浸式翻译</p>
            <h1>让整页阅读更自然</h1>
          </div>
          <span className="popup-provider-badge">{providerName}</span>
        </header>

        <section className="popup-status-card">
          <div className="popup-section-header">
            <span>自动翻译</span>
            <strong>{autoTranslateEnabled ? '已开启' : '已关闭'}</strong>
          </div>
          <label className="popup-toggle-row">
            <input
              aria-label="打开页面自动翻译"
              type="checkbox"
              checked={autoTranslateEnabled}
              disabled={savingAutoTranslate}
              onChange={(event) => void handleAutoTranslateToggle(event.target.checked)}
            />
            <span>
              {autoTranslateEnabled
                ? '进入页面后自动翻译'
                : '关闭后通过悬浮球或下方按钮手动翻译'}
            </span>
          </label>
        </section>

        <button
          className="popup-primary-button"
          type="button"
          disabled={translating}
          onClick={() => void handleTranslate()}
        >
          {translating ? '正在翻译...' : '立即翻译当前页面'}
        </button>

        <section className="popup-section">
          <div className="popup-section-header">
            <span>当前模式</span>
            <strong>{MODE_LABELS[displayMode]}</strong>
          </div>
          <div className="popup-segmented-control" role="group" aria-label="显示模式">
            <button
              className={displayMode === 'bilingual' ? 'is-active' : ''}
              type="button"
              onClick={() => void handleDisplayModeChange('bilingual')}
            >
              双语
            </button>
            <button
              className={displayMode === 'original-only' ? 'is-active' : ''}
              type="button"
              onClick={() => void handleDisplayModeChange('original-only')}
            >
              原文
            </button>
            <button
              className={displayMode === 'translated-only' ? 'is-active' : ''}
              type="button"
              onClick={() => void handleTranslatedOnly()}
            >
              译文
            </button>
          </div>
          <p className="popup-mode-line">{`当前模式：${MODE_LABELS[displayMode]}`}</p>
        </section>

        <section className="popup-status-card">
          <div className="popup-section-header">
            <span>状态</span>
            <strong>{targetLanguageLabel}</strong>
          </div>
          <p className="popup-status-message">{statusMessage || '等待开始翻译'}</p>
          <p className="popup-status-meta">{`当前目标语言：${targetLanguageLabel}`}</p>
        </section>

        <footer className="popup-footer">
          <p>本地优先，尽量保持原页面结构稳定。</p>
          {openOptionsPage ? (
            <button className="popup-secondary-link" type="button" onClick={() => void openOptionsPage()}>
              打开设置
            </button>
          ) : null}
        </footer>
      </section>
    </main>
  );
}
