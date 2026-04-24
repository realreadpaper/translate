# PDF 文档与 YouTube 字幕翻译设计文档

**日期：** 2026-04-25

**状态：** 已在对话中确认范围，等待文件级评审

## 1. 概述

在现有“整页网页翻译”能力基础上，扩展新增两类翻译目标：

- 独立 PDF 文档翻译
- YouTube 视频字幕翻译

本次扩展继续保持本地优先、用户自行配置模型与服务的原则，并尽量复用现有的 content script、background provider 调度、批量翻译与显示模式切换能力。

新增能力采用“文本优先，缺失时降级兜底”的策略：

- PDF 优先使用文本层解析；文本层缺失或质量明显不足时，再按页触发 OCR。
- YouTube 优先使用现成字幕轨道；没有可用字幕时，再由用户显式确认后启动语音识别生成字幕。

## 2. 范围与非目标

### 2.1 纳入范围

- 当前标签页为独立 PDF 文档时，支持整份 PDF 翻译
- 当前页面为 `youtube.com/watch` 时，支持视频字幕翻译
- 继续复用现有三种显示模式：
  - 双语
  - 仅原文
  - 仅译文
- 复用现有 provider 配置、批量翻译和错误处理能力
- PDF 文本提取失败时，支持页级 OCR 兜底
- YouTube 无字幕时，支持显式确认后的 ASR 兜底

### 2.2 明确排除

- 普通网页中的 PDF 片段、PDF 预览卡片、嵌入式 PDF iframe
- 任意网页中的视频字幕通用支持
- B 站与其他视频站点的首版支持
- 默认静默执行 OCR 或 ASR
- 本地离线 OCR 模型与本地离线语音识别模型
- PDF 原文与译文的字形级覆盖排版

## 3. 核心边界

### 3.1 PDF 翻译边界

PDF 翻译仅指“当前标签页本身是独立 PDF 文档”的场景，不包括：

- 网页正文中嵌入的 PDF 小组件
- 文档站中的附件预览区
- HTML 页面中的 PDF iframe
- 截图式、卡片式、片段式 PDF 展示

系统在识别目标时必须优先避免误判。若无法确认当前 tab 为独立 PDF 文档，应回退为普通网页，而不是进入 PDF 翻译链路。

### 3.2 PDF 展示边界

独立 PDF 标签页触发翻译后，不在原标签页内直接覆盖渲染译文，而是打开新的扩展 PDF 翻译页，作为整份文档的翻译工作台。

### 3.3 YouTube 边界

YouTube 首版仅支持标准 `watch` 页面的视频字幕翻译，且优先基于完整字幕轨道而不是仅基于当前时刻屏幕上可见的一行字幕文本。

## 4. 产品目标

### 4.1 PDF 目标

- 让用户能对整份 PDF 文档执行稳定、连续的页级翻译
- 让双语阅读模式在 PDF 中保持可用，而不是仅给出零散文本结果
- 避免因原生 PDF 查看器限制导致的注入不稳定问题
- 将 OCR 作为页级兜底，而不是默认重型路径

### 4.2 YouTube 目标

- 让用户在当前视频播放上下文中直接阅读双语字幕
- 支持暂停、拖动、倍速、回看等时间轴行为
- 避免因只抓取当前可见字幕而导致显示不稳定或重复请求
- 在无字幕时提供明确、可控的识别入口

## 5. 用户场景

### 5.1 独立 PDF 文档翻译

用户打开一个独立 PDF 标签页，点击扩展按钮后，扩展识别当前目标为 PDF 文档，并打开新的扩展 PDF 翻译页。用户在该页中查看整份文档的双语、仅原文或仅译文结果。

### 5.2 带文本层 PDF

系统优先使用文本层提取页内文本块，保留页面顺序与位置映射，再调用现有翻译能力生成译文页。

### 5.3 扫描版 PDF

当某一页几乎没有可用文本层时，系统提示该页需要 OCR 兜底。用户确认后，仅对该页执行 OCR，再进入翻译链路。

### 5.4 YouTube 有字幕视频

用户在 YouTube 视频页点击悬浮球，系统读取完整字幕轨道、批量翻译 cue，并在播放器上方渲染双语字幕层。

