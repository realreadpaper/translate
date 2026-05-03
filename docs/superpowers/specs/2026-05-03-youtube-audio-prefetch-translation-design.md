# YouTube 音频预抓与字幕预翻译设计文档

## 1. 背景

当前 YouTube 字幕翻译已经支持读取已有字幕轨道、渲染播放器 overlay，并在播放过程中前瞻翻译后续字幕。用户反馈的主要问题是延迟仍然明显：字幕经常要等播放到附近才开始翻译，或者无字幕视频只能依赖播放时可见字幕/未来 ASR 兜底。

本次目标是换成后台提前处理思路：不要等播放过程再翻译。系统需要同时支持两条路径：

- A 稳定路径：有字幕轨道时，后台抓取完整 timedtext 字幕轨道并提前翻译。
- B 实验路径：没有可用字幕轨道时，尝试后台解析并抓取 YouTube 音频分片，提前 ASR，再翻译。

B 路径必须独立、可降级，不能影响 A 路径的稳定性。

## 2. 目标

- 有 YouTube 字幕轨道的视频，优先使用字幕轨道，不抓音频。
- 首次启动字幕翻译后，立即翻译当前播放点之后的 3 到 5 分钟字幕。
- 后台继续低优先级翻译完整字幕轨道，尽量让播放过程只负责显示。
- 无字幕轨道或轨道抓取失败时，进入音频 ASR 路径。
- 音频路径先尝试解析 YouTube 音频媒体信息并后台抓取音频分片。
- 音频解析/抓取失败时，降级到 `tabCapture` + `offscreen` 的实时音频采集。
- ASR 生成的 cue 与原字幕轨道 cue 复用同一套翻译队列和 overlay。
- 开发完成后提供 ASR provider 配置教程。

## 3. 非目标

- 不承诺稳定破解 YouTube 所有音频 URL、签名或播放器内部实现。
- 不让 B 路径阻塞有字幕视频的翻译体验。
- 不在首版实现复杂音频降噪、说话人分离或逐词时间戳。
- 不把 ASR 密钥硬编码到 release build。
- 不自动绕过浏览器权限提示或用户手势限制。

## 4. 总体架构

整体链路分成 source、queue、translation、overlay 四层。

```text
YouTube watch 页面
  -> A: timedtext caption track
      -> YoutubeSubtitleCue[]
      -> youtube-prefetch-queue
      -> START_TRANSLATION_JOB
      -> subtitle overlay

  -> B: experimental audio source
      -> AudioChunk[]
      -> youtube-asr
      -> YoutubeSubtitleCue[]
      -> youtube-prefetch-queue
      -> START_TRANSLATION_JOB
      -> subtitle overlay

  -> fallback: tabCapture + offscreen
      -> AudioChunk[]
      -> youtube-asr
      -> YoutubeSubtitleCue[]
      -> youtube-prefetch-queue
      -> START_TRANSLATION_JOB
      -> subtitle overlay
```

`subtitle-overlay` 不关心 cue 来源。只要拿到 `{ id, text, startMs, endMs }` 和 `{ id, translatedText }`，就可以按视频当前时间渲染。

## 5. A 稳定路径：字幕轨道预翻译

`src/content/youtube/subtitle-source.ts` 继续负责读取 `ytInitialPlayerResponse`、当前 watch HTML fallback、timedtext 格式变体和 XML/json3/VTT 解析。

需要调整首批选择策略：

- 当前实现首批偏向当前 cue 或单个最近 cue。
- 新策略是从当前播放点开始选择一个预翻译窗口。
- 默认窗口为 3 分钟，可配置为 5 分钟上限。
- 如果当前播放点无法定位，使用字幕轨道开头窗口。

`subtitle-source` 缓存完整 `YoutubeSubtitleCue[]` 后，把窗口 cue 交给统一队列。队列按三档处理：

- `urgent`：当前 cue 和 30 秒内即将播放的 cue，最高优先级，小批量快速返回。
- `prefetch`：当前点之后 3 到 5 分钟窗口，普通优先级，分批翻译。
- `background`：剩余完整轨道，低优先级，空闲时继续补齐。

队列需要按 cue id 和标准化源文本去重。重复文本可以复用已有译文，避免同一句字幕重复请求 provider。

## 6. B 实验路径：YouTube 音频预抓 ASR

B 路径只在 A 不可用时启动，包括：

- 没有 caption tracks。
- 所有 timedtext 变体为空。
- timedtext 请求失败且没有可用渲染字幕。

新增 `src/content/youtube/audio-source.ts` 或同等模块，用来从页面状态中解析音频候选：

- 从 `ytInitialPlayerResponse.streamingData.adaptiveFormats` 读取 audio-only format。
- 优先选择 MIME 为 `audio/webm` 或 `audio/mp4` 的低码率音轨。
- 如果存在可直接请求的 `url`，按 range 或完整 URL 获取音频片段。
- 如果只有 `signatureCipher` 或加密签名，首版记录失败原因并降级，不尝试实现播放器签名解密。

音频下载以小块形式输出 `AudioChunk`：

```ts
type AudioChunk = {
  id: string;
  source: 'youtube-adaptive-format' | 'tab-capture';
  startMs: number;
  endMs: number;
  mimeType: string;
  data: Blob;
};
```

新增 `src/background/youtube-asr.ts` 或同等模块负责 ASR provider 调度：

- 输入 `AudioChunk[]`。
- 输出 `YoutubeSubtitleCue[]`。
- cue id 使用 `asr-cue-${chunkIndex}-${cueIndex}`，避免和 timedtext 的 `cue-*` 冲突。
- ASR 返回缺少精确时间戳时，用 chunk 时间范围生成粗略 cue。

