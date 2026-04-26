# Immersive AI Translate 项目说明

## 项目定位

Immersive AI Translate 是一个面向 Chrome / Edge 的浏览器扩展，用于在网页内进行沉浸式翻译。项目当前聚焦网页正文翻译：通过悬浮球或 popup 触发翻译，保留原页面结构，并支持双语、仅原文、仅译文三种阅读模式。

项目设计重点是：

- 不破坏原网页 DOM 结构，译文以相邻块插入。
- 优先翻译用户当前可见区域，随着滚动继续翻译后续内容。
- 通过小批量请求降低等待时间和模型输出异常概率。
- 支持多个翻译 provider，并把 API Key 等配置保存在浏览器本地存储。

## 当前功能

### 网页翻译

- 提取常见正文节点：`h1`、`h2`、`h3`、`p`、`li`、`blockquote`。
- 支持 X / Twitter 帖子正文：`[data-testid="tweetText"]`。
- 支持 Reddit 帖子和评论正文：
  - `shreddit-post [slot="title"]`
  - `shreddit-post [slot="text-body"]`
  - `shreddit-comment [slot="comment"]`
  - `[data-testid="post-title"]`
  - `[data-testid="post-content"]`
  - `[data-testid="comment"]`
- 自动跳过脚本、样式、代码块、输入框等不适合翻译的内容。
- 给每个待翻译节点写入稳定的 `data-segment-id`，确保译文回填到正确位置。

### 悬浮球渐进式翻译

悬浮球是当前主要网页翻译入口。

- 点击悬浮球后，优先翻译当前视口附近内容。
- 单次最多发送 6 段，避免一次请求过大。
- 用户向下滚动时，会继续翻译新进入视口附近、且尚未翻译过的段落。
- 已翻译和正在翻译的段落会去重，不重复请求。
- 如果当前页面无法筛出可见段落，会回退到旧的整页网页翻译消息，保证点击不空转。

### Popup 控制台

Popup 提供手动翻译和显示模式控制：

- 手动执行本页翻译。
- 切换显示模式：双语、仅原文、仅译文。
- 开启或关闭进入页面后的自动翻译。
- 展示当前 provider 和目标语言。

### Options 设置页

Options 页面用于配置翻译参数：

- 翻译 provider。
- 源语言和目标语言。
- DeepSeek / OpenAI-compatible / Traditional provider 的配置。
- API Key、Base URL、模型等字段。

### Provider 支持

当前 provider 架构支持：

- `deepseek`
- `openai-compatible`
- `traditional`

DeepSeek 和 OpenAI-compatible 均走 Chat Completions 风格接口。项目会向模型发送 JSON 段落数组，并要求返回 `[{ id, translatedText }]` 结构。

为了提高稳定性，项目会兼容几种常见返回格式：

- 纯 JSON 数组。
- Markdown `json` 代码块包裹的 JSON。
- `{ "segments": [...] }`
- `{ "translations": [...] }`

如果 provider 返回异常结构，翻译批处理会把该批记录为失败，而不是让整页翻译崩溃。

### 显示模式

译文通过 `data-translation-for` 插入到原文节点之后。

- 双语：原文和译文同时显示。
- 仅原文：隐藏译文。
- 仅译文：隐藏原文。

切换显示模式时会保留原节点的原始 `display` 状态，尽量避免破坏页面原有布局。

### 调试日志

项目在 content script 和 background service worker 中加入了调试日志，统一前缀：

```text
[Immersive AI Translate]
```

可观察的关键日志包括：

- content 初始化。
- 悬浮球开始翻译及本批段落数量。
- content 收集到的段落数量。
- background 收到的消息类型。
- background 识别到的翻译目标。
- html-page 翻译完成数量和失败批次数。

## 暂未完成或规划中的能力

项目中已经引入翻译目标模型：

- `html-page`
- `youtube-subtitles`
- `pdf-document`

当前稳定可用的是 `html-page` 网页翻译。PDF 和 YouTube 字幕翻译仍属于后续规划或实验方向，悬浮球暂时不会触发 PDF / YouTube 翻译逻辑。

相关规划文档位于：

- `docs/superpowers/plans/2026-04-25-pdf-youtube-translation.md`

## 技术栈

### 核心技术

- TypeScript
- React 19
- Vite
- `@crxjs/vite-plugin`
- Chrome Extension Manifest V3

### 浏览器扩展能力

- Content Script：注入网页，挂载悬浮球，提取正文，回填译文。
- Background Service Worker：接收 runtime 消息，执行目标识别、provider 调用、结果分发。
- Popup：提供快捷操作面板。
- Options：提供持久化配置页面。
- Chrome Storage Local：保存扩展设置。

### 测试技术

- Vitest：单元测试。
- jsdom：content script、DOM 提取、渲染逻辑测试。
- React Testing Library：popup 和 options 组件测试。
- Playwright：扩展 E2E 和联机冒烟测试。

## 目录结构