### 5.5 YouTube 无字幕视频

若检测到当前视频没有可用字幕轨道，系统不自动启动识别，而是提示用户是否启用语音识别生成字幕。用户确认后再开始 ASR。

## 6. 体验要求

### 6.1 入口一致性

- YouTube 继续复用当前页面内的悬浮球触发翻译
- 独立 PDF 通过扩展按钮触发翻译，并跳转到新的扩展 PDF 翻译页

### 6.2 显示模式一致性

新增能力必须延续现有三种显示模式：

- 双语
- 仅原文
- 仅译文

模式切换不应重新发起翻译请求。

### 6.3 用户控制权

- OCR 与 ASR 只在缺失场景中启用
- 首版必须采用“显式确认后再执行”的策略
- 局部失败应优先于整页或整视频失败

## 7. 总体架构

### 7.1 架构方向

现有系统主链路为：

- content script 提取 segment
- background 按 provider 分批翻译
- content script 渲染结果

本次扩展不建议在现有网页正文翻译逻辑中继续累加特判，而是升级为统一的翻译任务架构，通过目标检测与适配器切换不同的采集与渲染方式。

### 7.2 统一翻译目标

建议新增统一目标模型：

- `html-page`
- `youtube-subtitles`
- `pdf-document`

### 7.3 统一任务链路

统一后的链路为：

1. 入口发起翻译任务
2. background 检测当前 tab 的翻译目标类型
3. 针对目标类型调用对应 collector
4. 将 collector 返回的 segment 按现有 provider 流程分批翻译
5. 将翻译结果交给对应 renderer 落地

这样可以复用现有 provider 调度和批处理逻辑，同时避免将 YouTube 与 PDF 特有逻辑混入普通网页 DOM 提取模块。

## 8. 目标检测设计

### 8.1 `html-page`

当前标签页为普通网页，且不满足 YouTube 或独立 PDF 条件时，走现有整页正文翻译逻辑。

### 8.2 `youtube-subtitles`

当前页面为 `youtube.com/watch`，且页面中存在可用视频元素时，进入 YouTube 字幕翻译链路。

### 8.3 `pdf-document`

仅在能确认当前 tab 为独立 PDF 文档时进入 PDF 链路。判定信号可包括：

- 顶层 URL 明确指向 PDF 资源
- 响应 MIME 可判定为 `application/pdf`
- 当前标签页上下文可确定不是普通 HTML 页面中的嵌入片段

若信号不足，则不得进入 PDF 专属链路。

## 9. 消息协议设计

建议将现有“翻译当前页面”内部实现升级为“翻译任务”，但可保留外部文案不变。

### 9.1 建议新增的任务消息

- `START_TRANSLATION_JOB`
- `DETECT_TRANSLATION_TARGET`
- `COLLECT_TRANSLATION_SEGMENTS`
- `APPLY_TRANSLATION_RESULT`
- `OPEN_PDF_TRANSLATION_WORKSPACE`

### 9.2 兼容现有能力

现有网页翻译可以先挂接为 `html-page` 目标的一个默认适配器，逐步迁移，而无需在第一步重写 provider 层。

## 10. 共享数据模型

### 10.1 统一 Segment 模型

建议将当前 `id + text` 扩展为带定位锚点的统一结构：

- `id`
- `text`
- `anchor`

### 10.2 Anchor 类型

- `dom`
  - 用于普通网页正文
- `subtitle-cue`
  - 用于 YouTube
  - 包含 `startMs`、`endMs`、`videoId`
- `pdf-block`
  - 用于 PDF
  - 包含 `pageNumber`、`rect`、`readingOrder`

### 10.3 定位意义

统一 anchor 设计可以让 background 专注于翻译文本，而 renderer 依据不同 target 自行处理时间轴同步、页级映射和 DOM 插入。

## 11. PDF 翻译设计

### 11.1 入口流程

独立 PDF 标签页触发翻译时：

1. background 识别当前 tab 为 `pdf-document`
2. background 创建 `pdf job`
3. 打开新的扩展 PDF 翻译页
4. 扩展页加载 job 元数据与源 PDF
5. 扩展页完成页面解析、翻译和渲染

### 11.2 PDF 工作台形态

