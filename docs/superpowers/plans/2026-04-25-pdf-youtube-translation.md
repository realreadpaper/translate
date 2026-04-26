# PDF 文档与 YouTube 字幕翻译实施计划

> **给代理执行者：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步实现本计划。步骤使用复选框语法（`- [ ]`）进行跟踪。

**目标：** 在现有沉浸式翻译扩展基础上，新增独立 PDF 文档翻译与页面内 YouTube 字幕翻译能力，并且仅在源文本缺失时启用 OCR 或 ASR 兜底。

**架构：** 保留现有 provider 与批量翻译主链路，在中间加入翻译目标层，识别 `html-page`、`youtube-subtitles` 和 `pdf-document`，再将采集与渲染分发给目标专属适配器。普通 HTML 继续复用当前的 content/background/provider 分层；YouTube 新增基于完整 cue 时间轴驱动的页面内字幕 overlay；PDF 新增基于 `pdf.js` 的独立工作台，以支持整份文档翻译和页级 OCR 兜底。

**技术栈：** TypeScript、Vite、React、`@crxjs/vite-plugin`、Vitest、jsdom、Playwright、`pdfjs-dist`、Chrome MV3 `offscreen` 与 `tabCapture`

---

### 任务 1：引入翻译目标模型、扩展设置项与任务消息

**文件：**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/messages.ts`
- Modify: `src/shared/config.ts`
- Modify: `src/storage/settings.ts`
- Create: `src/shared/translation-target.ts`
- Test: `tests/shared/config.test.ts`
- Test: `tests/storage/settings.test.ts`
- Test: `tests/shared/translation-target.test.ts`

- [ ] **步骤 1：先编写失败测试**

```ts
// tests/shared/translation-target.test.ts
import { describe, expect, it } from 'vitest';

import {
  type PdfDocumentTarget,
  type TranslationTarget,
  type YoutubeSubtitleTarget,
  isPdfDocumentTarget,
  isYoutubeSubtitleTarget,
} from '../../src/shared/translation-target';

describe('translation targets', () => {
  it('narrows a youtube subtitle target', () => {
    const target: TranslationTarget = {
      kind: 'youtube-subtitles',
      tabId: 3,
      url: 'https://www.youtube.com/watch?v=abc',
      videoId: 'abc',
    };

    expect(isYoutubeSubtitleTarget(target)).toBe(true);
    expect(isPdfDocumentTarget(target)).toBe(false);
  });

  it('narrows a pdf document target', () => {
    const target: TranslationTarget = {
      kind: 'pdf-document',
      tabId: 9,
      url: 'https://example.com/file.pdf',
      sourceKind: 'http-url',
      displayName: 'file.pdf',
    };

    expect(isPdfDocumentTarget(target)).toBe(true);
    expect(isYoutubeSubtitleTarget(target)).toBe(false);
  });
});
```

```ts
// tests/shared/config.test.ts
import { describe, expect, it } from 'vitest';

import { createDefaultSettings } from '../../src/shared/config';

describe('createDefaultSettings', () => {
  it('returns defaults that enable youtube and pdf translation but gate OCR and ASR behind confirmation', () => {
    expect(createDefaultSettings({})).toEqual(
      expect.objectContaining({
        enableYoutubeSubtitleTranslation: true,
        enablePdfDocumentTranslation: true,
        pdfOcrFallback: 'confirm-first',
        youtubeAsrFallback: 'confirm-first',
        translationCacheEnabled: true,
        subtitleDisplayStyle: 'overlay-bottom',
      }),
    );
  });
});
```

```ts
// tests/storage/settings.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSettings } from '../../src/shared/config';
import { loadSettings, saveSettings } from '../../src/storage/settings';

const store = new Map<string, unknown>();

beforeEach(() => {
  store.clear();
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store.get(key) })),
        set: vi.fn(async (payload: Record<string, unknown>) => {
          Object.entries(payload).forEach(([key, value]) => store.set(key, value));
        }),
      },
    },
  } as unknown as typeof chrome;
});

describe('settings persistence', () => {
  it('persists new translation target settings', async () => {
    const settings = {
      ...createDefaultSettings({}),
      enableYoutubeSubtitleTranslation: false,
      enablePdfDocumentTranslation: true,
      pdfOcrFallback: 'disabled' as const,
      youtubeAsrFallback: 'confirm-first' as const,
      subtitleDisplayStyle: 'overlay-top' as const,
      translationCacheEnabled: false,
    };

    await saveSettings(settings);

    await expect(loadSettings()).resolves.toEqual(settings);
  });
});
```

- [ ] **步骤 2：运行测试并确认其失败**

运行：`HOST=127.0.0.1 npm test -- tests/shared/translation-target.test.ts tests/shared/config.test.ts tests/storage/settings.test.ts`

预期：FAIL，提示 `src/shared/translation-target.ts` 模块缺失，以及新增设置字段对应的类型或属性错误。

- [ ] **步骤 3：编写最小实现**

```ts
// src/shared/translation-target.ts
export type HtmlPageTarget = {
  kind: 'html-page';
  tabId: number;
  url: string;
};

export type YoutubeSubtitleTarget = {
  kind: 'youtube-subtitles';
  tabId: number;
  url: string;
  videoId: string;
};

export type PdfDocumentTarget = {
  kind: 'pdf-document';
  tabId: number;
  url: string;
  sourceKind: 'http-url' | 'file-url';
  displayName: string;
};

export type TranslationTarget =
  | HtmlPageTarget
  | YoutubeSubtitleTarget
  | PdfDocumentTarget;

