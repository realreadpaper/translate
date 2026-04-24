# Immersive AI Translate

面向 Chrome / Edge 的沉浸式整页翻译扩展，当前默认使用 DeepSeek，本地保存配置，支持双语、仅原文、仅译文三种阅读模式。

## 当前能力

- 整页正文提取与批量翻译
- 双语 / 原文 / 译文三种显示模式切换
- Popup 控制台与 Options 设置工作台
- DeepSeek 默认配置与本地密钥注入
- 离线稳定 E2E 测试
- 可选真实 DeepSeek 联机冒烟测试

## 本地开发

```bash
npm install
HOST=127.0.0.1 npm test
HOST=127.0.0.1 npm run test:e2e -- tests/e2e/page-translation.spec.ts
npm run build
```

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