```text
src/
  background/
    index.ts                         # background service worker 入口
    messaging.ts                     # runtime 消息编排
    providers/                       # 翻译 provider 适配层
    targets/                         # 翻译目标检测
    translator/                      # 批量翻译和配置
  content/
    index.ts                         # content script 入口
    floating-ball.ts                 # 悬浮球和渐进式翻译调度
    dom-extractor.ts                 # 正文提取和 DOM segment 标记
    segment-renderer.ts              # 译文回填和显示模式切换
  popup/
    App.tsx                          # popup UI
  options/
    App.tsx                          # options UI
  shared/
    messages.ts                      # runtime message 类型
    translation-target.ts            # 翻译目标类型
    types.ts                         # 设置和 provider 类型
    config.ts                        # 默认设置
  storage/
    settings.ts                      # 设置读写和兼容迁移
tests/
  background/
  content/
  popup/
  options/
  shared/
  storage/
  e2e/
```

## 网页翻译数据流

### 悬浮球渐进式翻译

1. Content script 挂载悬浮球。
2. 用户点击悬浮球。
3. `dom-extractor` 提取当前页面段落，并给真实 DOM 节点写入 `data-segment-id`。
4. 悬浮球筛选当前视口附近且未翻译过的段落。
5. Content script 发送 `START_PAGE_TRANSLATION`，并携带本批 `segments`。
6. Background 强制将该请求作为 `html-page` 处理。
7. Provider 翻译本批段落。
8. Background 发送 `APPLY_TRANSLATION_RESULT` 回 content script。
9. Content script 将译文插入到对应 `data-segment-id` 节点之后。
10. 用户继续滚动时，悬浮球继续翻译新进入视口附近的段落。

### Popup 全页翻译

1. Popup 发送 `START_PAGE_TRANSLATION`，通常不携带 `segments`。
2. Background 请求 content script 执行 `COLLECT_PAGE_SEGMENTS`。
3. Content script 提取整页段落。
4. Background 分批翻译并应用结果。

## 消息协议

主要 runtime message：

- `START_PAGE_TRANSLATION`
  - 网页翻译入口。
  - 可选携带 `segments`，用于悬浮球渐进式翻译。
- `COLLECT_PAGE_SEGMENTS`
  - background 请求 content script 提取页面段落。
- `APPLY_TRANSLATION_RESULT`
  - background 将译文结果发回 content script。
- `SET_DISPLAY_MODE`
  - 切换双语、仅原文、仅译文。
- `TEST_PROVIDER_CONNECTION`
  - 测试 provider 配置是否可用。
- `START_TRANSLATION_JOB`
  - 面向未来多目标翻译的统一入口，目前悬浮球不使用它。

## 本地开发

安装依赖：

```bash
npm install
```

运行单元测试：

```bash
HOST=127.0.0.1 npm test
```

构建扩展：

```bash
npm run build
```

构建产物位于：

```text
dist/
```

## 浏览器装载

1. 运行 `npm run build`。
2. 打开 Chrome 或 Edge 的扩展管理页。
3. 开启开发者模式。
4. 选择“加载已解压的扩展程序”。
5. 选择仓库下的 `dist/` 目录。
6. 修改代码后需要重新构建并在扩展管理页点击刷新。

## 环境配置

可以在 `.env.local` 中提供默认 DeepSeek 配置：

```bash
VITE_DEFAULT_PROVIDER_ID=deepseek
VITE_DEFAULT_DEEPSEEK_API_KEY=你的 DeepSeek Key
VITE_DEFAULT_DEEPSEEK_MODEL=deepseek-v4-flash
```

说明：

- `.env.local` 不提交到 Git。
- 首次启动时默认配置会写入 Chrome 本地存储。
- 后续可以在扩展 Options 页面修改配置。

## 常用命令

```bash
npm install
HOST=127.0.0.1 npm test
npm run build
npm run package:release
HOST=127.0.0.1 npm run test:e2e -- tests/e2e/page-translation.spec.ts
```

真实 DeepSeek 冒烟测试：

```bash
PLAYWRIGHT_DEEPSEEK_SMOKE=1 \
PLAYWRIGHT_DEEPSEEK_SMOKE_URL="https://example.com/article" \
HOST=127.0.0.1 \
npm run test:e2e:deepseek-smoke
```

## 验证策略

当前测试覆盖：

- 默认配置和设置持久化。
- provider 注册、连接测试、翻译结果解析。
- 翻译批处理容错。
- 网页正文提取，包括普通网页、X / Twitter、Reddit。
- 译文回填和显示模式切换。
- 悬浮球点击、错误状态、部分成功、视口优先与滚动续翻。
- popup 和 options 交互。
- Manifest 和 E2E smoke 配置。

## 设计约束

- `dist/` 是构建产物，已加入 `.gitignore`，不提交。
- API Key 等敏感信息只保存在本地 `.env.local` 或浏览器本地存储。
- 悬浮球只负责网页翻译，不触发 PDF / YouTube 翻译。
- 翻译请求小批量发送，默认每批 6 段。
- 回填通过 `data-segment-id` 和 `data-translation-for` 对齐，避免错位。
