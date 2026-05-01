# Immersive AI Translate

面向 Chrome / Edge 的沉浸式网页翻译扩展，当前默认使用 DeepSeek，本地保存配置，支持双语、仅原文、仅译文三种阅读模式。

详细架构、功能说明、数据流和测试策略见：[项目说明文档](docs/project-overview.md)。

## 当前能力

- 通用可见文本提取与批量翻译
- 翻译前自动隐藏常见广告和赞助内容
- 悬浮球视口优先翻译，滚动时继续翻译后续内容
- 双语 / 原文 / 译文三种显示模式切换
- Popup 控制台与 Options 设置工作台
- DeepSeek、OpenAI-compatible、Traditional provider 适配
- X / Twitter 帖子正文翻译
- Reddit 帖子和评论正文翻译
- DeepSeek 默认配置与本地密钥注入
- Provider 返回结构容错，避免异常响应打断整页翻译
- 独立 PDF 文本层翻译工作台（实验）
- YouTube 现有字幕轨道翻译 overlay（实验）
- 离线稳定 E2E 测试
- 可选真实 DeepSeek 联机冒烟测试

说明：当前稳定能力仍以 `html-page` 网页翻译为主；PDF 与 YouTube 字幕翻译已经接入首版实验链路。PDF 仅支持可提取文本层的文档，扫描版 PDF 的 OCR 兜底尚未接入。YouTube 仅支持已有字幕轨道的视频，无字幕视频的 ASR 兜底尚未接入。

## 技术栈

- TypeScript
- React 19
- Vite
- `@crxjs/vite-plugin`
- Chrome Extension Manifest V3
- Vitest / jsdom / React Testing Library
- Playwright

## 本地开发

```bash
npm install
HOST=127.0.0.1 npm test
HOST=127.0.0.1 npm run test:e2e -- tests/e2e/page-translation.spec.ts
npm run build
```

常用目录：

- `src/content/`：网页注入、悬浮球、正文提取、译文回填
- `src/background/`：background service worker、消息编排、provider 调用
- `src/popup/`：popup 操作面板
- `src/options/`：设置页
- `src/pdf/`：PDF 翻译工作台
- `src/shared/`：共享类型、消息协议、默认配置
- `tests/`：单元测试、组件测试和 E2E 测试

## 浏览器装载

1. 运行 `npm run build`
2. 打开 Chrome 或 Edge 的扩展管理页
3. 打开“开发者模式”
4. 选择“加载已解压的扩展程序”
5. 选择当前仓库下的 `dist/` 目录

## DeepSeek 本地配置

项目默认从本地 `.env.local` 读取 DeepSeek 初始配置。建议保留以下变量：

```bash
VITE_DEFAULT_PROVIDER_ID=deepseek
VITE_DEFAULT_DEEPSEEK_API_KEY=你的 DeepSeek Key
VITE_DEFAULT_DEEPSEEK_MODEL=deepseek-v4-flash
```

说明：

- `.env.local` 已加入 `.gitignore`
- 首次启动会把默认配置写入浏览器本地存储
- 后续你也可以直接在扩展的设置页修改

## 手动试用

1. 在浏览器中装载 `dist/`
2. 打开扩展 popup
3. 确认当前 provider 为 `DeepSeek`
4. 打开一篇正文结构清晰的公开文章
5. 点击 `翻译当前页面`
6. 检查 `双语 / 原文 / 译文` 三种模式切换是否符合预期
7. 在设置页确认目标语言、模型和 Base URL 是否正确

## 网页翻译体验

悬浮球采用渐进式翻译：

1. 打开页面后，content script 会先隐藏常见广告、赞助内容和广告 iframe，并持续监听后续插入的动态广告。
2. 点击悬浮球后，优先翻译当前视口附近内容。
3. 单次最多发送 6 段，避免一次请求过大。
4. 用户向下滚动时，继续翻译新进入视口附近、且尚未翻译过的段落。
5. 译文会插入到原文节点之后，确保双语阅读时上下文仍然清晰。

Popup 的手动翻译入口仍保留全页翻译行为，适合一次性处理整篇文章。

### 广告清理触发时机

广告清理和翻译触发是分开的：

- 页面打开后：无论是否开启“页面加载后自动翻译”，都会立即运行一次广告清理，并启动 DOM 监听来隐藏后续动态插入的广告。
- 非自动翻译模式：页面打开后只清理广告，不会发起翻译；用户点击悬浮球时，会先再次清理广告，再抽取当前视口附近文本并翻译。
- 自动翻译模式：页面加载完成并检测到可翻译内容后，会先清理广告，再收集文本并发起翻译。
- Popup 手动翻译：点击 popup 的翻译入口后，content script 会先清理广告，再收集整页文本。

## 调试日志

content script 和 background service worker 均输出调试日志，统一前缀：

```text
[Immersive AI Translate]
```

可用于观察：

- 页面提取到的段落数量
- 悬浮球每批翻译的段落数量
- background 收到的消息类型
- 翻译完成数量和失败批次数

## 真实 DeepSeek 联机冒烟测试

这个仓库包含一个显式开启的 Playwright 联机测试入口，用于在你本机验证真实网页是否能走通 DeepSeek 翻译链路。

```bash
PLAYWRIGHT_DEEPSEEK_SMOKE=1 \
PLAYWRIGHT_DEEPSEEK_SMOKE_URL="https://example.com/article" \
HOST=127.0.0.1 \
npm run test:e2e:deepseek-smoke
```

要求：

- `.env.local` 中已经配置好 DeepSeek Key
- 目标页面是公开可访问的文章页
- 本机已经安装 Playwright Chromium

## 验证清单

- [x] `npx tsc --noEmit`
- [x] `HOST=127.0.0.1 npm test -- tests/shared/config.test.ts tests/storage/settings.test.ts tests/background/providers/translate.test.ts tests/shared/manifest.test.ts tests/popup/app.test.tsx tests/options/app.test.tsx`
- [x] `HOST=127.0.0.1 npm run test:e2e -- tests/e2e/page-translation.spec.ts`
- [x] `HOST=127.0.0.1 npm run test:e2e:deepseek-smoke`
说明：未设置 `PLAYWRIGHT_DEEPSEEK_SMOKE=1` 时会安全跳过
