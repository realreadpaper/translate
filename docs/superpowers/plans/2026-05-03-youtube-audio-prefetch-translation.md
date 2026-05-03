# YouTube 音频预抓与字幕预翻译实施计划

> **给 agentic workers：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务实施此计划。步骤使用 checkbox（`- [ ]`）语法跟踪进度。

**目标：** 实现 A 稳定路径和 B 实验路径：有字幕时提前批量翻译 YouTube timedtext；无字幕时尝试后台音频预抓 ASR，并提供可降级的实时采集路径和 ASR 配置教程。

**架构：** 保持现有 YouTube overlay 和 background 翻译入口，新增小而明确的 source/queue/provider 边界。A 路径先扩大字幕预翻译窗口并补全轨道；B 路径只在 A 不可用时解析 audio-only adaptive format，失败后进入 tabCapture/offscreen fallback。所有 cue 最终复用现有 `START_TRANSLATION_JOB` 和 overlay。

**技术栈：** TypeScript、Chrome MV3、Vitest、Vite、现有 provider translation pipeline、YouTube timedtext、Chrome `tabCapture`、Chrome `offscreen`。

---

## 文件结构

- 修改：`src/content/youtube/subtitle-source.ts`
  - 负责 timedtext 轨道读取、解析、首批预翻译窗口选择。
- 修改：`src/content/youtube/subtitle-overlay.ts`
  - 负责 cue 缓存、overlay 渲染、播放时前瞻调度。保持只处理 cue，不处理音频细节。
- 新建：`src/content/youtube/prefetch-queue.ts`
  - 负责 `urgent` / `prefetch` / `background` cue 分组、去重、批量切分。
- 新建：`src/content/youtube/audio-source.ts`
  - 负责从 `ytInitialPlayerResponse.streamingData.adaptiveFormats` 解析 direct audio URL 和可降级失败原因。
- 新建：`src/background/youtube-asr.ts`
  - 负责 ASR provider 配置校验、音频块转 ASR cue 的 adapter 边界。
- 新建：`src/offscreen/audio-capture.ts`
  - 负责 offscreen document 里的 `MediaRecorder` 分段。
- 新建：`src/offscreen/audio-capture.html`
  - MV3 offscreen document 入口。
- 修改：`src/background/messaging.ts`
  - 负责 A 失败后切换 B/fallback，保持有字幕路径不触发音频。
- 修改：`src/background/index.ts`
  - 负责 wiring、新权限相关 runtime 调用。
- 修改：`src/manifest.ts`
  - 增加 `tabCapture`、`offscreen` 权限和 offscreen resource。
- 修改：`src/shared/types.ts`
  - 增加 ASR 和预翻译设置类型。
- 修改：`src/shared/config.ts`
  - 增加默认 ASR 和预翻译设置。
- 修改：`src/storage/settings.ts`
  - 兼容旧设置迁移。
- 修改：`src/options/App.tsx`
  - 增加 ASR 配置输入和实验音频预抓开关。
- 新建：`docs/youtube-asr-setup.md`
  - 开发完成后的用户配置教程。
- 测试：`tests/content/youtube/subtitle-source.test.ts`
- 测试：`tests/content/youtube/subtitle-overlay.test.ts`
- 新建测试：`tests/content/youtube/prefetch-queue.test.ts`
- 新建测试：`tests/content/youtube/audio-source.test.ts`
- 新建测试：`tests/background/youtube-asr.test.ts`
- 修改测试：`tests/background/messaging.test.ts`
- 修改测试：`tests/storage/settings.test.ts`
- 修改测试：`tests/options/app.test.tsx`
- 修改测试：`tests/shared/manifest.test.ts`

## Karpathy 约束

- 每个任务只改能被对应测试证明的代码。
- 不重构无关模块，不清理已有构建产物，不调整无关 UI 文案。
- 新抽象只在至少两个调用点共享时出现；单调用点使用普通函数。
- B 路径标记为实验路径，不能让有字幕视频多走一步音频逻辑。
- 失败原因用显式结果对象表示，避免靠字符串异常控制主流程。

### Task 1: 设置、权限和迁移

**Files:**
- 修改：`src/shared/types.ts`
- 修改：`src/shared/config.ts`
- 修改：`src/storage/settings.ts`
- 修改：`src/manifest.ts`
- 测试：`tests/storage/settings.test.ts`
- 测试：`tests/shared/config.test.ts`
- 测试：`tests/shared/manifest.test.ts`

- [ ] **步骤 1：编写失败测试**

在 `tests/storage/settings.test.ts` 增加：