首版 ASR provider 接口先支持 OpenAI-compatible 风格配置：

```ts
type AsrProviderSettings = {
  providerId: 'openai-compatible';
  apiKey: string;
  baseUrl: string;
  model: string;
};
```

具体请求格式在实现时隔离到 provider adapter 中，避免把 ASR 与翻译 provider 强耦合。

## 7. 实时 fallback：tabCapture + offscreen

当 B 无法从 YouTube 页面解析可用音频 URL 时，系统降级到浏览器官方扩展能力：

- background 请求 `chrome.tabCapture` stream id 或直接 capture。
- 创建 offscreen document 处理音频流。
- offscreen document 用 `MediaRecorder` 或 Web Audio 分段生成音频块。
- 音频块发送给 background ASR 模块。
- ASR cue 进入同一套翻译队列。

该 fallback 需要用户触发翻译后运行，不能保证播放前拿到未来音频。它的定位是“无字幕视频仍可用”，不是替代 A 路径的低延迟方案。

## 8. 消息与状态

扩展现有 runtime message，保持旧路径兼容：

- `COLLECT_YOUTUBE_SUBTITLE_SEGMENTS` 继续用于 A 路径首批采集。
- 新增 `START_YOUTUBE_PREFETCH_TRANSLATION` 或等价内部调度，用于启动完整轨道预翻译。
- 新增 `START_YOUTUBE_AUDIO_ASR`，用于启动 B 或 fallback。
- 新增 `APPLY_YOUTUBE_ASR_CUES`，把 ASR cue 缓存到 content overlay。

YouTube 翻译状态建议包含：

```ts
type YoutubePrefetchState = {
  videoId: string;
  source: 'caption-track' | 'youtube-audio' | 'tab-capture';
  status: 'idle' | 'collecting' | 'transcribing' | 'translating' | 'ready' | 'partial-success' | 'failed';
  translatedCueIds: Set<string>;
  pendingCueIds: Set<string>;
  failedReasons: string[];
};
```

## 9. 错误处理

- A 成功：不启动 B。
- A 没有字幕：启动 B。
- A 请求失败：记录错误，启动 B。
- B 解析不到可用 audio URL：降级到 tabCapture fallback。
- B 音频请求失败：降级到 tabCapture fallback。
- ASR provider 未配置：提示用户配置 ASR，overlay 保持原始字幕或显示明确错误状态。
- 翻译 provider 失败：保留原文 cue，后续滚动/播放时允许重试。
- 所有失败都写 debug log，包括 `videoId`、source、失败阶段和降级路径。

## 10. 设置与权限

需要新增或扩展设置：

- `youtubeSubtitlePrefetchEnabled`: 默认开启。
- `youtubeSubtitlePrefetchWindowSeconds`: 默认 180，最大 300。
- `youtubeExperimentalAudioPrefetchEnabled`: 默认关闭或实验标记开启。
- `youtubeAsrProvider`: ASR provider 配置。

可能需要新增权限：

- `tabCapture`：用于实时音频 fallback。
- `offscreen`：用于 MV3 service worker 外的音频处理。

实验音频预抓仍然使用现有 host permissions。权限变更需要在选项页和教程中解释。

## 11. 测试计划

单元测试：

- 有完整 timedtext 时，首批返回当前播放点之后 3 分钟窗口，而不是单个 cue。
- 队列按 `urgent`、`prefetch`、`background` 顺序发起翻译。
- 已翻译 cue 和重复文本不会重复请求。
- 无字幕时启动 B 路径。
- B 解析到 direct audio URL 时生成 `AudioChunk`。
- B 遇到 `signatureCipher` 时明确失败并降级。
- ASR cue 能进入 overlay 并按视频时间显示。
- B/fallback 生成的 `asr-cue-*` 不与 timedtext cue 冲突。

集成测试：

- background 在 A 成功时不调用音频路径。
- A 失败时调用 B，B 失败时调用 tabCapture fallback。
- provider 未配置 ASR 时返回可读错误。
- YouTube overlay 能接受增量翻译结果并立即补显。

手动验证：

- 有英文字幕视频：点击翻译后，暂停或快进到 2 分钟后仍能看到已准备好的译文。
- 长视频：前 3 到 5 分钟优先翻译，后续字幕逐步补齐。
- 无字幕视频：开启实验音频预抓，观察失败降级和 ASR 提示。
- 禁用 ASR 配置：无字幕视频给出明确配置指引。

## 12. ASR 配置教程交付

开发完成后，需要提供一份面向用户的详细教程，至少包含：

- 为什么有字幕视频不需要 ASR。
- 什么时候需要 ASR。
- 需要开启哪些扩展权限。
- 如何填写 ASR provider 的 `baseUrl`、`apiKey`、`model`。
- OpenAI-compatible ASR 服务的示例配置。
- 常见错误排查：401、404、模型不支持音频、CORS/网络失败、浏览器未授权音频采集。
- 如何验证 ASR 是否生效：打开无字幕 YouTube 视频、点击翻译、查看 overlay 和 debug log。

## 13. 实施顺序

第一阶段先完成 A：

1. 扩大字幕轨道首批预翻译窗口。
2. 引入 YouTube cue 预翻译队列和去重。
3. 后台补全完整轨道。

第二阶段完成 B 的实验 direct audio path：

1. 解析 `adaptiveFormats` audio-only format。
2. 支持 direct `url` 音频块下载。
3. 遇到 `signatureCipher` 明确降级。

第三阶段完成 fallback 和 ASR provider：

1. 增加 ASR provider 配置。
2. 增加 tabCapture/offscreen 实时音频采集。
3. ASR cue 进入统一队列。

第四阶段完善教程和手动验证记录。