PDF 翻译页建议采用稳定的文档工作台布局：

- 顶部工具栏
- 左侧原始 PDF 页
- 右侧译文页
- 页内联动高亮

### 11.3 三种模式落地

- 双语：左原 PDF，右译文页
- 仅原文：只显示左侧 PDF
- 仅译文：只显示右侧译文页

### 11.4 解析策略

PDF 首选文本层解析：

- 获取整份 PDF 字节流
- 使用 `pdf.js` 解析页面
- 提取页内文本项
- 合并为阅读顺序稳定的文本块
- 生成 `pdf-block segment`

### 11.5 OCR 兜底策略

OCR 不做整份文档默认路径，仅在单页文本层明显不足时触发。判定信号可包括：

- 提取文本字符数过少
- 页面图像占比高但文本近乎为空
- 提取结果大量乱码或不可读

OCR 执行单位应为“单页”，而不是整份文档。

### 11.6 PDF 错误反馈

PDF 工作台需要同时支持：

- 文档级错误
- 页级错误
- OCR 兜底提示

用户需要明确知道是整份文档不可读，还是某一页需要 OCR，还是某一页翻译失败。

## 12. YouTube 字幕翻译设计

### 12.1 入口流程

YouTube 页面继续复用悬浮球。点击后：

1. 检测当前是否为可翻译视频页
2. 尝试读取完整字幕轨道
3. 将 cue 文本分批送入现有 provider 翻译
4. 在播放器区域挂载自定义字幕 overlay

### 12.2 字幕数据源原则

YouTube 字幕翻译必须优先基于完整 cue 列表，而不是仅基于当前屏幕上显示的字幕 DOM 片段。

这样才能稳定支持：

- 暂停
- 拖动
- 回看
- 倍速播放
- 页面内缓存复用

### 12.3 字幕数据模型

建议新增：

- `SubtitleCue`
  - `id`
  - `startMs`
  - `endMs`
  - `text`
- `TranslatedSubtitleCue`
  - `id`
  - `translatedText`

### 12.4 字幕渲染策略

在播放器区域挂载自定义 overlay，并监听：

- `timeupdate`
- `seeking`
- `seeked`
- `ratechange`
- `play`
- `pause`

根据当前 `currentTime` 命中 cue，渲染对应字幕内容。

### 12.5 三种模式落地

- 双语：原字幕 + 译文双层显示
- 仅原文：只显示原字幕
- 仅译文：只显示译文层

### 12.6 无字幕兜底

当 YouTube 页面没有可用字幕时，不自动启动语音识别。系统应明确提示用户：

- 当前视频没有现成字幕
- 是否启用语音识别生成字幕

用户确认后，才进入 ASR 路径。

### 12.7 ASR 兜底策略

ASR 路径建议采用：

- `chrome.tabCapture` 采集当前 tab 音频
- `offscreen document` 处理音频与切片
- 识别服务返回带时间轴的 cue
- 后续翻译与渲染复用标准字幕链路

ASR 的职责仅是“生成 cue”，而不是单独维护另一套渲染系统。

## 13. 缓存设计

### 13.1 目标

- 减少重复翻译请求
- 让模式切换不重新请求模型
- 提升同一资源重复访问时的响应速度

### 13.2 分层缓存

- `session cache`
  - 当前页面或当前工作台生命周期内缓存
- `persistent cache`
  - `chrome.storage.local` 持久缓存

### 13.3 缓存 Key 建议

- 普通网页：
  - `url + provider + model + targetLanguage + contentHash`
- YouTube：
  - `videoId + subtitleTrack + provider + model + targetLanguage`
- PDF：
  - `pdfFingerprint + provider + model + targetLanguage + pageRange`

PDF 缓存应按页或页段切分，不建议整份文档作为单一大对象存储。

## 14. 设置项设计

首版仅增加必要配置：

- `enableYoutubeSubtitleTranslation`
- `enablePdfDocumentTranslation`
- `pdfOcrFallback`
- `youtubeAsrFallback`
- `subtitleDisplayStyle`
- `translationCacheEnabled`

其中 `pdfOcrFallback` 与 `youtubeAsrFallback` 的默认行为应是“允许兜底，但执行前确认”。

## 15. 错误处理设计