```ts
it('migrates saved settings that do not have youtube prefetch and asr provider settings yet', async () => {
  const legacySettings = createDefaultSettings();
  delete (legacySettings as Partial<typeof legacySettings>).youtubeSubtitlePrefetchEnabled;
  delete (legacySettings as Partial<typeof legacySettings>).youtubeSubtitlePrefetchWindowSeconds;
  delete (legacySettings as Partial<typeof legacySettings>).youtubeExperimentalAudioPrefetchEnabled;
  delete (legacySettings as Partial<typeof legacySettings>).youtubeAsrProvider;
  store.set('immersive-ai-translate.settings', legacySettings);

  const settings = await loadSettings();

  expect(settings.youtubeSubtitlePrefetchEnabled).toBe(true);
  expect(settings.youtubeSubtitlePrefetchWindowSeconds).toBe(180);
  expect(settings.youtubeExperimentalAudioPrefetchEnabled).toBe(false);
  expect(settings.youtubeAsrProvider).toEqual({
    providerId: 'openai-compatible',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
  });
});
```

在 `tests/shared/manifest.test.ts` 增加：

```ts
it('declares audio capture permissions and offscreen document resources for youtube asr fallback', () => {
  expect(manifest.permissions).toContain('tabCapture');
  expect(manifest.permissions).toContain('offscreen');
  expect(JSON.stringify(manifest.web_accessible_resources)).toContain(
    'src/offscreen/audio-capture.html',
  );
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- tests/storage/settings.test.ts tests/shared/config.test.ts tests/shared/manifest.test.ts
```

预期：FAIL，错误包含新字段不存在或 manifest 权限缺失。

- [ ] **步骤 3：编写最小实现**

在 `src/shared/types.ts` 增加：

```ts
export type YoutubeAsrProviderSettings = {
  providerId: 'openai-compatible';
  apiKey: string;
  baseUrl: string;
  model: string;
};
```

并给 `ExtensionSettings` 增加：

```ts
youtubeSubtitlePrefetchEnabled: boolean;
youtubeSubtitlePrefetchWindowSeconds: number;
youtubeExperimentalAudioPrefetchEnabled: boolean;
youtubeAsrProvider: YoutubeAsrProviderSettings;
```

在 `src/shared/config.ts` 的默认设置中增加：

```ts
youtubeSubtitlePrefetchEnabled: true,
youtubeSubtitlePrefetchWindowSeconds: 180,
youtubeExperimentalAudioPrefetchEnabled: false,
youtubeAsrProvider: {
  providerId: 'openai-compatible',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'whisper-1',
},
```

在 `src/manifest.ts` 的 `permissions` 增加：

```ts
'tabCapture',
'offscreen',
```

并在 `web_accessible_resources[0].resources` 增加：

```ts
'src/offscreen/audio-capture.html',
```

- [ ] **步骤 4：运行测试，确认通过**

运行：

```bash
npm test -- tests/storage/settings.test.ts tests/shared/config.test.ts tests/shared/manifest.test.ts
```

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add src/shared/types.ts src/shared/config.ts src/storage/settings.ts src/manifest.ts tests/storage/settings.test.ts tests/shared/config.test.ts tests/shared/manifest.test.ts
git commit -m "feat: add youtube asr settings and permissions"
```

### Task 2: A 路径首批字幕窗口扩大

**Files:**
- 修改：`src/content/youtube/subtitle-source.ts`
- 测试：`tests/content/youtube/subtitle-source.test.ts`

- [ ] **步骤 1：编写失败测试**

在 `tests/content/youtube/subtitle-source.test.ts` 增加：

```ts
it('returns a prefetch window of timedtext cues after the current playback position', async () => {
  document.body.innerHTML = '<video></video>';
  const video = document.querySelector('video') as HTMLVideoElement;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    value: 60,
  });
  Object.assign(window, {
    ytInitialPlayerResponse: {
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=demo&lang=en' }],
        },
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `
        <transcript>
          <text start="10" dur="2">Old line</text>
          <text start="61" dur="2">Current line</text>
          <text start="120" dur="2">Two minutes</text>
          <text start="239" dur="2">Three minutes</text>
          <text start="400" dur="2">Too far</text>
        </transcript>
      `,
    }),
  );

  await expect(collectYoutubeSubtitleSegments('auto')).resolves.toEqual([
    { id: 'cue-1', text: 'Current line' },
    { id: 'cue-2', text: 'Two minutes' },
    { id: 'cue-3', text: 'Three minutes' },
  ]);
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- tests/content/youtube/subtitle-source.test.ts
```

预期：FAIL，实际只返回一个当前 cue。

- [ ] **步骤 3：编写最小实现**

在 `src/content/youtube/subtitle-source.ts` 增加常量：

```ts
const FULL_TRACK_INITIAL_LOOKAHEAD_MS = 180_000;
const FULL_TRACK_INITIAL_MAX_CUES = 80;
```

调整 `selectInitialTrackCues`：

```ts
function selectInitialTrackCues(cues: YoutubeSubtitleCue[]): YoutubeSubtitleCue[] {
  const video = document.querySelector('video');
  if (!video) {
    return cues.slice(0, FULL_TRACK_INITIAL_MAX_CUES);
  }

  const nowMs = Math.max(0, Math.round(video.currentTime * 1000));
  const lookaheadEndMs = nowMs + FULL_TRACK_INITIAL_LOOKAHEAD_MS;
  const windowCues = cues.filter(
    (cue) =>
      cue.endMs >= nowMs - FULL_TRACK_INITIAL_CUE_GRACE_MS &&
      cue.startMs <= lookaheadEndMs,
  );

  if (windowCues.length > 0) {
    return windowCues.slice(0, FULL_TRACK_INITIAL_MAX_CUES);
  }

  const firstWindowIndex = cues.findIndex(
    (cue) => cue.endMs >= nowMs - FULL_TRACK_INITIAL_CUE_GRACE_MS,
  );
  const startIndex = firstWindowIndex === -1 ? 0 : firstWindowIndex;
  return cues.slice(startIndex, startIndex + FULL_TRACK_INITIAL_MAX_CUES);
}
```

- [ ] **步骤 4：运行测试，确认通过**

运行：

```bash
npm test -- tests/content/youtube/subtitle-source.test.ts
```

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add src/content/youtube/subtitle-source.ts tests/content/youtube/subtitle-source.test.ts
git commit -m "feat: prefetch initial youtube subtitle window"
```