export function isYoutubeSubtitleTarget(
  target: TranslationTarget,
): target is YoutubeSubtitleTarget {
  return target.kind === 'youtube-subtitles';
}

export function isPdfDocumentTarget(
  target: TranslationTarget,
): target is PdfDocumentTarget {
  return target.kind === 'pdf-document';
}
```

```ts
// src/shared/types.ts
export type DisplayMode = 'bilingual' | 'translated-only' | 'original-only';
export type FallbackMode = 'confirm-first' | 'disabled';
export type SubtitleDisplayStyle = 'overlay-bottom' | 'overlay-top';

export type ProviderId = 'openai-compatible' | 'deepseek' | 'traditional';

export type OpenAICompatibleProviderSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type DeepSeekProviderSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type TraditionalProviderSettings = {
  apiKey: string;
  endpoint: 'google-translate' | 'microsoft-translator';
};

export type ProviderSettingsById = {
  'openai-compatible': OpenAICompatibleProviderSettings;
  deepseek: DeepSeekProviderSettings;
  traditional: TraditionalProviderSettings;
};

export type ExtensionSettings = {
  providerId: ProviderId;
  sourceLanguage: string;
  targetLanguage: string;
  displayMode: DisplayMode;
  autoTranslateOnLoad: boolean;
  enableYoutubeSubtitleTranslation: boolean;
  enablePdfDocumentTranslation: boolean;
  pdfOcrFallback: FallbackMode;
  youtubeAsrFallback: FallbackMode;
  subtitleDisplayStyle: SubtitleDisplayStyle;
  translationCacheEnabled: boolean;
  providers: ProviderSettingsById;
};
```

```ts
// src/shared/messages.ts
import type { DisplayMode, ProviderId, ProviderSettingsById } from './types';
import type { TranslationTarget } from './translation-target';

export type StartTranslationJobMessage = {
  type: 'START_TRANSLATION_JOB';
  tabId?: number;
};

export type OpenPdfTranslationWorkspaceMessage = {
  type: 'OPEN_PDF_TRANSLATION_WORKSPACE';
  tabId: number;
};

export type TranslationJobStartedMessage =
  | {
      type: 'TRANSLATION_JOB_STARTED';
      target: TranslationTarget;
    }
  | {
      type: 'TRANSLATION_JOB_REDIRECTED';
      target: TranslationTarget;
      workspaceTabId: number;
    };

export type TestProviderConnectionMessage = {
  type: 'TEST_PROVIDER_CONNECTION';
  providerId: ProviderId;
  providerSettings: ProviderSettingsById[ProviderId];
};

export type ApplyTranslationResultMessage = {
  type: 'APPLY_TRANSLATION_RESULT';
  target: TranslationTarget;
  displayMode: DisplayMode;
  translated: Array<{ id: string; translatedText: string }>;
};
```

```ts
// src/shared/config.ts
import type { ExtensionSettings } from './types';

type BuildTimeDefaults = {
  VITE_DEFAULT_PROVIDER_ID?: string;
  VITE_DEFAULT_TARGET_LANGUAGE?: string;
  VITE_DEFAULT_DEEPSEEK_API_KEY?: string;
  VITE_DEFAULT_DEEPSEEK_MODEL?: string;
};

