import { useState } from 'react';

import type { DisplayMode } from '../shared/types';

type RuntimeMessage = {
  type: 'SET_DISPLAY_MODE';
  tabId: number;
  displayMode: DisplayMode;
};

type AppProps = {
  getActiveTabId: () => Promise<number>;
  sendRuntimeMessage: (message: RuntimeMessage) => Promise<void>;
  autoTranslateOnLoad: boolean;
  updateAutoTranslateOnLoad: (enabled: boolean) => Promise<void>;
  activeTabKind?: 'html-page' | 'pdf-document' | 'youtube-subtitles';
  openPdfWorkspace?: () => Promise<void>;
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
  activeTabKind = 'html-page',
  openPdfWorkspace,
  providerName = 'DeepSeek',
  targetLanguageLabel = '简体中文',
  openOptionsPage,
}: AppProps) {
  const [statusMessage, setStatusMessage] = useState('');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('bilingual');
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(autoTranslateOnLoad);
  const [savingAutoTranslate, setSavingAutoTranslate] = useState(false);
  const isPdfTab = activeTabKind === 'pdf-document';

  async function handleTranslatedOnly() {
    await handleDisplayModeChange('translated-only');
  }

  async function handleDisplayModeChange(nextMode: DisplayMode) {
    try {
      const tabId = await getActiveTabId();
      await sendRuntimeMessage({
        type: 'SET_DISPLAY_MODE',
        tabId,
        displayMode: nextMode,
      });
      setDisplayMode(nextMode);
      setStatusMessage(`显示模式已切换为：${MODE_LABELS[nextMode]}`);
    } catch {
      setStatusMessage('当前页面暂时无法切换显示模式，请刷新后通过悬浮球重试');
    }
  }

  async function handleAutoTranslateToggle(nextValue: boolean) {
    setSavingAutoTranslate(true);

    try {
      await updateAutoTranslateOnLoad(nextValue);
      setAutoTranslateEnabled(nextValue);
      setStatusMessage(
        nextValue ? '自动翻译已开启：进入页面后自动执行翻译' : '自动翻译已关闭：改为手动执行',
      );
    } catch (error) {
      setStatusMessage(
        `保存失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSavingAutoTranslate(false);
    }
  }

  async function handleOpenPdfWorkspace() {
    if (!openPdfWorkspace) {
      setStatusMessage('当前 PDF 暂时无法打开护眼翻译工作台');
      return;
    }

    try {
      await openPdfWorkspace();
      setStatusMessage('已打开护眼 PDF 翻译工作台');
    } catch (error) {
      setStatusMessage(`打开失败：${error instanceof Error ? error.message : String(error)}`);
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
            <span>执行策略</span>
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
                ? '进入页面后自动执行翻译'
                : '关闭后通过页面悬浮球手动执行'}
            </span>
          </label>
        </section>

        <section className="popup-status-card">
          <div className="popup-section-header">
            <span>翻译入口</span>
            <strong>{isPdfTab ? '右键菜单' : '悬浮球'}</strong>
          </div>
          {isPdfTab ? (
            <>
              <p className="popup-status-message">PDF 默认使用浏览器阅读器，右键选择「护眼翻译此 PDF」进入工作台</p>
              <button className="popup-secondary-link" type="button" onClick={() => void handleOpenPdfWorkspace()}>
                护眼翻译此 PDF
              </button>
              <p className="popup-status-meta">工作台会使用护眼色调，并按页增量翻译。</p>
            </>
          ) : (
            <>
              <p className="popup-status-message">在页面右下角点击悬浮球「译」开始翻译</p>
              <p className="popup-status-meta">网页和 YouTube 从页面内触发，PDF 使用右键菜单。</p>
            </>
          )}
        </section>

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
          <p className="popup-status-message">{statusMessage || '等待悬浮球触发'}</p>
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