### Task 3: YouTube cue 预翻译队列

**Files:**
- 新建：`src/content/youtube/prefetch-queue.ts`
- 测试：`tests/content/youtube/prefetch-queue.test.ts`
- 修改：`src/content/youtube/subtitle-overlay.ts`
- 测试：`tests/content/youtube/subtitle-overlay.test.ts`

- [ ] **步骤 1：编写失败测试**

新建 `tests/content/youtube/prefetch-queue.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { createYoutubePrefetchBatches } from '../../../src/content/youtube/prefetch-queue';

describe('createYoutubePrefetchBatches', () => {
  it('prioritizes urgent cues and separates wider prefetch and background work', () => {
    const batches = createYoutubePrefetchBatches({
      cues: [
        { id: 'cue-0', text: 'Now', startMs: 1000, endMs: 2000 },
        { id: 'cue-1', text: 'Soon', startMs: 20_000, endMs: 22_000 },
        { id: 'cue-2', text: 'Window', startMs: 120_000, endMs: 122_000 },
        { id: 'cue-3', text: 'Later', startMs: 600_000, endMs: 602_000 },
      ],
      nowMs: 0,
      translatedIds: new Set(),
      pendingIds: new Set(),
      translatedTextBySourceText: new Map(),
    });

    expect(batches).toEqual([
      { lane: 'urgent', segments: [{ id: 'cue-0', text: 'Now' }, { id: 'cue-1', text: 'Soon' }] },
      { lane: 'prefetch', segments: [{ id: 'cue-2', text: 'Window' }] },
      { lane: 'background', segments: [{ id: 'cue-3', text: 'Later' }] },
    ]);
  });

  it('skips translated, pending, and repeated source text cues', () => {
    const batches = createYoutubePrefetchBatches({
      cues: [
        { id: 'cue-0', text: 'Hello', startMs: 1000, endMs: 2000 },
        { id: 'cue-1', text: 'Pending', startMs: 3000, endMs: 4000 },
        { id: 'cue-2', text: 'Repeated', startMs: 5000, endMs: 6000 },
      ],
      nowMs: 0,
      translatedIds: new Set(['cue-0']),
      pendingIds: new Set(['cue-1']),
      translatedTextBySourceText: new Map([['repeated', '重复']]),
    });

    expect(batches).toEqual([]);
  });
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- tests/content/youtube/prefetch-queue.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：编写最小实现**

新建 `src/content/youtube/prefetch-queue.ts`：

```ts
import type { YoutubeSubtitleCue } from './subtitle-overlay';

type Lane = 'urgent' | 'prefetch' | 'background';

type CreateYoutubePrefetchBatchesOptions = {
  cues: YoutubeSubtitleCue[];
  nowMs: number;
  translatedIds: Set<string>;
  pendingIds: Set<string>;
  translatedTextBySourceText: Map<string, string>;
};

type YoutubePrefetchBatch = {
  lane: Lane;
  segments: Array<{ id: string; text: string }>;
};

const URGENT_LOOKAHEAD_MS = 30_000;
const PREFETCH_LOOKAHEAD_MS = 180_000;
const URGENT_BATCH_SIZE = 4;
const PREFETCH_BATCH_SIZE = 8;
const BACKGROUND_BATCH_SIZE = 8;