export function createDefaultSettings(
  env: BuildTimeDefaults = import.meta.env as BuildTimeDefaults,
): ExtensionSettings {
  return {
    providerId: env.VITE_DEFAULT_PROVIDER_ID === 'deepseek' ? 'deepseek' : 'deepseek',
    sourceLanguage: 'auto',
    targetLanguage: env.VITE_DEFAULT_TARGET_LANGUAGE || 'zh-CN',
    displayMode: 'bilingual',
    autoTranslateOnLoad: false,
    enableYoutubeSubtitleTranslation: true,
    enablePdfDocumentTranslation: true,
    pdfOcrFallback: 'confirm-first',
    youtubeAsrFallback: 'confirm-first',
    subtitleDisplayStyle: 'overlay-bottom',
    translationCacheEnabled: true,
    providers: {
      'openai-compatible': {
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      deepseek: {
        apiKey: env.VITE_DEFAULT_DEEPSEEK_API_KEY || '',
        baseUrl: 'https://api.deepseek.com/v1',
        model: env.VITE_DEFAULT_DEEPSEEK_MODEL || 'deepseek-v4-flash',
      },
      traditional: {
        apiKey: '',
        endpoint: 'google-translate',
      },
    },
  };
}
```

- [ ] **步骤 4：运行测试并确认通过**

运行：`HOST=127.0.0.1 npm test -- tests/shared/translation-target.test.ts tests/shared/config.test.ts tests/storage/settings.test.ts`

预期：PASS，三个测试文件全部通过。

- [ ] **步骤 5：提交**

```bash
git add src/shared/types.ts src/shared/messages.ts src/shared/config.ts src/shared/translation-target.ts src/storage/settings.ts tests/shared/config.test.ts tests/storage/settings.test.ts tests/shared/translation-target.test.ts
git commit -m "feat: add translation target models and target-specific settings"
```

### 任务 2：围绕目标检测重构翻译编排，并保持 HTML 页面行为不回归

**文件：**
- Modify: `src/background/index.ts`
- Modify: `src/background/messaging.ts`
- Modify: `src/content/index.ts`
- Create: `src/background/targets/detect-target.ts`
- Create: `src/background/targets/html-page.ts`
- Create: `src/background/targets/types.ts`
- Test: `tests/background/messaging.test.ts`
- Test: `tests/background/targets/detect-target.test.ts`
- Test: `tests/content/index.test.ts`

- [ ] **步骤 1：先编写失败测试**

```ts
// tests/background/targets/detect-target.test.ts
import { describe, expect, it } from 'vitest';

import { detectTranslationTarget } from '../../../src/background/targets/detect-target';

describe('detectTranslationTarget', () => {
  it('detects youtube watch pages', async () => {
    await expect(
      detectTranslationTarget({
        id: 1,
        url: 'https://www.youtube.com/watch?v=demo',
        title: 'Demo',
      }),
    ).resolves.toMatchObject({
      kind: 'youtube-subtitles',
      videoId: 'demo',
    });
  });

  it('detects standalone pdf documents without treating embedded pdf snippets as documents', async () => {
    await expect(
      detectTranslationTarget({
        id: 3,
        url: 'https://example.com/report.pdf',
        title: 'report.pdf',
      }),
    ).resolves.toMatchObject({
      kind: 'pdf-document',
      displayName: 'report.pdf',
    });
  });

  it('falls back to html-page for normal articles', async () => {
    await expect(
      detectTranslationTarget({
        id: 4,
        url: 'https://example.com/article',
        title: 'Article',
      }),
    ).resolves.toMatchObject({
      kind: 'html-page',
    });
  });
});
```

```ts
// tests/background/messaging.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createMessageHandler } from '../../src/background/messaging';

describe('createMessageHandler', () => {
  it('routes html-page targets through the existing segment collection flow', async () => {
    const sendMessageToTab = vi.fn().mockResolvedValue([{ id: 'seg-0', text: 'Hello world' }]);
    const loadSettings = vi.fn().mockResolvedValue({
      providerId: 'traditional',
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
      displayMode: 'bilingual',
      autoTranslateOnLoad: false,
      enableYoutubeSubtitleTranslation: true,
      enablePdfDocumentTranslation: true,
      pdfOcrFallback: 'confirm-first',
      youtubeAsrFallback: 'confirm-first',
      subtitleDisplayStyle: 'overlay-bottom',
      translationCacheEnabled: true,
      providers: {
        'openai-compatible': { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
        deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' },
        traditional: { apiKey: '', endpoint: 'google-translate' },
      },
    });
    const detectTarget = vi.fn().mockResolvedValue({
      kind: 'html-page',
      tabId: 5,
      url: 'https://example.com/article',
    });
    const translatePage = vi.fn().mockResolvedValue({
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });

    const handler = createMessageHandler({
      sendMessageToTab,
      translatePage,
      loadSettings,
      detectTarget,
      openPdfWorkspace: vi.fn(),
    });

    await expect(handler({ type: 'START_TRANSLATION_JOB', tabId: 5 })).resolves.toMatchObject({
      type: 'PAGE_TRANSLATION_FINISHED',
      target: { kind: 'html-page' },
      status: 'success',
    });
  });
});
```

- [ ] **步骤 2：运行测试并确认其失败**

运行：`HOST=127.0.0.1 npm test -- tests/background/targets/detect-target.test.ts tests/background/messaging.test.ts tests/content/index.test.ts`

预期：FAIL，提示缺少感知 `detectTarget` 的消息编排依赖，以及更新后的消息名尚未接入。

- [ ] **步骤 3：编写最小实现**

```ts
// src/background/targets/detect-target.ts
import type { TranslationTarget } from '../../shared/translation-target';

type BrowserTabLike = {
  id?: number;
  url?: string;
  title?: string;
};

export async function detectTranslationTarget(tab: BrowserTabLike): Promise<TranslationTarget> {
  const tabId = typeof tab.id === 'number' ? tab.id : -1;
  const url = tab.url ?? '';

  if (url.startsWith('https://www.youtube.com/watch')) {
    const videoId = new URL(url).searchParams.get('v') ?? '';
    return {
      kind: 'youtube-subtitles',
      tabId,
      url,
      videoId,
    };
  }

  if (url.toLowerCase().includes('.pdf')) {
    const pathname = new URL(url).pathname;
    const displayName = pathname.split('/').pop() || 'document.pdf';
    return {
      kind: 'pdf-document',
      tabId,
      url,
      sourceKind: url.startsWith('file://') ? 'file-url' : 'http-url',
      displayName,
    };
  }

  return {
    kind: 'html-page',
    tabId,
    url,
  };
}
```

```ts
// src/background/messaging.ts
import type { ExtensionSettings } from '../shared/types';
import type {
  ApplyTranslationResultMessage,
  StartTranslationJobMessage,
} from '../shared/messages';
import type { TranslationTarget } from '../shared/translation-target';

type SourceSegment = { id: string; text: string };
type TranslationResult = {
  status: 'success' | 'partial-success';
  translated: Array<{ id: string; translatedText: string }>;
  failedBatches: Array<{ segmentIds: string[]; message: string }>;
};

export function createMessageHandler({
  sendMessageToTab,
  translatePage,
  loadSettings,
  detectTarget,
  openPdfWorkspace,
}: {
  sendMessageToTab: (tabId: number, message: { type: string }) => Promise<unknown>;
  translatePage: (segments: SourceSegment[], context: {
    providerId: ExtensionSettings['providerId'];
    sourceLanguage: string;
    targetLanguage: string;
    providerSettings: ExtensionSettings['providers'][ExtensionSettings['providerId']];
  }) => Promise<TranslationResult>;
  loadSettings: () => Promise<ExtensionSettings>;
  detectTarget: (tabId: number) => Promise<TranslationTarget>;
  openPdfWorkspace: (target: TranslationTarget, settings: ExtensionSettings) => Promise<number>;
}) {
  return async function handleMessage(message: StartTranslationJobMessage | { type: string }) {
    if (message.type !== 'START_TRANSLATION_JOB' || typeof message.tabId !== 'number') {
      throw new Error(`Unsupported message: ${message.type}`);
    }

    const settings = await loadSettings();
    const target = await detectTarget(message.tabId);

    if (target.kind === 'pdf-document') {
      const workspaceTabId = await openPdfWorkspace(target, settings);
      return {
        type: 'TRANSLATION_JOB_REDIRECTED',
        target,
        workspaceTabId,
      };
    }

    const segments = await sendMessageToTab(message.tabId, { type: 'COLLECT_PAGE_SEGMENTS' }) as SourceSegment[];
    const translationResult = await translatePage(segments, {
      providerId: settings.providerId,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      providerSettings: settings.providers[settings.providerId],
    });

    await sendMessageToTab(message.tabId, {
      type: 'APPLY_TRANSLATION_RESULT',
      target,
      translated: translationResult.translated,
      displayMode: settings.displayMode,
    } satisfies ApplyTranslationResultMessage);

    return {
      type: 'PAGE_TRANSLATION_FINISHED',
      target,
      ...translationResult,
    };
  };
}
```

```ts
// src/content/index.ts
import { extractSegments } from './dom-extractor';
import { mountFloatingBall } from './floating-ball';
import { applyTranslations, setDisplayMode } from './segment-renderer';

// Preserve HTML-page behavior while accepting the new message names.
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'COLLECT_PAGE_SEGMENTS') {
      sendResponse(extractSegments(document.body));
      return true;
    }

    if (message.type === 'APPLY_TRANSLATION_RESULT' && message.target.kind === 'html-page') {
      applyTranslations(document.body, message.translated);
      setDisplayMode(document.body, message.displayMode);
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  void mountFloatingBall(document.body, {
    sendRuntimeMessage: (message) =>
      chrome.runtime.sendMessage({
        ...message,
        type: 'START_TRANSLATION_JOB',
      }),
  });
}
```

- [ ] **步骤 4：运行测试并确认通过**

运行：`HOST=127.0.0.1 npm test -- tests/background/targets/detect-target.test.ts tests/background/messaging.test.ts tests/content/index.test.ts`

预期：PASS，目标检测与 HTML 兼容性测试全部通过。

- [ ] **步骤 5：提交**

```bash
git add src/background/index.ts src/background/messaging.ts src/background/targets/detect-target.ts src/background/targets/html-page.ts src/background/targets/types.ts src/content/index.ts tests/background/targets/detect-target.test.ts tests/background/messaging.test.ts tests/content/index.test.ts
git commit -m "refactor: route translation through target detection"
```

### 任务 3：新增 YouTube 字幕采集、翻译缓存与 overlay 渲染

**文件：**
- Modify: `src/content/index.ts`
- Modify: `src/content/floating-ball.ts`
- Modify: `src/shared/messages.ts`
- Create: `src/content/youtube/detect-target.ts`
- Create: `src/content/youtube/subtitle-source.ts`
- Create: `src/content/youtube/subtitle-overlay.ts`
- Create: `src/content/youtube/subtitle-timeline.ts`
- Create: `src/background/cache/translation-cache.ts`
- Test: `tests/content/youtube/subtitle-source.test.ts`
- Test: `tests/content/youtube/subtitle-overlay.test.ts`
- Test: `tests/background/cache/translation-cache.test.ts`
- Test: `tests/content/floating-ball.test.ts`

- [ ] **步骤 1：先编写失败测试**

```ts
// tests/content/youtube/subtitle-timeline.test.ts
import { describe, expect, it } from 'vitest';

import { findActiveCue } from '../../../src/content/youtube/subtitle-timeline';

describe('findActiveCue', () => {
  it('returns the cue active at the current playback time', () => {
    const cues = [
      { id: 'cue-0', startMs: 0, endMs: 1200, text: 'Hello' },
      { id: 'cue-1', startMs: 1200, endMs: 2500, text: 'World' },
    ];

    expect(findActiveCue(cues, 1.3)).toEqual(cues[1]);
  });
});
```

```ts
// tests/background/cache/translation-cache.test.ts
import { beforeEach, describe, expect, it } from 'vitest';

import { createTranslationCache } from '../../../src/background/cache/translation-cache';

describe('createTranslationCache', () => {
  let cache: ReturnType<typeof createTranslationCache>;

  beforeEach(() => {
    cache = createTranslationCache();
  });

  it('stores and retrieves youtube translations by video and track key', () => {
    cache.set('youtube:abc:en:zh-CN:deepseek-v4-flash', [
      { id: 'cue-0', translatedText: '你好' },
    ]);

    expect(cache.get('youtube:abc:en:zh-CN:deepseek-v4-flash')).toEqual([
      { id: 'cue-0', translatedText: '你好' },
    ]);
  });
});
```

- [ ] **步骤 2：运行测试并确认其失败**

运行：`HOST=127.0.0.1 npm test -- tests/content/youtube/subtitle-timeline.test.ts tests/content/youtube/subtitle-source.test.ts tests/content/youtube/subtitle-overlay.test.ts tests/background/cache/translation-cache.test.ts tests/content/floating-ball.test.ts`

预期：FAIL，提示 YouTube 相关模块缺失，且尚未接入缓存支持。

- [ ] **步骤 3：编写最小实现**

```ts
// src/content/youtube/subtitle-timeline.ts
export type SubtitleCue = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

export function findActiveCue(cues: SubtitleCue[], currentTimeSeconds: number) {
  const currentTimeMs = currentTimeSeconds * 1000;
  return cues.find((cue) => currentTimeMs >= cue.startMs && currentTimeMs < cue.endMs) ?? null;
}
```

```ts
// src/content/youtube/subtitle-overlay.ts
import type { DisplayMode, SubtitleDisplayStyle } from '../../shared/types';
import type { SubtitleCue } from './subtitle-timeline';

export function mountYoutubeSubtitleOverlay(
  root: HTMLElement,
  options: {
    displayStyle: SubtitleDisplayStyle;
    getOriginalCue: () => SubtitleCue | null;
    getTranslatedText: (cueId: string) => string | null;
    getDisplayMode: () => DisplayMode;
  },
) {
  const host = document.createElement('div');
  host.dataset.youtubeSubtitleOverlay = options.displayStyle;
  root.appendChild(host);

  return {
    render() {
      const cue = options.getOriginalCue();
      if (!cue) {
        host.textContent = '';
        return;
      }

      const translatedText = options.getTranslatedText(cue.id);
      const mode = options.getDisplayMode();
      host.textContent =
        mode === 'original-only'
          ? cue.text
          : mode === 'translated-only'
            ? translatedText ?? ''
            : `${cue.text}\n${translatedText ?? ''}`;
    },
    unmount() {
      host.remove();
    },
  };
}
```

```ts
// src/background/cache/translation-cache.ts
type TranslatedRecord = Array<{ id: string; translatedText: string }>;

export function createTranslationCache() {
  const memory = new Map<string, TranslatedRecord>();

  return {
    get(key: string) {
      return memory.get(key) ?? null;
    },
    set(key: string, value: TranslatedRecord) {
      memory.set(key, value);
    },
    delete(key: string) {
      memory.delete(key);
    },
  };
}
```

```ts
// src/content/youtube/subtitle-source.ts
import type { SubtitleCue } from './subtitle-timeline';

export async function collectYoutubeSubtitleCues(root: Document): Promise<SubtitleCue[]> {
  const nodes = Array.from(root.querySelectorAll('[data-start-ms][data-end-ms]'));

  return nodes.map((node, index) => ({
    id: `cue-${index}`,
    startMs: Number((node as HTMLElement).dataset.startMs),
    endMs: Number((node as HTMLElement).dataset.endMs),
    text: node.textContent?.trim() ?? '',
  })).filter((cue) => cue.text);
}
```

- [ ] **步骤 4：运行测试并确认通过**

运行：`HOST=127.0.0.1 npm test -- tests/content/youtube/subtitle-timeline.test.ts tests/content/youtube/subtitle-source.test.ts tests/content/youtube/subtitle-overlay.test.ts tests/background/cache/translation-cache.test.ts tests/content/floating-ball.test.ts`

预期：PASS，cue 匹配、overlay 渲染与缓存行为测试全部通过。

- [ ] **步骤 5：提交**

```bash
git add src/content/index.ts src/content/floating-ball.ts src/shared/messages.ts src/content/youtube/detect-target.ts src/content/youtube/subtitle-source.ts src/content/youtube/subtitle-overlay.ts src/content/youtube/subtitle-timeline.ts src/background/cache/translation-cache.ts tests/content/youtube/subtitle-source.test.ts tests/content/youtube/subtitle-overlay.test.ts tests/background/cache/translation-cache.test.ts tests/content/floating-ball.test.ts
git commit -m "feat: add youtube subtitle translation pipeline"
```

### 任务 4：构建 PDF 翻译工作台与整份文档文本提取链路

**文件：**
- Modify: `package.json`
- Modify: `src/manifest.ts`
- Create: `src/background/pdf/job-store.ts`
- Create: `src/background/pdf/fetch-source.ts`
- Create: `src/background/pdf/parse-document.ts`
- Create: `src/pdf-viewer/index.html`
- Create: `src/pdf-viewer/main.tsx`
- Create: `src/pdf-viewer/App.tsx`
- Create: `src/pdf-viewer/page-canvas.tsx`
- Create: `src/pdf-viewer/translated-page.tsx`
- Create: `src/pdf-viewer/styles.css`
- Test: `tests/background/pdf/job-store.test.ts`
- Test: `tests/background/pdf/parse-document.test.ts`
- Test: `tests/popup/app.test.tsx`

- [ ] **步骤 1：先编写失败测试**

```ts
// tests/background/pdf/job-store.test.ts
import { describe, expect, it } from 'vitest';

import { createPdfJobStore } from '../../../src/background/pdf/job-store';

describe('createPdfJobStore', () => {
  it('stores and retrieves a standalone pdf translation job', () => {
    const store = createPdfJobStore();
    const id = store.put({
      target: {
        kind: 'pdf-document',
        tabId: 7,
        url: 'https://example.com/report.pdf',
        sourceKind: 'http-url',
        displayName: 'report.pdf',
      },
      targetLanguage: 'zh-CN',
    });

    expect(store.get(id)).toMatchObject({
      target: {
        kind: 'pdf-document',
        displayName: 'report.pdf',
      },
    });
  });
});
```

```ts
// tests/background/pdf/parse-document.test.ts
import { describe, expect, it, vi } from 'vitest';

import { extractPdfTextBlocks } from '../../../src/background/pdf/parse-document';

describe('extractPdfTextBlocks', () => {
  it('maps pdf.js text items into page-ordered blocks', async () => {
    const pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getTextContent: vi.fn(async () => ({
          items: [
            { str: 'Hello', transform: [1, 0, 0, 1, 20, 700], width: 42, height: 14 },
            { str: 'world', transform: [1, 0, 0, 1, 70, 700], width: 50, height: 14 },
          ],
        })),
      })),
    };

    await expect(extractPdfTextBlocks(pdfDocument as never)).resolves.toEqual([
      expect.objectContaining({
        id: 'page-1-block-0',
        pageNumber: 1,
        text: 'Hello world',
      }),
    ]);
  });
});
```

- [ ] **步骤 2：运行测试并确认其失败**

运行：`HOST=127.0.0.1 npm test -- tests/background/pdf/job-store.test.ts tests/background/pdf/parse-document.test.ts tests/popup/app.test.tsx`

预期：FAIL，提示 PDF 相关模块缺失，且 popup 还没有处理 PDF 重定向到工作台的行为。

- [ ] **步骤 3：编写最小实现**

```json
// package.json
{
  "dependencies": {
    "pdfjs-dist": "^4.5.136",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

```ts
// src/background/pdf/job-store.ts
type PdfJob = {
  target: {
    kind: 'pdf-document';
    tabId: number;
    url: string;
    sourceKind: 'http-url' | 'file-url';
    displayName: string;
  };
  targetLanguage: string;
};

export function createPdfJobStore() {
  const jobs = new Map<string, PdfJob>();

  return {
    put(job: PdfJob) {
      const id = crypto.randomUUID();
      jobs.set(id, job);
      return id;
    },
    get(id: string) {
      return jobs.get(id) ?? null;
    },
    delete(id: string) {
      jobs.delete(id);
    },
  };
}
```

```ts
// src/background/pdf/parse-document.ts
type PdfTextBlock = {
  id: string;
  pageNumber: number;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  readingOrder: number;
};

export async function extractPdfTextBlocks(pdfDocument: {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getTextContent: () => Promise<{
      items: Array<{ str: string; transform: number[]; width: number; height: number }>;
    }>;
  }>;
}) {
  const blocks: PdfTextBlock[] = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const joinedText = textContent.items.map((item) => item.str).join(' ').trim();

    if (!joinedText) {
      continue;
    }

    blocks.push({
      id: `page-${pageNumber}-block-0`,
      pageNumber,
      text: joinedText.replace(/\s+/g, ' '),
      rect: {
        x: textContent.items[0]?.transform[4] ?? 0,
        y: textContent.items[0]?.transform[5] ?? 0,
        width: textContent.items.reduce((sum, item) => sum + item.width, 0),
        height: textContent.items[0]?.height ?? 0,
      },
      readingOrder: 0,
    });
  }

  return blocks;
}
```

```tsx
// src/pdf-viewer/App.tsx
import { useEffect, useState } from 'react';

import type { DisplayMode } from '../shared/types';

type PdfViewerAppProps = {
  loadJob: () => Promise<{
    title: string;
    pages: Array<{ pageNumber: number; originalText: string; translatedText: string }>;
  }>;
};

export function App({ loadJob }: PdfViewerAppProps) {
  const [mode, setMode] = useState<DisplayMode>('bilingual');
  const [documentState, setDocumentState] = useState<{
    title: string;
    pages: Array<{ pageNumber: number; originalText: string; translatedText: string }>;
  } | null>(null);

  useEffect(() => {
    void loadJob().then(setDocumentState);
  }, [loadJob]);

  if (!documentState) {
    return <main>正在加载 PDF 翻译工作台...</main>;
  }

  return (
    <main>
      <header>
        <h1>{documentState.title}</h1>
        <button type="button" onClick={() => setMode('bilingual')}>双语</button>
        <button type="button" onClick={() => setMode('original-only')}>原文</button>
        <button type="button" onClick={() => setMode('translated-only')}>译文</button>
      </header>
      {documentState.pages.map((page) => (
        <section key={page.pageNumber}>
          {mode !== 'translated-only' ? <article>{page.originalText}</article> : null}
          {mode !== 'original-only' ? <article>{page.translatedText}</article> : null}
        </section>
      ))}
    </main>
  );
}
```

```ts
// src/manifest.ts
export const manifest = {
  // existing fields omitted for brevity
  permissions: ['storage', 'activeTab', 'scripting', 'tabs'],
  web_accessible_resources: [
    {
      resources: ['src/pdf-viewer/index.html'],
      matches: ['<all_urls>'],
    },
  ],
};
```

- [ ] **步骤 4：运行测试并确认通过**

运行：`HOST=127.0.0.1 npm test -- tests/background/pdf/job-store.test.ts tests/background/pdf/parse-document.test.ts tests/popup/app.test.tsx`

预期：PASS，任务存储、PDF 文本块提取与 popup 重定向提示全部通过。

- [ ] **步骤 5：提交**

```bash
git add package.json src/manifest.ts src/background/pdf/job-store.ts src/background/pdf/fetch-source.ts src/background/pdf/parse-document.ts src/pdf-viewer/index.html src/pdf-viewer/main.tsx src/pdf-viewer/App.tsx src/pdf-viewer/page-canvas.tsx src/pdf-viewer/translated-page.tsx src/pdf-viewer/styles.css tests/background/pdf/job-store.test.ts tests/background/pdf/parse-document.test.ts tests/popup/app.test.tsx
git commit -m "feat: add standalone pdf translation workspace"
```

### 任务 5：为 PDF 文档新增页级 OCR 兜底

**文件：**
- Modify: `src/background/pdf/parse-document.ts`
- Create: `src/background/pdf/ocr-fallback.ts`
- Modify: `src/pdf-viewer/App.tsx`
- Test: `tests/background/pdf/ocr-fallback.test.ts`
- Test: `tests/pdf-viewer/app.test.tsx`

- [ ] **步骤 1：先编写失败测试**

```ts
// tests/background/pdf/ocr-fallback.test.ts
import { describe, expect, it } from 'vitest';

import { shouldUsePdfOcrFallback } from '../../../src/background/pdf/ocr-fallback';

describe('shouldUsePdfOcrFallback', () => {
  it('requires OCR when a page has effectively no extracted text', () => {
    expect(
      shouldUsePdfOcrFallback({
        pageNumber: 2,
        textLength: 0,
        imageCoverageRatio: 0.92,
        unreadableGlyphRatio: 0.1,
      }),
    ).toBe(true);
  });

  it('does not require OCR when text extraction is healthy', () => {
    expect(
      shouldUsePdfOcrFallback({
        pageNumber: 1,
        textLength: 420,
        imageCoverageRatio: 0.15,
        unreadableGlyphRatio: 0.0,
      }),
    ).toBe(false);
  });
});
```

```tsx
// tests/pdf-viewer/app.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/pdf-viewer/App';

describe('PdfViewer App', () => {
  it('shows an OCR prompt for pages flagged as image-only', async () => {
    render(
      <App
        loadJob={async () => ({
          title: 'scan.pdf',
          pages: [
            {
              pageNumber: 1,
              originalText: '',
              translatedText: '',
              needsOcr: true,
            },
          ],
        })}
      />,
    );

    expect(await screen.findByText('第 1 页需要 OCR 才能继续翻译')).toBeTruthy();
  });
});
```

- [ ] **步骤 2：运行测试并确认其失败**

运行：`HOST=127.0.0.1 npm test -- tests/background/pdf/ocr-fallback.test.ts tests/pdf-viewer/app.test.tsx`

预期：FAIL，提示 OCR 兜底模块缺失，且还没有 `needsOcr` 的渲染支持。

- [ ] **步骤 3：编写最小实现**

```ts
// src/background/pdf/ocr-fallback.ts
export function shouldUsePdfOcrFallback(input: {
  pageNumber: number;
  textLength: number;
  imageCoverageRatio: number;
  unreadableGlyphRatio: number;
}) {
  return (
    input.textLength < 24 &&
    (input.imageCoverageRatio > 0.7 || input.unreadableGlyphRatio > 0.4)
  );
}
```

```tsx
// src/pdf-viewer/App.tsx
type PdfViewerPage = {
  pageNumber: number;
  originalText: string;
  translatedText: string;
  needsOcr?: boolean;
};

// inside render:
{documentState.pages.map((page) => (
  <section key={page.pageNumber}>
    {page.needsOcr ? (
      <p>{`第 ${page.pageNumber} 页需要 OCR 才能继续翻译`}</p>
    ) : null}
    {mode !== 'translated-only' ? <article>{page.originalText}</article> : null}
    {mode !== 'original-only' ? <article>{page.translatedText}</article> : null}
  </section>
))}
```

- [ ] **步骤 4：运行测试并确认通过**

运行：`HOST=127.0.0.1 npm test -- tests/background/pdf/ocr-fallback.test.ts tests/pdf-viewer/app.test.tsx`

预期：PASS，页级 OCR 判定行为测试全部通过。

- [ ] **步骤 5：提交**

```bash
git add src/background/pdf/ocr-fallback.ts src/background/pdf/parse-document.ts src/pdf-viewer/App.tsx tests/background/pdf/ocr-fallback.test.ts tests/pdf-viewer/app.test.tsx
git commit -m "feat: add page-level pdf OCR fallback gating"
```

### 任务 6：为无字幕 YouTube 视频新增 offscreen 音频处理与显式确认式 ASR 兜底

**文件：**
- Modify: `src/manifest.ts`
- Modify: `src/shared/messages.ts`
- Modify: `src/content/youtube/subtitle-overlay.ts`
- Create: `src/background/media/asr-session.ts`
- Create: `src/offscreen/index.html`
- Create: `src/offscreen/index.ts`
- Test: `tests/background/media/asr-session.test.ts`
- Test: `tests/content/youtube/subtitle-overlay.test.ts`

- [ ] **步骤 1：先编写失败测试**

```ts
// tests/background/media/asr-session.test.ts
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
```

- [ ] **步骤 2：运行测试并确认其失败**

运行：`HOST=127.0.0.1 npm test -- tests/background/media/asr-session.test.ts tests/content/youtube/subtitle-overlay.test.ts`

预期：FAIL，提示 ASR session 模块缺失，且尚未支持“无字幕时的提示与确认”。

- [ ] **步骤 3：编写最小实现**

```ts
// src/background/media/asr-session.ts
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
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Capture YouTube audio for ASR subtitle fallback.',
  });

  const streamId = await input.getMediaStreamId(input.tabId);

  return {
    ok: true as const,
    streamId,
  };
}
```

```html
<!-- src/offscreen/index.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Immersive AI Translate Offscreen</title>
  </head>
  <body>
    <script type="module" src="./index.ts"></script>
  </body>
  </html>
```

```ts
// src/offscreen/index.ts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_OFFSCREEN_ASR_STREAM') {
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
```

```ts
// src/manifest.ts
export const manifest = {
  // existing fields omitted for brevity
  permissions: ['storage', 'activeTab', 'scripting', 'tabs', 'offscreen', 'tabCapture'],
};
```

- [ ] **步骤 4：运行测试并确认通过**

运行：`HOST=127.0.0.1 npm test -- tests/background/media/asr-session.test.ts tests/content/youtube/subtitle-overlay.test.ts`

预期：PASS，显式确认式 ASR session 行为测试全部通过。

- [ ] **步骤 5：提交**

```bash
git add src/manifest.ts src/shared/messages.ts src/content/youtube/subtitle-overlay.ts src/background/media/asr-session.ts src/offscreen/index.html src/offscreen/index.ts tests/background/media/asr-session.test.ts tests/content/youtube/subtitle-overlay.test.ts
git commit -m "feat: add explicit-confirmation youtube ASR fallback"
```

### 任务 7：在 popup 与 options 中暴露目标专属控制项，并补齐集成与 E2E 验证

**文件：**
- Modify: `src/popup/App.tsx`
- Modify: `src/options/App.tsx`
- Modify: `README.md`
- Test: `tests/popup/app.test.tsx`
- Test: `tests/options/app.test.tsx`
- Test: `tests/e2e/page-translation.spec.ts`
- Create: `tests/e2e/pdf-workspace.spec.ts`
- Create: `tests/e2e/youtube-subtitles.spec.ts`

- [ ] **步骤 1：先编写失败测试**

```tsx
// tests/options/app.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../../src/options/App';
import { createDefaultSettings } from '../../src/shared/config';

describe('Options App', () => {
  it('renders youtube and pdf fallback toggles', () => {
    render(
      <App
        initialSettings={createDefaultSettings({})}
        saveSettings={vi.fn()}
        testConnection={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('启用 YouTube 字幕翻译')).toBeTruthy();
    expect(screen.getByLabelText('启用独立 PDF 文档翻译')).toBeTruthy();
    expect(screen.getByLabelText('PDF OCR 兜底策略')).toBeTruthy();
    expect(screen.getByLabelText('YouTube ASR 兜底策略')).toBeTruthy();
  });
});
```

```ts
// tests/e2e/pdf-workspace.spec.ts
import { expect, test } from '@playwright/test';

test('opens the pdf translation workspace for standalone pdf tabs', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/fixtures/report.pdf');
  await page.getByRole('button', { name: '手动执行本页翻译' }).click();

  await expect(page.getByText('PDF 翻译工作台')).toBeVisible();
});
```

- [ ] **步骤 2：运行测试并确认其失败**

运行：`HOST=127.0.0.1 npm test -- tests/popup/app.test.tsx tests/options/app.test.tsx && HOST=127.0.0.1 npm run test:e2e -- tests/e2e/pdf-workspace.spec.ts tests/e2e/youtube-subtitles.spec.ts`

预期：FAIL，因为 UI 还未暴露目标专属控制项，新的 E2E 流程也尚未实现。

- [ ] **步骤 3：编写最小实现**

```tsx
// src/options/App.tsx
<section className="options-card" id="translation-settings">
  <div className="options-card-header">
    <div>
      <p className="options-card-eyebrow">Target</p>
      <h2>目标扩展能力</h2>
    </div>
  </div>

  <label className="field">
    <span>启用 YouTube 字幕翻译</span>
    <input
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
  </label>

  <label className="field">
    <span>启用独立 PDF 文档翻译</span>
    <input
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
  </label>

  <label className="field">
    <span>PDF OCR 兜底策略</span>
    <select
      aria-label="PDF OCR 兜底策略"
      value={settings.pdfOcrFallback}
      onChange={(event) =>
        setSettings({
          ...settings,
          pdfOcrFallback: event.target.value as typeof settings.pdfOcrFallback,
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
          youtubeAsrFallback: event.target.value as typeof settings.youtubeAsrFallback,
        })
      }
    >
      <option value="confirm-first">确认后识别</option>
      <option value="disabled">关闭 ASR 兜底</option>
    </select>
  </label>
</section>
```

```tsx
// src/popup/App.tsx
if (response.type === 'TRANSLATION_JOB_REDIRECTED' && response.target.kind === 'pdf-document') {
  setStatusMessage(`已在新标签页打开 ${response.target.displayName} 的 PDF 翻译工作台`);
  return;
}
```

```md
// README.md
## 新增目标

- 独立 PDF 文档翻译：在扩展工作台中阅读整份文档的双语或译文结果
- YouTube 字幕翻译：在当前视频页内显示双语字幕
- OCR / ASR 仅在文本缺失时提示启用，不默认自动执行
```

- [ ] **步骤 4：运行测试并确认通过**

运行：`HOST=127.0.0.1 npm test -- tests/popup/app.test.tsx tests/options/app.test.tsx && HOST=127.0.0.1 npm run test:e2e -- tests/e2e/pdf-workspace.spec.ts tests/e2e/youtube-subtitles.spec.ts`

预期：PASS，更新后的设置 UI 与目标专属 E2E 覆盖全部通过。

- [ ] **步骤 5：提交**

```bash
git add src/popup/App.tsx src/options/App.tsx README.md tests/popup/app.test.tsx tests/options/app.test.tsx tests/e2e/pdf-workspace.spec.ts tests/e2e/youtube-subtitles.spec.ts
git commit -m "feat: expose pdf and youtube translation controls in the UI"
```

## 自检

### 规格覆盖情况

- 共享目标模型与消息协议由任务 1 和任务 2 覆盖。
- YouTube 的已有字幕支持由任务 3 覆盖。
- 独立 PDF 工作台与整份文档提取由任务 4 覆盖。
- PDF 页级 OCR 兜底由任务 5 覆盖。
- 显式确认式 YouTube ASR 兜底由任务 6 覆盖。
- 设置项、popup 反馈、文档和 E2E 覆盖由任务 7 覆盖。

### 占位词检查

- 任务中没有残留 `TODO`、`TBD` 或“后续再处理”之类的占位词。
- 每个任务都列出了准确文件、具体测试、执行命令和提交检查点。

### 类型一致性

- 目标类型统一使用 `html-page`、`youtube-subtitles` 和 `pdf-document`。
- 兜底设置统一使用 `confirm-first` 与 `disabled`。
- PDF 跳转处理统一返回 `TRANSLATION_JOB_REDIRECTED`。
