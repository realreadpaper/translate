import { useState } from 'react';

import type { ExtensionSettings } from '../shared/types';

type AppProps = {
  initialSettings: ExtensionSettings;
  saveSettings: (settings: ExtensionSettings) => Promise<void>;
  testConnection: (settings: ExtensionSettings) => Promise<void>;
};

export function App({ initialSettings, saveSettings, testConnection }: AppProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const selectedProvider = settings.providerId;

  async function handleSave() {
    setSaving(true);
    setStatusMessage('');

    try {
      await saveSettings(settings);
      setStatusMessage('保存成功');
    } catch {
      setStatusMessage('保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setConnectionMessage('');

    try {
      await testConnection(settings);
      setConnectionMessage('连接成功');
    } catch (error) {
      setConnectionMessage(
        error instanceof Error ? error.message : '连接失败',
      );
    } finally {
      setTestingConnection(false);
    }
  }

  return (
    <main className="options-shell">
      <header className="options-header">
        <div>
          <p className="options-eyebrow">沉浸式翻译</p>
          <h1>设置工作台</h1>
        </div>
        <p className="options-header-note">密钥仅保存在本地浏览器，不会自动上传到云端。</p>
      </header>

      <div className="options-layout">
        <aside className="options-sidebar">
          <nav aria-label="设置导航">
            <a className="is-active" href="#service-config">服务配置</a>
            <a href="#translation-settings">翻译设置</a>
            <a href="#display-settings">显示模式</a>
            <a href="#connection-check">连接检查</a>
          </nav>
        </aside>

        <section className="options-content">
          <section className="options-card" id="service-config">
            <div className="options-card-header">
              <div>
                <p className="options-card-eyebrow">Service</p>
                <h2>服务配置</h2>
              </div>
              <span className="options-badge">{selectedProvider === 'deepseek' ? '推荐' : '已切换'}</span>
            </div>

            <label className="field">
              <span>当前服务</span>
              <select
                aria-label="当前服务"
                value={settings.providerId}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    providerId: event.target.value as ExtensionSettings['providerId'],
                  })
                }
              >
                <option value="deepseek">DeepSeek</option>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="traditional">Traditional</option>
              </select>
            </label>

            {selectedProvider === 'deepseek' ? (
              <div className="field-grid">
                <label className="field field-span-2">
                  <span>DeepSeek API Key</span>
                  <input
                    aria-label="DeepSeek API Key"
                    type="password"
                    value={settings.providers.deepseek.apiKey}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        providers: {
                          ...settings.providers,
                          deepseek: {
                            ...settings.providers.deepseek,
                            apiKey: event.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>DeepSeek Base URL</span>
                  <input
                    aria-label="DeepSeek Base URL"
                    value={settings.providers.deepseek.baseUrl}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        providers: {
                          ...settings.providers,
                          deepseek: {
                            ...settings.providers.deepseek,
                            baseUrl: event.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>DeepSeek Model</span>
                  <input
                    aria-label="DeepSeek Model"
                    value={settings.providers.deepseek.model}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        providers: {
                          ...settings.providers,
                          deepseek: {
                            ...settings.providers.deepseek,
                            model: event.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
              </div>
            ) : null}

            {selectedProvider === 'openai-compatible' ? (
              <div className="field-grid">
                <label className="field field-span-2">
                  <span>OpenAI API Key</span>
                  <input
                    aria-label="OpenAI API Key"
                    type="password"
                    value={settings.providers['openai-compatible'].apiKey}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        providers: {
                          ...settings.providers,
                          'openai-compatible': {
                            ...settings.providers['openai-compatible'],
                            apiKey: event.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>OpenAI Base URL</span>
                  <input
                    aria-label="OpenAI Base URL"
                    value={settings.providers['openai-compatible'].baseUrl}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        providers: {
                          ...settings.providers,
                          'openai-compatible': {
                            ...settings.providers['openai-compatible'],
                            baseUrl: event.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>OpenAI Model</span>
                  <input
                    aria-label="OpenAI Model"
                    value={settings.providers['openai-compatible'].model}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        providers: {
                          ...settings.providers,
                          'openai-compatible': {
                            ...settings.providers['openai-compatible'],
                            model: event.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
              </div>
            ) : null}

            {selectedProvider === 'traditional' ? (
              <div className="options-inline-note">
                传统翻译模式适合离线演示和稳定测试，不依赖外部 AI 服务。
              </div>
            ) : null}

            <div className="options-inline-actions" id="connection-check">
              <button
                className="options-secondary-button"
                type="button"
                disabled={testingConnection}
                onClick={() => void handleTestConnection()}
              >
                {testingConnection ? '测试中...' : '测试连接'}
              </button>
              <p>{connectionMessage || '建议先保存设置，再进行连接验证。'}</p>
            </div>
          </section>

          <section className="options-card" id="translation-settings">
            <div className="options-card-header">
              <div>
                <p className="options-card-eyebrow">Translation</p>
                <h2>翻译设置</h2>
              </div>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>源语言</span>
                <input
                  aria-label="源语言"
                  value={settings.sourceLanguage}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      sourceLanguage: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                <span>目标语言</span>
                <input
                  aria-label="目标语言"
                  value={settings.targetLanguage}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      targetLanguage: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field" id="display-settings">
                <span>默认展示模式</span>
                <select
                  aria-label="默认展示模式"
                  value={settings.displayMode}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      displayMode: event.target.value as ExtensionSettings['displayMode'],
                    })
                  }
                >
                  <option value="bilingual">双语</option>
                  <option value="original-only">仅原文</option>
                  <option value="translated-only">仅译文</option>
                </select>
              </label>
              <div className="field field-span-2 options-toggle-field">
                <span>页面加载后自动翻译</span>
                <label className="options-switch" htmlFor="auto-translate-on-load">
                  <input
                    id="auto-translate-on-load"
                    aria-label="页面加载后自动翻译"
                    type="checkbox"
                    checked={settings.autoTranslateOnLoad}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        autoTranslateOnLoad: event.target.checked,
                      })
                    }
                  />
                  <span className="options-switch-track" aria-hidden="true">
                    <span className="options-switch-thumb" />
                  </span>
                  <span className="options-switch-copy">
                    开启后进入页面立即翻译，关闭后通过悬浮球手动触发。
                  </span>
                </label>
              </div>
              <div className="field field-span-2 options-toggle-field">
                <span>启用 YouTube 字幕翻译</span>
                <label className="options-switch" htmlFor="enable-youtube-subtitles">
                  <input
                    id="enable-youtube-subtitles"
                    aria-label="启用 YouTube 字幕翻译"
                    type="checkbox"
                    checked={settings.enableYoutubeSubtitleTranslation}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        enableYoutubeSubtitleTranslation: event.target.checked,
                      })
                    }
                  />
                  <span className="options-switch-track" aria-hidden="true">
                    <span className="options-switch-thumb" />
                  </span>
                  <span className="options-switch-copy">
                    开启后允许在 YouTube 视频页中翻译现成字幕，并在缺失时提示是否启用 ASR。
                  </span>
                </label>
              </div>
              <div className="field field-span-2 options-toggle-field">
                <span>启用独立 PDF 文档翻译</span>
                <label className="options-switch" htmlFor="enable-pdf-translation">
                  <input
                    id="enable-pdf-translation"
                    aria-label="启用独立 PDF 文档翻译"
                    type="checkbox"
                    checked={settings.enablePdfDocumentTranslation}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        enablePdfDocumentTranslation: event.target.checked,
                      })
                    }
                  />
                  <span className="options-switch-track" aria-hidden="true">
                    <span className="options-switch-thumb" />
                  </span>
                  <span className="options-switch-copy">
                    开启后可将独立 PDF 文档跳转到扩展工作台中进行整份翻译。
                  </span>
                </label>
              </div>
              <label className="field">
                <span>PDF OCR 兜底策略</span>
                <select
                  aria-label="PDF OCR 兜底策略"
                  value={settings.pdfOcrFallback}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      pdfOcrFallback: event.target.value as ExtensionSettings['pdfOcrFallback'],
                    })
                  }
                >
                  <option value="confirm-first">按页确认后执行</option>
                  <option value="disabled">关闭 OCR 兜底</option>
                </select>
              </label>
              <label className="field">
                <span>YouTube ASR 兜底策略</span>
                <select
                  aria-label="YouTube ASR 兜底策略"
                  value={settings.youtubeAsrFallback}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      youtubeAsrFallback: event.target.value as ExtensionSettings['youtubeAsrFallback'],
                    })
                  }
                >
                  <option value="confirm-first">确认后识别</option>
                  <option value="disabled">关闭 ASR 兜底</option>
                </select>
              </label>
            </div>
          </section>

          <section className="options-save-bar">
            <div>
              <strong>保存状态</strong>
              <p>{statusMessage || '修改完成后记得保存设置。'}</p>
            </div>
            <button className="options-primary-button" type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? '保存中...' : '保存设置'}
            </button>
          </section>
        </section>
      </div>
    </main>
  );
}
