# Immersive AI Translate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Chrome / Edge immersive translation extension that supports full-page translation, bilingual display, provider switching, local settings, and a tested MVP translation loop.

**Architecture:** Use a Manifest V3 browser extension with React-based popup and options pages, a background service worker for orchestration, content scripts for DOM extraction and rendering, and provider adapters behind a shared registry and transport abstraction. Keep DOM logic, storage logic, and provider logic separated so the translation loop remains testable and future relay support can be added without rewriting page behavior.

**Tech Stack:** TypeScript, Vite, React, `@crxjs/vite-plugin`, Vitest, jsdom, Playwright

---

### Task 1: Initialize the extension workspace and define shared settings defaults

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/shared/types.ts`
- Create: `src/shared/config.ts`
- Create: `tests/shared/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/shared/config.test.ts
import { describe, expect, it } from 'vitest';

import { createDefaultSettings } from '../../src/shared/config';

describe('createDefaultSettings', () => {
  it('returns a local-first bilingual settings object', () => {
    expect(createDefaultSettings()).toEqual({
      providerId: 'openai-compatible',
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
      displayMode: 'bilingual',
      providers: {
        'openai-compatible': {
          apiKey: '',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
        deepseek: {
          apiKey: '',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
        },
        traditional: {
          apiKey: '',
          endpoint: 'google-translate',
        },
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/config.test.ts`
Expected: FAIL with `Cannot find module '../../src/shared/config'` or `createDefaultSettings is not defined`

- [ ] **Step 3: Write minimal implementation**

```json
// package.json
{
  "name": "immersive-ai-translate",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.25",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/chrome": "^0.0.325",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.0",
    "vite": "^7.0.0",
    "vitest": "^3.2.0"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node"
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts", "src/manifest.ts"]
}
```

```gitignore
# .gitignore
node_modules
dist
playwright-report
test-results
.DS_Store
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({});
```

```ts
// src/shared/types.ts
export type DisplayMode = 'bilingual' | 'translated-only' | 'original-only';

export type ProviderId = 'openai-compatible' | 'deepseek' | 'traditional';

export type ProviderSettings = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  endpoint?: 'google-translate' | 'microsoft-translator';
};

export type ExtensionSettings = {
  providerId: ProviderId;
  sourceLanguage: string;
  targetLanguage: string;
  displayMode: DisplayMode;
  providers: Record<ProviderId, ProviderSettings>;
};
```

```ts
// src/shared/config.ts
import type { ExtensionSettings } from './types';

export function createDefaultSettings(): ExtensionSettings {
  return {
    providerId: 'openai-compatible',
    sourceLanguage: 'auto',
    targetLanguage: 'zh-CN',
    displayMode: 'bilingual',
    providers: {
      'openai-compatible': {
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      deepseek: {
        apiKey: '',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
      },
      traditional: {
        apiKey: '',
        endpoint: 'google-translate',
      },
    },
  };
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/shared/config.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts .gitignore src/shared/types.ts src/shared/config.ts tests/shared/config.test.ts
git commit -m "feat: scaffold extension workspace and shared settings defaults"
```

### Task 2: Persist settings through local browser storage

**Files:**
- Create: `src/storage/settings.ts`
- Create: `tests/storage/settings.test.ts`

- [ ] **Step 1: Write the failing test**

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

describe('settings storage', () => {
  it('loads defaults when nothing has been saved', async () => {
    await expect(loadSettings()).resolves.toEqual(createDefaultSettings());
  });

  it('persists and reloads settings', async () => {
    const settings = {
      ...createDefaultSettings(),
      targetLanguage: 'ja',
    };

    await saveSettings(settings);

    await expect(loadSettings()).resolves.toEqual(settings);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage/settings.test.ts`
Expected: FAIL with `Cannot find module '../../src/storage/settings'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/storage/settings.ts
import { createDefaultSettings } from '../shared/config';
import type { ExtensionSettings } from '../shared/types';

const STORAGE_KEY = 'immersive-ai-translate.settings';

export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as ExtensionSettings | undefined) ?? createDefaultSettings();
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: settings,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage/settings.test.ts`
Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/storage/settings.ts tests/storage/settings.test.ts src/shared/config.ts src/shared/types.ts
git commit -m "feat: add local settings persistence"
```

### Task 3: Build the provider registry and configuration validation

**Files:**
- Create: `src/background/providers/types.ts`
- Create: `src/background/providers/openai-compatible.ts`
- Create: `src/background/providers/deepseek.ts`
- Create: `src/background/providers/traditional.ts`
- Create: `src/background/providers/registry.ts`
- Create: `tests/background/providers/registry.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/background/providers/registry.test.ts
import { describe, expect, it } from 'vitest';

import { getProvider, validateProviderSettings } from '../../../src/background/providers/registry';
import { createDefaultSettings } from '../../../src/shared/config';

describe('provider registry', () => {
  it('returns a provider adapter for openai-compatible and deepseek', () => {
    expect(getProvider('openai-compatible').id).toBe('openai-compatible');
    expect(getProvider('deepseek').id).toBe('deepseek');
  });

  it('rejects missing api keys for ai providers', () => {
    const settings = createDefaultSettings();
    const result = validateProviderSettings('openai-compatible', settings.providers['openai-compatible']);
    expect(result).toEqual({
      ok: false,
      message: 'API Key is required for openai-compatible',
    });
  });

  it('allows traditional provider without a model', () => {
    const result = validateProviderSettings('traditional', {
      endpoint: 'google-translate',
      apiKey: '',
    });

    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/background/providers/registry.test.ts`
Expected: FAIL with `Cannot find module '../../../src/background/providers/registry'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/background/providers/types.ts
import type { ProviderId, ProviderSettings } from '../../shared/types';

export type ValidationResult = { ok: true } | { ok: false; message: string };

export type ProviderAdapter = {
  id: ProviderId;
  validateConfig(settings: ProviderSettings): ValidationResult;
};
```

```ts
// src/background/providers/openai-compatible.ts
import type { ProviderAdapter } from './types';

export const openAiCompatibleProvider: ProviderAdapter = {
  id: 'openai-compatible',
  validateConfig(settings) {
    if (!settings.apiKey) {
      return { ok: false, message: 'API Key is required for openai-compatible' };
    }
    if (!settings.baseUrl) {
      return { ok: false, message: 'Base URL is required for openai-compatible' };
    }
    if (!settings.model) {
      return { ok: false, message: 'Model is required for openai-compatible' };
    }
    return { ok: true };
  },
};
```

```ts
// src/background/providers/deepseek.ts
import type { ProviderAdapter } from './types';

export const deepseekProvider: ProviderAdapter = {
  id: 'deepseek',
  validateConfig(settings) {
    if (!settings.apiKey) {
      return { ok: false, message: 'API Key is required for deepseek' };
    }
    if (!settings.baseUrl) {
      return { ok: false, message: 'Base URL is required for deepseek' };
    }
    if (!settings.model) {
      return { ok: false, message: 'Model is required for deepseek' };
    }
    return { ok: true };
  },
};
```

```ts
// src/background/providers/traditional.ts
import type { ProviderAdapter } from './types';

export const traditionalProvider: ProviderAdapter = {
  id: 'traditional',
  validateConfig(settings) {
    if (!settings.endpoint) {
      return { ok: false, message: 'Endpoint is required for traditional' };
    }
    return { ok: true };
  },
};
```

```ts
// src/background/providers/registry.ts
import type { ProviderId, ProviderSettings } from '../../shared/types';
import { deepseekProvider } from './deepseek';
import { openAiCompatibleProvider } from './openai-compatible';
import { traditionalProvider } from './traditional';

const providers = {
  'openai-compatible': openAiCompatibleProvider,
  deepseek: deepseekProvider,
  traditional: traditionalProvider,
};

export function getProvider(id: ProviderId) {
  return providers[id];
}

export function validateProviderSettings(id: ProviderId, settings: ProviderSettings) {
  return providers[id].validateConfig(settings);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/background/providers/registry.test.ts`
Expected: PASS with `3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/background/providers/types.ts src/background/providers/openai-compatible.ts src/background/providers/deepseek.ts src/background/providers/traditional.ts src/background/providers/registry.ts tests/background/providers/registry.test.ts src/shared/types.ts
git commit -m "feat: add provider registry and config validation"
```

### Task 4: Add provider transport and normalized translation responses

**Files:**
- Create: `src/background/providers/transport.ts`
- Modify: `src/background/providers/types.ts`
- Modify: `src/background/providers/openai-compatible.ts`
- Modify: `src/background/providers/deepseek.ts`
- Modify: `src/background/providers/traditional.ts`
- Create: `tests/background/providers/translate.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/background/providers/translate.test.ts
import { describe, expect, it, vi } from 'vitest';

import { openAiCompatibleProvider } from '../../../src/background/providers/openai-compatible';

describe('openAiCompatibleProvider.translateSegments', () => {
  it('returns normalized translated segments', async () => {
    const transport = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { id: 'seg-1', translatedText: '你好，世界' },
            ]),
          },
        },
      ],
    });

    const result = await openAiCompatibleProvider.translateSegments(
      {
        segments: [{ id: 'seg-1', text: 'Hello, world' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
      },
      {
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      transport,
    );

    expect(result).toEqual({
      ok: true,
      segments: [{ id: 'seg-1', translatedText: '你好，世界' }],
    });
  });

  it('normalizes transport failures into readable errors', async () => {
    const transport = vi.fn().mockRejectedValue({
      status: 429,
      message: 'Too Many Requests',
    });

    const result = await openAiCompatibleProvider.translateSegments(
      {
        segments: [{ id: 'seg-1', text: 'Hello, world' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
      },
      {
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      },
      transport,
    );

    expect(result).toEqual({
      ok: false,
      message: 'Request was rate limited by openai-compatible',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/background/providers/translate.test.ts`
Expected: FAIL with `translateSegments is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/background/providers/types.ts
export type TranslationRequest = {
  segments: Array<{ id: string; text: string }>;
  sourceLanguage: string;
  targetLanguage: string;
};

export type TranslationResult =
  | { ok: true; segments: Array<{ id: string; translatedText: string }> }
  | { ok: false; message: string };

export type ProviderTransport = (request: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}) => Promise<unknown>;

export type ProviderAdapter = {
  id: 'openai-compatible' | 'deepseek' | 'traditional';
  validateConfig(settings: { apiKey?: string; baseUrl?: string; model?: string; endpoint?: string }): ValidationResult;
  translateSegments(
    request: TranslationRequest,
    settings: { apiKey?: string; baseUrl?: string; model?: string; endpoint?: string },
    transport: ProviderTransport,
  ): Promise<TranslationResult>;
  normalizeError(error: unknown): string;
};
```

```ts
// src/background/providers/transport.ts
export async function postJson(request: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}) {
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  });

  if (!response.ok) {
    throw {
      status: response.status,
      message: await response.text(),
    };
  }

  return response.json();
}
```

```ts
// src/background/providers/openai-compatible.ts
import type { ProviderAdapter, ProviderTransport, TranslationRequest, TranslationResult } from './types';

export const openAiCompatibleProvider: ProviderAdapter = {
  id: 'openai-compatible',
  validateConfig(settings) {
    if (!settings.apiKey) {
      return { ok: false, message: 'API Key is required for openai-compatible' };
    }
    if (!settings.baseUrl) {
      return { ok: false, message: 'Base URL is required for openai-compatible' };
    }
    if (!settings.model) {
      return { ok: false, message: 'Model is required for openai-compatible' };
    }
    return { ok: true };
  },
  normalizeError(error) {
    if (typeof error === 'object' && error && 'status' in error && error.status === 429) {
      return 'Request was rate limited by openai-compatible';
    }
    return 'Request failed for openai-compatible';
  },
  async translateSegments(request: TranslationRequest, settings, transport: ProviderTransport): Promise<TranslationResult> {
    try {
      const response = (await transport({
        url: `${settings.baseUrl}/chat/completions`,
        headers: {
          Authorization: `Bearer ${settings.apiKey ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: {
          model: settings.model,
          messages: [
            {
              role: 'user',
              content: JSON.stringify(request.segments),
            },
          ],
        },
      })) as {
        choices: Array<{ message: { content: string } }>;
      };

      return {
        ok: true,
        segments: JSON.parse(response.choices[0].message.content),
      };
    } catch (error) {
      return {
        ok: false,
        message: openAiCompatibleProvider.normalizeError(error),
      };
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/background/providers/translate.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/background/providers/transport.ts src/background/providers/types.ts src/background/providers/openai-compatible.ts src/background/providers/deepseek.ts src/background/providers/traditional.ts tests/background/providers/translate.test.ts src/shared/types.ts
git commit -m "feat: add provider transport and normalized translation responses"
```

### Task 5: Extract stable translatable segments from DOM content

**Files:**
- Create: `src/content/dom-extractor.ts`
- Create: `tests/content/dom-extractor.test.ts`
- Modify: `vitest.config.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/content/dom-extractor.test.ts
import { describe, expect, it } from 'vitest';

import { extractSegments } from '../../src/content/dom-extractor';

describe('extractSegments', () => {
  it('returns readable text nodes and skips blocked elements', () => {
    document.body.innerHTML = `
      <article>
        <h1>Hello world</h1>
        <p>Paragraph one.</p>
        <script>console.log('skip')</script>
        <code>const x = 1</code>
        <p>Paragraph two.</p>
      </article>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Hello world' },
      { id: 'seg-1', text: 'Paragraph one.' },
      { id: 'seg-2', text: 'Paragraph two.' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/content/dom-extractor.test.ts`
Expected: FAIL with `document is not defined` or `Cannot find module '../../src/content/dom-extractor'`

- [ ] **Step 3: Write minimal implementation**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environmentMatchGlobs: [['tests/content/**/*.test.ts', 'jsdom']],
    include: ['tests/**/*.test.ts'],
  },
});
```

```ts
// src/content/dom-extractor.ts
const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT']);

export function extractSegments(root: HTMLElement): Array<{ id: string; text: string }> {
  const elements = Array.from(root.querySelectorAll('h1, h2, h3, p, li, blockquote'));
  return elements
    .filter((element) => !BLOCKED_TAGS.has(element.tagName))
    .map((element) => element.textContent?.trim() ?? '')
    .filter(Boolean)
    .map((text, index) => ({
      id: `seg-${index}`,
      text,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/content/dom-extractor.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/content/dom-extractor.ts tests/content/dom-extractor.test.ts vitest.config.ts src/shared/types.ts
git commit -m "feat: extract translatable segments from page content"
```

### Task 6: Orchestrate batch translation with partial-failure handling

**Files:**
- Create: `src/background/translator/batch.ts`
- Create: `src/background/translator/translate-page.ts`
- Create: `tests/background/translator/translate-page.test.ts`
- Modify: `src/background/providers/registry.ts`
- Modify: `src/background/providers/types.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/background/translator/translate-page.test.ts
import { describe, expect, it } from 'vitest';

import { translatePageSegments } from '../../../src/background/translator/translate-page';

describe('translatePageSegments', () => {
  it('keeps successful batches when one batch fails', async () => {
    const result = await translatePageSegments(
      [
        { id: 'seg-0', text: 'first' },
        { id: 'seg-1', text: 'second' },
        { id: 'seg-2', text: 'third' },
      ],
      {
        providerId: 'openai-compatible',
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        providerSettings: {
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
      },
      async ({ segments }) => {
        if (segments[0].id === 'seg-2') {
          return { ok: false, message: 'rate limited' };
        }

        return {
          ok: true,
          segments: segments.map((segment) => ({
            id: segment.id,
            translatedText: `${segment.text}-zh`,
          })),
        };
      },
      2,
    );

    expect(result).toEqual({
      status: 'partial-success',
      translated: [
        { id: 'seg-0', translatedText: 'first-zh' },
        { id: 'seg-1', translatedText: 'second-zh' },
      ],
      failedBatches: [{ segmentIds: ['seg-2'], message: 'rate limited' }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/background/translator/translate-page.test.ts`
Expected: FAIL with `Cannot find module '../../../src/background/translator/translate-page'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/background/translator/batch.ts
export function chunkSegments<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
```

```ts
// src/background/translator/translate-page.ts
import { chunkSegments } from './batch';

export async function translatePageSegments(
  segments,
  context,
  translateBatch,
  batchSize,
) {
  const batches = chunkSegments(segments, batchSize);
  const translated = [];
  const failedBatches = [];

  for (const batch of batches) {
    const result = await translateBatch({
      segments: batch,
      sourceLanguage: context.sourceLanguage,
      targetLanguage: context.targetLanguage,
    });

    if (result.ok) {
      translated.push(...result.segments);
    } else {
      failedBatches.push({
        segmentIds: batch.map((segment) => segment.id),
        message: result.message,
      });
    }
  }

  return {
    status: failedBatches.length > 0 ? 'partial-success' : 'success',
    translated,
    failedBatches,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/background/translator/translate-page.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/background/translator/batch.ts src/background/translator/translate-page.ts tests/background/translator/translate-page.test.ts src/background/providers/registry.ts src/background/providers/types.ts src/shared/types.ts
git commit -m "feat: orchestrate batch translation with partial failures"
```

### Task 7: Render bilingual output and restore original page state

**Files:**
- Create: `src/content/segment-renderer.ts`
- Create: `src/content/page-session.ts`
- Create: `tests/content/segment-renderer.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/content/segment-renderer.test.ts
import { describe, expect, it } from 'vitest';

import { applyTranslations, restoreOriginalContent, setDisplayMode } from '../../src/content/segment-renderer';

describe('segment renderer', () => {
  it('renders bilingual blocks and toggles display modes without losing the original text', () => {
    document.body.innerHTML = `<article><p data-segment-id="seg-0">Hello world</p></article>`;

    applyTranslations(document.body, [{ id: 'seg-0', translatedText: '你好，世界' }]);

    expect(document.body.textContent).toContain('Hello world');
    expect(document.body.textContent).toContain('你好，世界');

    setDisplayMode(document.body, 'translated-only');
    expect(document.querySelector('[data-original-hidden="true"]')).not.toBeNull();

    restoreOriginalContent(document.body);
    expect(document.body.textContent).toContain('Hello world');
    expect(document.body.textContent).not.toContain('你好，世界');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/content/segment-renderer.test.ts`
Expected: FAIL with `Cannot find module '../../src/content/segment-renderer'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/content/segment-renderer.ts
export function applyTranslations(root: HTMLElement, translatedSegments: Array<{ id: string; translatedText: string }>) {
  translatedSegments.forEach((segment) => {
    const original = root.querySelector(`[data-segment-id="${segment.id}"]`);
    if (!original) return;

    const translated = document.createElement('div');
    translated.dataset.translationFor = segment.id;
    translated.textContent = segment.translatedText;
    original.insertAdjacentElement('afterend', translated);
  });
}

export function setDisplayMode(root: HTMLElement, mode: 'bilingual' | 'translated-only' | 'original-only') {
  const originals = root.querySelectorAll('[data-segment-id]');
  originals.forEach((node) => {
    if (mode === 'translated-only') {
      (node as HTMLElement).dataset.originalHidden = 'true';
      (node as HTMLElement).style.display = 'none';
    } else {
      delete (node as HTMLElement).dataset.originalHidden;
      (node as HTMLElement).style.display = '';
    }
  });
}

export function restoreOriginalContent(root: HTMLElement) {
  root.querySelectorAll('[data-translation-for]').forEach((node) => node.remove());
  setDisplayMode(root, 'bilingual');
}
```

```ts
// src/content/page-session.ts
export type PageSessionStatus = 'idle' | 'translating' | 'translated' | 'partial-success';

let currentStatus: PageSessionStatus = 'idle';

export function setPageSessionStatus(status: PageSessionStatus) {
  currentStatus = status;
}

export function getPageSessionStatus() {
  return currentStatus;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/content/segment-renderer.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/content/segment-renderer.ts src/content/page-session.ts tests/content/segment-renderer.test.ts src/shared/types.ts
git commit -m "feat: render bilingual content and restore originals"
```

### Task 8: Type extension messages and connect background to the content script

**Files:**
- Create: `src/shared/messages.ts`
- Create: `src/background/messaging.ts`
- Create: `tests/background/messaging.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/background/messaging.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createMessageHandler } from '../../src/background/messaging';

describe('createMessageHandler', () => {
  it('starts page translation by reading settings, requesting segments, and replying with success', async () => {
    const sendMessageToTab = vi.fn().mockResolvedValue([
      { id: 'seg-0', text: 'Hello world' },
    ]);
    const translatePage = vi.fn().mockResolvedValue({
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });
    const loadSettings = vi.fn().mockResolvedValue({
      providerId: 'openai-compatible',
      sourceLanguage: 'auto',
      targetLanguage: 'zh-CN',
      displayMode: 'bilingual',
      providers: {
        'openai-compatible': {
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
      },
    });

    const handler = createMessageHandler({ sendMessageToTab, translatePage, loadSettings });

    await expect(
      handler({ type: 'START_PAGE_TRANSLATION', tabId: 1 }),
    ).resolves.toEqual({
      type: 'PAGE_TRANSLATION_FINISHED',
      status: 'success',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      failedBatches: [],
    });

    expect(sendMessageToTab).toHaveBeenLastCalledWith(1, {
      type: 'APPLY_PAGE_TRANSLATION',
      translated: [{ id: 'seg-0', translatedText: '你好，世界' }],
      displayMode: 'bilingual',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/background/messaging.test.ts`
Expected: FAIL with `Cannot find module '../../src/background/messaging'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/messages.ts
export type StartPageTranslationMessage = {
  type: 'START_PAGE_TRANSLATION';
  tabId: number;
};

export type SetDisplayModeMessage = {
  type: 'SET_DISPLAY_MODE';
  tabId: number;
  displayMode: 'bilingual' | 'translated-only' | 'original-only';
};

export type ApplyPageTranslationMessage = {
  type: 'APPLY_PAGE_TRANSLATION';
  translated: Array<{ id: string; translatedText: string }>;
  displayMode: 'bilingual' | 'translated-only' | 'original-only';
};

export type PageTranslationFinishedMessage = {
  type: 'PAGE_TRANSLATION_FINISHED';
  status: 'success' | 'partial-success';
  translated: Array<{ id: string; translatedText: string }>;
  failedBatches: Array<{ segmentIds: string[]; message: string }>;
};
```

```ts
// src/background/messaging.ts
export function createMessageHandler({ sendMessageToTab, translatePage, loadSettings }) {
  return async function handleMessage(message) {
    if (message.type !== 'START_PAGE_TRANSLATION') {
      throw new Error(`Unsupported message: ${message.type}`);
    }

    const settings = await loadSettings();
    const segments = await sendMessageToTab(message.tabId, { type: 'COLLECT_PAGE_SEGMENTS' });
    const result = await translatePage(segments, {
      providerId: settings.providerId,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      providerSettings: settings.providers[settings.providerId],
    });

    await sendMessageToTab(message.tabId, {
      type: 'APPLY_PAGE_TRANSLATION',
      translated: result.translated,
      displayMode: settings.displayMode,
    });

    return {
      type: 'PAGE_TRANSLATION_FINISHED',
      status: result.status,
      translated: result.translated,
      failedBatches: result.failedBatches,
    };
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/background/messaging.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/shared/messages.ts src/background/messaging.ts src/background/index.ts src/content/index.ts tests/background/messaging.test.ts src/background/translator/translate-page.ts src/storage/settings.ts
git commit -m "feat: connect background orchestration to content messaging"
```

### Task 9: Build the popup MVP for translation controls

**Files:**
- Create: `src/popup/main.tsx`
- Create: `src/popup/App.tsx`
- Create: `src/popup/index.html`
- Create: `tests/popup/app.test.tsx`
- Modify: `src/shared/messages.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/popup/app.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../../src/popup/App';

describe('Popup App', () => {
  it('sends translation and display-mode requests for the active tab', async () => {
    const getActiveTabId = vi.fn().mockResolvedValue(3);
    const sendRuntimeMessage = vi.fn().mockResolvedValue(undefined);

    render(<App getActiveTabId={getActiveTabId} sendRuntimeMessage={sendRuntimeMessage} />);

    fireEvent.click(screen.getByRole('button', { name: '翻译当前页面' }));
    fireEvent.click(screen.getByRole('button', { name: '仅看译文' }));

    expect(getActiveTabId).toHaveBeenCalled();
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'START_PAGE_TRANSLATION',
      tabId: 3,
    });
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: 'SET_DISPLAY_MODE',
      tabId: 3,
      displayMode: 'translated-only',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/popup/app.test.tsx`
Expected: FAIL with `Cannot find module '../../src/popup/App'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/popup/App.tsx
type AppProps = {
  getActiveTabId: () => Promise<number>;
  sendRuntimeMessage: (message: { type: 'START_PAGE_TRANSLATION'; tabId: number } | { type: 'SET_DISPLAY_MODE'; tabId: number; displayMode: 'translated-only' }) => Promise<void>;
};

export function App({ getActiveTabId, sendRuntimeMessage }: AppProps) {
  async function handleTranslate() {
    const tabId = await getActiveTabId();
    await sendRuntimeMessage({
      type: 'START_PAGE_TRANSLATION',
      tabId,
    });
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
```

```tsx
// src/popup/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App
      getActiveTabId={async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab.id!;
      }}
      sendRuntimeMessage={(message) => chrome.runtime.sendMessage(message)}
    />
  </React.StrictMode>,
);
```

```html
<!-- src/popup/index.html -->
<!doctype html>
<html lang="zh-CN">
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/popup/app.test.tsx`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/popup/main.tsx src/popup/App.tsx src/popup/index.html tests/popup/app.test.tsx src/shared/messages.ts
git commit -m "feat: add popup mvp translation controls"
```

### Task 10: Build the options page for provider and language settings

**Files:**
- Create: `src/options/main.tsx`
- Create: `src/options/App.tsx`
- Create: `src/options/index.html`
- Create: `tests/options/app.test.tsx`
- Modify: `src/storage/settings.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/options/app.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../../src/options/App';
import { createDefaultSettings } from '../../src/shared/config';

describe('Options App', () => {
  it('edits languages and provider credentials and saves settings', async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);

    render(<App initialSettings={createDefaultSettings()} saveSettings={saveSettings} />);

    fireEvent.change(screen.getByLabelText('源语言'), {
      target: { value: 'en' },
    });
    fireEvent.change(screen.getByLabelText('目标语言'), {
      target: { value: 'ja' },
    });
    fireEvent.change(screen.getByLabelText('OpenAI API Key'), {
      target: { value: 'sk-test' },
    });
    fireEvent.change(screen.getByLabelText('OpenAI Base URL'), {
      target: { value: 'https://example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('OpenAI Model'), {
      target: { value: 'gpt-4.1-mini' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguage: 'en',
        targetLanguage: 'ja',
        providers: expect.objectContaining({
          'openai-compatible': expect.objectContaining({
            apiKey: 'sk-test',
            baseUrl: 'https://example.com/v1',
            model: 'gpt-4.1-mini',
          }),
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/options/app.test.tsx`
Expected: FAIL with `Cannot find module '../../src/options/App'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/options/App.tsx
import { useState } from 'react';

import type { ExtensionSettings } from '../shared/types';

type AppProps = {
  initialSettings: ExtensionSettings;
  saveSettings: (settings: ExtensionSettings) => Promise<void>;
};

export function App({ initialSettings, saveSettings }: AppProps) {
  const [settings, setSettings] = useState(initialSettings);

  return (
    <main>
      <h1>设置</h1>
      <label>
        源语言
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
      <label>
        目标语言
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
      <label>
        OpenAI API Key
        <input
          aria-label="OpenAI API Key"
          value={settings.providers['openai-compatible'].apiKey ?? ''}
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
      <label>
        OpenAI Base URL
        <input
          aria-label="OpenAI Base URL"
          value={settings.providers['openai-compatible'].baseUrl ?? ''}
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
      <label>
        OpenAI Model
        <input
          aria-label="OpenAI Model"
          value={settings.providers['openai-compatible'].model ?? ''}
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
      <button type="button" onClick={() => saveSettings(settings)}>
        保存设置
      </button>
    </main>
  );
}
```

```tsx
// src/options/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';

import { createDefaultSettings } from '../shared/config';
import { loadSettings, saveSettings } from '../storage/settings';
import { App } from './App';

async function bootstrap() {
  const initialSettings = await loadSettings().catch(() => createDefaultSettings());
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App initialSettings={initialSettings} saveSettings={saveSettings} />
    </React.StrictMode>,
  );
}

void bootstrap();
```

```html
<!-- src/options/index.html -->
<!doctype html>
<html lang="zh-CN">
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/options/app.test.tsx`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/options/main.tsx src/options/App.tsx src/options/index.html tests/options/app.test.tsx src/storage/settings.ts src/shared/types.ts
git commit -m "feat: add options page for provider settings"
```

### Task 11: Wire the extension manifest and page entrypoints together

**Files:**
- Create: `src/manifest.ts`
- Modify: `vite.config.ts`
- Create: `tests/shared/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/shared/manifest.test.ts
import { describe, expect, it } from 'vitest';

import { manifest } from '../../src/manifest';

describe('manifest', () => {
  it('declares popup, options, content script, and service worker entrypoints', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.action?.default_popup).toBe('src/popup/index.html');
    expect(manifest.options_page).toBe('src/options/index.html');
    expect(manifest.background?.service_worker).toBe('src/background/index.ts');
    expect(manifest.content_scripts?.[0].js).toEqual(['src/content/index.ts']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/manifest.test.ts`
Expected: FAIL with `Cannot find module '../../src/manifest'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/manifest.ts
import type { ManifestV3Export } from '@crxjs/vite-plugin';

export const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: 'Immersive AI Translate',
  version: '0.1.0',
  action: {
    default_popup: 'src/popup/index.html',
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['storage', 'activeTab', 'scripting', 'tabs'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
};
```

```ts
// vite.config.ts
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { manifest } from './src/manifest';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/shared/manifest.test.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/manifest.ts vite.config.ts src/background/index.ts src/content/index.ts src/popup/index.html src/options/index.html tests/shared/manifest.test.ts
git commit -m "feat: wire manifest entrypoints for extension build"
```

### Task 12: Add end-to-end coverage for the MVP translation loop

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/article.html`
- Create: `tests/e2e/page-translation.spec.ts`
- Modify: `src/background/index.ts`
- Modify: `src/content/index.ts`
- Modify: `src/popup/App.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/page-translation.spec.ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

test('translates a page and toggles translated-only mode', async ({ page, context }) => {
  const extensionId = process.env.PLAYWRIGHT_EXTENSION_ID!;
  await page.goto(`file://${path.resolve('tests/e2e/fixtures/article.html')}`);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  await popup.getByRole('button', { name: '翻译当前页面' }).click();

  await expect(page.locator('text=你好，世界')).toBeVisible();
  await popup.getByRole('button', { name: '仅看译文' }).click();
  await expect(page.locator('text=Hello world')).toBeHidden();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/page-translation.spec.ts`
Expected: FAIL because the extension UI and content workflow are not yet fully connected

- [ ] **Step 3: Write minimal implementation**

```ts
// src/background/index.ts
import { createMessageHandler } from './messaging';
import { loadSettings } from '../storage/settings';
import { translatePageSegments } from './translator/translate-page';

const handler = createMessageHandler({
  loadSettings,
  sendMessageToTab: (tabId, message) => chrome.tabs.sendMessage(tabId, message),
  translatePage: translatePageSegments,
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handler(message).then(sendResponse).catch((error) => sendResponse({ type: 'PAGE_TRANSLATION_FAILED', message: error.message }));
  return true;
});
```

```ts
// src/content/index.ts
import { extractSegments } from './dom-extractor';
import { applyTranslations, setDisplayMode } from './segment-renderer';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'COLLECT_PAGE_SEGMENTS') {
    const segments = extractSegments(document.body);
    document.querySelectorAll('h1, h2, h3, p, li, blockquote').forEach((element, index) => {
      (element as HTMLElement).dataset.segmentId = `seg-${index}`;
    });
    sendResponse(segments);
  }

  if (message.type === 'APPLY_PAGE_TRANSLATION') {
    applyTranslations(document.body, message.translated);
    setDisplayMode(document.body, message.displayMode);
    sendResponse({ ok: true });
  }

  if (message.type === 'SET_DISPLAY_MODE') {
    setDisplayMode(document.body, message.displayMode);
    sendResponse({ ok: true });
  }

  return true;
});
```

```tsx
// src/popup/App.tsx
type AppProps = {
  getActiveTabId: () => Promise<number>;
  sendRuntimeMessage: (
    message:
      | { type: 'START_PAGE_TRANSLATION'; tabId: number }
      | { type: 'SET_DISPLAY_MODE'; tabId: number; displayMode: 'translated-only' },
  ) => Promise<void>;
};

export function App({ getActiveTabId, sendRuntimeMessage }: AppProps) {
  async function handleTranslate() {
    const tabId = await getActiveTabId();
    await sendRuntimeMessage({
      type: 'START_PAGE_TRANSLATION',
      tabId,
    });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- tests/e2e/page-translation.spec.ts`
Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/fixtures/article.html tests/e2e/page-translation.spec.ts src/background/index.ts src/content/index.ts src/popup/App.tsx
git commit -m "test: cover the mvp translation loop end to end"
```

### Task 13: Final verification and manual smoke checklist

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-22-immersive-ai-translate-design.md`

- [ ] **Step 1: Write the failing verification task**

```md
<!-- README.md -->
## Verification checklist

- [ ] Unit tests pass
- [ ] DOM tests pass
- [ ] Background integration tests pass
- [ ] E2E translation test passes
- [ ] Manual smoke test on one real article page passes
```

- [ ] **Step 2: Run verification commands and capture failures**

Run: `npm test`
Expected: PASS with all Vitest suites green

Run: `npm run test:e2e`
Expected: PASS with Playwright translation suite green

Run: `npm run build`
Expected: PASS and produce a browser-loadable `dist/`

- [ ] **Step 3: Write minimal implementation**

```md
<!-- README.md -->
# Immersive AI Translate

## Development

    npm install
    npm test
    npm run test:e2e
    npm run build

## Manual smoke test

1. Load `dist/` as an unpacked extension in Chrome.
2. Open a public article page.
3. Configure an API key in the options page.
4. Trigger page translation from the popup.
5. Verify bilingual mode, translated-only mode, and restore behavior.
```

- [ ] **Step 4: Run verification to confirm it stays green**

Run: `npm test`
Expected: PASS with all Vitest suites green

Run: `npm run test:e2e`
Expected: PASS with Playwright translation suite green

Run: `npm run build`
Expected: PASS with no failing suites and a generated production bundle

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-04-22-immersive-ai-translate-design.md
git commit -m "docs: add verification guidance for immersive ai translate"
```