export function createYoutubePrefetchBatches({
  cues,
  nowMs,
  translatedIds,
  pendingIds,
  translatedTextBySourceText,
}: CreateYoutubePrefetchBatchesOptions): YoutubePrefetchBatch[] {
  const lanes: Record<Lane, Array<{ id: string; text: string }>> = {
    urgent: [],
    prefetch: [],
    background: [],
  };

  for (const cue of cues) {
    if (
      cue.endMs < nowMs - 500 ||
      translatedIds.has(cue.id) ||
      pendingIds.has(cue.id) ||
      translatedTextBySourceText.has(createSourceTextCacheKey(cue.text))
    ) {
      continue;
    }

    const segment = { id: cue.id, text: cue.text };
    if (cue.startMs <= nowMs + URGENT_LOOKAHEAD_MS) {
      lanes.urgent.push(segment);
    } else if (cue.startMs <= nowMs + PREFETCH_LOOKAHEAD_MS) {
      lanes.prefetch.push(segment);
    } else {
      lanes.background.push(segment);
    }
  }

  return [
    { lane: 'urgent' as const, segments: lanes.urgent.slice(0, URGENT_BATCH_SIZE) },
    { lane: 'prefetch' as const, segments: lanes.prefetch.slice(0, PREFETCH_BATCH_SIZE) },
    { lane: 'background' as const, segments: lanes.background.slice(0, BACKGROUND_BATCH_SIZE) },
  ].filter((batch) => batch.segments.length > 0);
}

export function createSourceTextCacheKey(sourceText: string): string {
  return sourceText.replace(/\s+/g, ' ').trim().toLowerCase();
}
```

- [ ] **步骤 4：接入 overlay 的最小改动**

在 `src/content/youtube/subtitle-overlay.ts` 中导入 `createYoutubePrefetchBatches`，替换 `requestTrackLookaheadTranslation` 内部的 candidate 选择逻辑。保留现有 `queueTrackLookaheadSegments`，让每个 batch 调用一次：

```ts
const batches = createYoutubePrefetchBatches({
  cues: cachedCues.filter((cue) => !cue.id.startsWith(RENDERED_CUE_PREFIX)),
  nowMs,
  translatedIds: new Set(controller.translatedById.keys()),
  pendingIds: controller.pendingTrackCueIds,
  translatedTextBySourceText,
});

batches.forEach((batch) => {
  queueTrackLookaheadSegments(controller, sendRuntimeMessage, batch.segments, batch.lane);
});
```

- [ ] **步骤 5：运行测试，确认通过**

运行：

```bash
npm test -- tests/content/youtube/prefetch-queue.test.ts tests/content/youtube/subtitle-overlay.test.ts
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add src/content/youtube/prefetch-queue.ts src/content/youtube/subtitle-overlay.ts tests/content/youtube/prefetch-queue.test.ts tests/content/youtube/subtitle-overlay.test.ts
git commit -m "feat: queue youtube subtitle prefetch batches"
```

### Task 4: B 路径 direct audio URL 解析

**Files:**
- 新建：`src/content/youtube/audio-source.ts`
- 测试：`tests/content/youtube/audio-source.test.ts`
- 修改：`src/content/youtube/subtitle-source.ts`
- 测试：`tests/content/youtube/subtitle-source.test.ts`

- [ ] **步骤 1：编写失败测试**

新建 `tests/content/youtube/audio-source.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { selectYoutubeAudioFormat } from '../../../src/content/youtube/audio-source';