建议统一分为四类：

### 15.1 配置错误

- API Key 缺失
- Base URL 无效
- 模型不可用

### 15.2 源数据错误

- PDF 无法获取
- 本地 PDF 文件无访问权限
- YouTube 字幕不可读取

### 15.3 兜底错误

- OCR 调用失败
- ASR 启动失败
- OCR / ASR 超时

### 15.4 局部失败

- 某一页 PDF 翻译失败
- 某一批字幕翻译失败

局部失败不应直接中断整个文档或整个视频的翻译流程。

## 16. 建议代码边界

### 16.1 Background

- `src/background/targets/detect-target.ts`
- `src/background/targets/html-page.ts`
- `src/background/targets/youtube-subtitles.ts`
- `src/background/targets/pdf-document.ts`
- `src/background/pdf/job-store.ts`
- `src/background/pdf/fetch-source.ts`
- `src/background/pdf/parse-document.ts`
- `src/background/pdf/ocr-fallback.ts`
- `src/background/media/asr-session.ts`

### 16.2 Content

- `src/content/youtube/detect-target.ts`
- `src/content/youtube/subtitle-source.ts`
- `src/content/youtube/subtitle-overlay.ts`
- `src/content/youtube/subtitle-timeline.ts`

### 16.3 PDF Workspace

- `src/pdf-viewer/index.html`
- `src/pdf-viewer/App.tsx`
- `src/pdf-viewer/page-canvas.tsx`
- `src/pdf-viewer/translated-page.tsx`

### 16.4 Shared

- `src/shared/translation-target.ts`
- `src/shared/messages.ts`
- `src/shared/types.ts`

### 16.5 Offscreen

- `src/offscreen/index.html`
- `src/offscreen/index.ts`

## 17. 权限与平台约束

### 17.1 浏览器扩展约束

需要为后续实现评估并补充：

- `offscreen`
- `tabCapture`

### 17.2 本地 PDF 访问

若用户打开的是本地 `file://` PDF，通常需要扩展启用文件 URL 访问权限。产品界面需要提供明确提示，而不是让用户误以为功能失效。

### 17.3 原生 PDF 查看器限制

浏览器原生 PDF 查看器可能并不适合作为稳定的渲染宿主，因此首版不依赖在原标签页内部直接覆盖渲染 PDF 译文，而是采用扩展 PDF 工作台。

## 18. 实施分期建议

### 18.1 第一阶段：统一任务骨架

- 抽象翻译目标与目标检测
- 将现有网页翻译迁移到统一 target adapter 架构
- 保证现有网页能力无回归

### 18.2 第二阶段：YouTube 已有字幕

- 支持完整 cue 抓取
- 支持字幕翻译缓存
- 支持播放器 overlay 与三种模式

### 18.3 第三阶段：PDF 工作台

- 新建扩展 PDF 翻译页
- 接入 `pdf.js`
- 支持文本层解析与页级双栏显示

### 18.4 第四阶段：PDF OCR 兜底

- 增加页级 OCR 判定
- 增加 OCR 提示与确认路径

### 18.5 第五阶段：YouTube ASR 兜底

- 增加 tabCapture 与 offscreen
- 增加无字幕显式确认路径
- 将 ASR 结果接入标准字幕翻译链路

## 19. 测试策略

### 19.1 单元测试

- 目标检测
- cue 时间轴命中
- PDF 文本块合并
- 缓存 key 生成
- OCR / ASR 兜底判定

### 19.2 集成测试

- background 任务分发
- collector 与 renderer 派发
- provider 调用与错误归一化

### 19.3 E2E 测试

- 普通网页正文翻译
- YouTube 有字幕视频
- 独立 PDF 且带文本层
- 独立 PDF 触发 OCR 提示
- YouTube 无字幕触发 ASR 提示

## 20. 成功标准

- 用户能在独立 PDF 标签页上发起整份文档翻译，并在扩展工作台中稳定阅读结果
- 用户能在 YouTube 视频页中直接阅读双语、仅原文、仅译文字幕
- 模式切换不重新请求翻译
- OCR 与 ASR 仅在缺失场景中显式触发
- 网页中的 PDF 片段不会被误识别为独立 PDF 翻译目标