describe('selectYoutubeAudioFormat', () => {
  it('selects a direct low bitrate audio-only adaptive format', () => {
    const result = selectYoutubeAudioFormat({
      streamingData: {
        adaptiveFormats: [
          { mimeType: 'video/mp4', bitrate: 300000, url: 'https://video.example' },
          { mimeType: 'audio/webm; codecs="opus"', bitrate: 48000, url: 'https://audio-low.example' },
          { mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, url: 'https://audio-high.example' },
        ],
      },
    });

    expect(result).toEqual({
      ok: true,
      format: {
        mimeType: 'audio/webm; codecs="opus"',
        bitrate: 48000,
        url: 'https://audio-low.example',
      },
    });
  });

  it('returns a downgrade reason when only signatureCipher audio formats exist', () => {
    const result = selectYoutubeAudioFormat({
      streamingData: {
        adaptiveFormats: [
          {
            mimeType: 'audio/webm; codecs="opus"',
            bitrate: 48000,
            signatureCipher: 's=encrypted&url=https%3A%2F%2Faudio.example',
          },
        ],
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'signature-cipher-not-supported',
    });
  });
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- tests/content/youtube/audio-source.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：编写最小实现**

新建 `src/content/youtube/audio-source.ts`：

```ts
type YoutubeAdaptiveFormat = {
  mimeType?: string;
  bitrate?: number;
  url?: string;
  signatureCipher?: string;
};

type YoutubePlayerResponseWithStreamingData = {
  streamingData?: {
    adaptiveFormats?: YoutubeAdaptiveFormat[];
  };
};

export type YoutubeAudioFormatSelection =
  | { ok: true; format: Required<Pick<YoutubeAdaptiveFormat, 'mimeType' | 'url'>> & { bitrate?: number } }
  | { ok: false; reason: 'no-audio-format' | 'signature-cipher-not-supported' };

export function selectYoutubeAudioFormat(
  playerResponse: YoutubePlayerResponseWithStreamingData | null,
): YoutubeAudioFormatSelection {
  const audioFormats = (playerResponse?.streamingData?.adaptiveFormats ?? [])
    .filter((format) => format.mimeType?.startsWith('audio/'))
    .sort((a, b) => (a.bitrate ?? Number.MAX_SAFE_INTEGER) - (b.bitrate ?? Number.MAX_SAFE_INTEGER));

  const directFormat = audioFormats.find((format) => format.url && format.mimeType);
  if (directFormat?.url && directFormat.mimeType) {
    return {
      ok: true,
      format: {
        mimeType: directFormat.mimeType,
        bitrate: directFormat.bitrate,
        url: directFormat.url,
      },
    };
  }

  if (audioFormats.some((format) => format.signatureCipher)) {
    return { ok: false, reason: 'signature-cipher-not-supported' };
  }

  return { ok: false, reason: 'no-audio-format' };
}
```

- [ ] **步骤 4：运行测试，确认通过**

运行：

```bash
npm test -- tests/content/youtube/audio-source.test.ts
```

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add src/content/youtube/audio-source.ts tests/content/youtube/audio-source.test.ts
git commit -m "feat: detect youtube direct audio formats"
```

### Task 5: ASR adapter 边界

**Files:**
- 新建：`src/background/youtube-asr.ts`
- 测试：`tests/background/youtube-asr.test.ts`

- [ ] **步骤 1：编写失败测试**

新建 `tests/background/youtube-asr.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';

import { transcribeYoutubeAudioChunks } from '../../src/background/youtube-asr';

describe('transcribeYoutubeAudioChunks', () => {
  it('rejects asr when the api key is missing', async () => {
    await expect(
      transcribeYoutubeAudioChunks({
        chunks: [],
        settings: {
          providerId: 'openai-compatible',
          apiKey: '',
          baseUrl: 'https://api.openai.com/v1',
          model: 'whisper-1',
        },
        postForm: vi.fn(),
      }),
    ).rejects.toThrow('请先配置 YouTube ASR API Key。');
  });

  it('converts provider text into a coarse asr cue for each audio chunk', async () => {
    const postForm = vi.fn().mockResolvedValue({ text: 'Hello from audio' });

    await expect(
      transcribeYoutubeAudioChunks({
        chunks: [
          {
            id: 'chunk-0',
            source: 'youtube-adaptive-format',
            startMs: 0,
            endMs: 5000,
            mimeType: 'audio/webm',
            data: new Blob(['audio'], { type: 'audio/webm' }),
          },
        ],
        settings: {
          providerId: 'openai-compatible',
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'whisper-1',
        },
        postForm,
      }),
    ).resolves.toEqual([
      { id: 'asr-cue-0-0', text: 'Hello from audio', startMs: 0, endMs: 5000 },
    ]);
  });
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- tests/background/youtube-asr.test.ts
```

预期：FAIL，模块不存在。

- [ ] **步骤 3：编写最小实现**

新建 `src/background/youtube-asr.ts`：

```ts
import type { YoutubeAsrProviderSettings } from '../shared/types';
import type { YoutubeSubtitleCue } from '../content/youtube/subtitle-overlay';

export type YoutubeAudioChunk = {
  id: string;
  source: 'youtube-adaptive-format' | 'tab-capture';
  startMs: number;
  endMs: number;
  mimeType: string;
  data: Blob;
};

type PostForm = (url: string, formData: FormData, headers: Record<string, string>) => Promise<unknown>;

export async function transcribeYoutubeAudioChunks({
  chunks,
  settings,
  postForm,
}: {
  chunks: YoutubeAudioChunk[];
  settings: YoutubeAsrProviderSettings;
  postForm: PostForm;
}): Promise<YoutubeSubtitleCue[]> {
  if (!settings.apiKey) {
    throw new Error('请先配置 YouTube ASR API Key。');
  }

  const cues: YoutubeSubtitleCue[] = [];
  for (const [chunkIndex, chunk] of chunks.entries()) {
    const formData = new FormData();
    formData.set('model', settings.model);
    formData.set('file', chunk.data, `${chunk.id}.webm`);

    const response = await postForm(
      `${settings.baseUrl.replace(/\/$/, '')}/audio/transcriptions`,
      formData,
      { Authorization: `Bearer ${settings.apiKey}` },
    );
    const text =
      response && typeof response === 'object' && 'text' in response
        ? String(response.text).trim()
        : '';
    if (!text) {
      continue;
    }

    cues.push({
      id: `asr-cue-${chunkIndex}-0`,
      text,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
    });
  }

  return cues;
}
```

- [ ] **步骤 4：运行测试，确认通过**

运行：

```bash
npm test -- tests/background/youtube-asr.test.ts
```

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add src/background/youtube-asr.ts tests/background/youtube-asr.test.ts
git commit -m "feat: add youtube asr adapter boundary"
```

### Task 6: background A/B/fallback 调度

**Files:**
- 修改：`src/background/messaging.ts`
- 修改：`src/shared/messages.ts`
- 测试：`tests/background/messaging.test.ts`

- [ ] **步骤 1：编写失败测试**

在 `tests/background/messaging.test.ts` 增加：

```ts
it('does not start youtube audio fallback when caption-track collection succeeds', async () => {
  const startYoutubeAudioAsr = vi.fn();
  const sendMessageToTab = vi.fn().mockResolvedValue([{ id: 'cue-0', text: 'Hello' }]);
  const translatePage = vi.fn().mockResolvedValue({
    status: 'success',
    translated: [{ id: 'cue-0', translatedText: '你好' }],
    failedBatches: [],
  });
  const target = {
    kind: 'youtube-subtitles',
    tabId: 7,
    url: 'https://www.youtube.com/watch?v=demo',
    videoId: 'demo',
  } satisfies TranslationTarget;

  const handler = createMessageHandler({
    sendMessageToTab,
    translatePage,
    loadSettings: vi.fn().mockResolvedValue(defaultSettings),
    detectTarget: vi.fn().mockResolvedValue(target),
    openPdfWorkspace: vi.fn(),
    startYoutubeAudioAsr,
  });

  await handler({ type: 'START_TRANSLATION_JOB', tabId: 7 });

  expect(startYoutubeAudioAsr).not.toHaveBeenCalled();
});

it('starts youtube audio asr when caption-track collection returns no segments', async () => {
  const sendMessageToTab = vi.fn().mockResolvedValue([]);
  const startYoutubeAudioAsr = vi.fn().mockResolvedValue([{ id: 'asr-cue-0-0', text: 'Audio text' }]);
  const translatePage = vi.fn().mockResolvedValue({
    status: 'success',
    translated: [{ id: 'asr-cue-0-0', translatedText: '音频文本' }],
    failedBatches: [],
  });
  const target = {
    kind: 'youtube-subtitles',
    tabId: 7,
    url: 'https://www.youtube.com/watch?v=demo',
    videoId: 'demo',
  } satisfies TranslationTarget;

  const handler = createMessageHandler({
    sendMessageToTab,
    translatePage,
    loadSettings: vi.fn().mockResolvedValue({
      ...defaultSettings,
      youtubeExperimentalAudioPrefetchEnabled: true,
      youtubeAsrProvider: {
        providerId: 'openai-compatible',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'whisper-1',
      },
    }),
    detectTarget: vi.fn().mockResolvedValue(target),
    openPdfWorkspace: vi.fn(),
    startYoutubeAudioAsr,
  });

  await handler({ type: 'START_TRANSLATION_JOB', tabId: 7 });

  expect(startYoutubeAudioAsr).toHaveBeenCalledWith(
    target,
    expect.objectContaining({
      providerId: 'openai-compatible',
      apiKey: 'test-key',
    }),
  );
  expect(translatePage).toHaveBeenCalledWith(
    [{ id: 'asr-cue-0-0', text: 'Audio text' }],
    expect.objectContaining({ contentKind: 'youtube-subtitles' }),
  );
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- tests/background/messaging.test.ts
```

预期：FAIL，`startYoutubeAudioAsr` 依赖不存在。

- [ ] **步骤 3：编写最小实现**

在 `src/background/messaging.ts` 的 dependencies 增加：

```ts
startYoutubeAudioAsr?: (
  target: Extract<TranslationTarget, { kind: 'youtube-subtitles' }>,
  settings: ExtensionSettings['youtubeAsrProvider'],
) => Promise<SourceSegment[]>;
```

在 YouTube path 中，把空字幕逻辑改成：

```ts
let segments = collectedSegments;
if (
  segments.length === 0 &&
  settings.youtubeExperimentalAudioPrefetchEnabled &&
  startYoutubeAudioAsr
) {
  segments = await startYoutubeAudioAsr(target, settings.youtubeAsrProvider);
}

if (segments.length === 0) {
  throw new Error(createYoutubeSubtitleUnavailableMessage(settings.youtubeAsrFallback));
}
```

保持 caller-provided `segments` 不触发音频路径。

- [ ] **步骤 4：运行测试，确认通过**

运行：

```bash
npm test -- tests/background/messaging.test.ts
```

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add src/background/messaging.ts src/shared/messages.ts tests/background/messaging.test.ts
git commit -m "feat: route youtube subtitles to audio asr fallback"
```

### Task 7: offscreen 实时音频采集骨架

**Files:**
- 新建：`src/offscreen/audio-capture.html`
- 新建：`src/offscreen/audio-capture.ts`
- 修改：`src/background/index.ts`
- 测试：`tests/shared/manifest.test.ts`

- [ ] **步骤 1：编写失败测试**

在 `tests/shared/manifest.test.ts` 增加：

```ts
it('exposes the offscreen audio capture document as an extension page', () => {
  expect(JSON.stringify(manifest.web_accessible_resources)).toContain(
    'src/offscreen/audio-capture.html',
  );
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- tests/shared/manifest.test.ts
```

预期：如果 Task 1 已加入 resource，则 PASS；否则 FAIL。PASS 时继续创建骨架文件。

- [ ] **步骤 3：编写最小实现**

新建 `src/offscreen/audio-capture.html`：

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>YouTube Audio Capture</title>
  </head>
  <body>
    <script type="module" src="./audio-capture.ts"></script>
  </body>
</html>
```

新建 `src/offscreen/audio-capture.ts`：

```ts
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
    } as MediaTrackConstraints,
    video: false,
  });

  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  recorder.start(5000);
}
```

在 `src/background/index.ts` 后续 wiring 中保留小函数：

```ts
async function ensureYoutubeAudioOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('src/offscreen/audio-capture.html');
  await chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['USER_MEDIA'],
    justification: 'Capture YouTube tab audio for ASR fallback after user starts translation.',
  });
}
```

- [ ] **步骤 4：运行测试，确认通过**

运行：

```bash
npm test -- tests/shared/manifest.test.ts
npm run build
```

预期：PASS，build 成功。

- [ ] **步骤 5：提交**

```bash
git add src/offscreen/audio-capture.html src/offscreen/audio-capture.ts src/background/index.ts tests/shared/manifest.test.ts
git commit -m "feat: add youtube audio offscreen capture skeleton"
```

### Task 8: 选项页 ASR 配置

**Files:**
- 修改：`src/options/App.tsx`
- 测试：`tests/options/app.test.tsx`

- [ ] **步骤 1：编写失败测试**

在 `tests/options/app.test.tsx` 增加：

```ts
it('saves youtube asr provider settings and experimental audio prefetch toggle', async () => {
  render(<App />);

  fireEvent.click(screen.getByLabelText('实验性 YouTube 音频预抓'));
  fireEvent.change(screen.getByLabelText('YouTube ASR Base URL'), {
    target: { value: 'https://api.example.com/v1' },
  });
  fireEvent.change(screen.getByLabelText('YouTube ASR API Key'), {
    target: { value: 'asr-key' },
  });
  fireEvent.change(screen.getByLabelText('YouTube ASR 模型'), {
    target: { value: 'whisper-1' },
  });
  fireEvent.click(screen.getByText('保存设置'));

  await waitFor(() => {
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubeExperimentalAudioPrefetchEnabled: true,
        youtubeAsrProvider: {
          providerId: 'openai-compatible',
          apiKey: 'asr-key',
          baseUrl: 'https://api.example.com/v1',
          model: 'whisper-1',
        },
      }),
    );
  });
});
```

- [ ] **步骤 2：运行测试，确认失败**

运行：

```bash
npm test -- tests/options/app.test.tsx
```

预期：FAIL，找不到新表单控件。

- [ ] **步骤 3：编写最小实现**

在 `src/options/App.tsx` 设置表单中增加四个控件：

```tsx
<label>
  <input
    checked={settings.youtubeExperimentalAudioPrefetchEnabled}
    onChange={(event) =>
      updateSettings({ youtubeExperimentalAudioPrefetchEnabled: event.target.checked })
    }
    type="checkbox"
  />
  实验性 YouTube 音频预抓
</label>

<label>
  YouTube ASR Base URL
  <input
    aria-label="YouTube ASR Base URL"
    value={settings.youtubeAsrProvider.baseUrl}
    onChange={(event) =>
      updateSettings({
        youtubeAsrProvider: { ...settings.youtubeAsrProvider, baseUrl: event.target.value },
      })
    }
  />
</label>

<label>
  YouTube ASR API Key
  <input
    aria-label="YouTube ASR API Key"
    type="password"
    value={settings.youtubeAsrProvider.apiKey}
    onChange={(event) =>
      updateSettings({
        youtubeAsrProvider: { ...settings.youtubeAsrProvider, apiKey: event.target.value },
      })
    }
  />
</label>

<label>
  YouTube ASR 模型
  <input
    aria-label="YouTube ASR 模型"
    value={settings.youtubeAsrProvider.model}
    onChange={(event) =>
      updateSettings({
        youtubeAsrProvider: { ...settings.youtubeAsrProvider, model: event.target.value },
      })
    }
  />
</label>
```

实际放置位置跟随现有 YouTube 设置区，不新增独立页面。

- [ ] **步骤 4：运行测试，确认通过**

运行：

```bash
npm test -- tests/options/app.test.tsx
```

预期：PASS。

- [ ] **步骤 5：提交**

```bash
git add src/options/App.tsx tests/options/app.test.tsx
git commit -m "feat: add youtube asr settings ui"
```

### Task 9: ASR 配置教程

**Files:**
- 新建：`docs/youtube-asr-setup.md`
- 修改：`README.md`

- [ ] **步骤 1：编写教程**

新建 `docs/youtube-asr-setup.md`，内容必须包含：

```md
# YouTube ASR 配置教程

## 什么时候需要 ASR

有 YouTube 字幕轨道的视频会直接使用字幕轨道预翻译，不需要 ASR。只有视频没有可用字幕轨道、字幕轨道为空，或者你开启实验性音频预抓时，才需要 ASR。

## 推荐配置

- Base URL: `https://api.openai.com/v1`
- Model: `whisper-1`
- API Key: 填写你的 ASR 服务密钥

## 配置步骤

1. 打开扩展选项页。
2. 找到 YouTube 字幕翻译设置。
3. 开启“实验性 YouTube 音频预抓”。
4. 填写 `YouTube ASR Base URL`。
5. 填写 `YouTube ASR API Key`。
6. 填写 `YouTube ASR 模型`。
7. 保存设置。
8. 打开一个无字幕 YouTube 视频，点击页面内“译”按钮验证。

## 常见错误

- 401: API Key 不正确或没有 ASR 权限。
- 404: Base URL 或模型名称不匹配。
- 模型不支持音频: 换成支持 audio transcription 的模型。
- 浏览器没有音频权限: 确认扩展已经启用 `tabCapture` 和 `offscreen` 权限。
- 有字幕视频没有调用 ASR: 这是正常行为，有字幕时优先走 timedtext。
```

在 `README.md` 增加一行链接：

```md
- YouTube ASR 配置：见 `docs/youtube-asr-setup.md`
```

- [ ] **步骤 2：检查文档**

运行：

```bash
rg -n "YouTube ASR|youtube-asr-setup" README.md docs/youtube-asr-setup.md
```

预期：能看到 README 链接和教程标题。

- [ ] **步骤 3：提交**

```bash
git add README.md docs/youtube-asr-setup.md
git commit -m "docs: add youtube asr setup guide"
```

### Task 10: 全量验证

**Files:**
- 不新增文件。

- [ ] **步骤 1：运行目标测试**

运行：

```bash
npm test -- tests/content/youtube/subtitle-source.test.ts tests/content/youtube/subtitle-overlay.test.ts tests/content/youtube/prefetch-queue.test.ts tests/content/youtube/audio-source.test.ts tests/background/youtube-asr.test.ts tests/background/messaging.test.ts tests/storage/settings.test.ts tests/options/app.test.tsx tests/shared/manifest.test.ts
```

预期：PASS。

- [ ] **步骤 2：运行完整单元测试**

运行：

```bash
npm test
```

预期：PASS。

- [ ] **步骤 3：构建扩展**

运行：

```bash
npm run build
```

预期：PASS，无 TypeScript 或 Vite 构建错误。

- [ ] **步骤 4：记录手动验证结果**

在最终汇报中记录：

```text
有字幕视频：已验证首批预翻译窗口。
无字幕视频：已验证 ASR 配置缺失时给出清晰提示。
实验音频预抓：已验证 direct URL 解析成功或 signatureCipher 降级。
```

如果无法完成真实 YouTube 手动验证，明确说明未验证原因。

## 自检

- Spec 覆盖：A 路径由 Task 2-3 覆盖；B direct audio path 由 Task 4 覆盖；ASR provider 由 Task 5 覆盖；fallback 骨架由 Task 7 覆盖；设置和教程由 Task 1、8、9 覆盖。
- 占位符扫描：计划不包含未定内容或延后补充类描述。
- 类型一致性：ASR 配置统一使用 `youtubeAsrProvider` 和 `YoutubeAsrProviderSettings`；音频块统一使用 `YoutubeAudioChunk`；cue 统一复用 `YoutubeSubtitleCue`。
