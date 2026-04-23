import { chromium, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readDeepSeekSmokeConfig } from './smoke-config';

const smokeConfig = readDeepSeekSmokeConfig(process.env);

test.skip(!smokeConfig.enabled, 'Set PLAYWRIGHT_DEEPSEEK_SMOKE=1 to run the DeepSeek smoke test.');

test('runs a real DeepSeek page translation on a target article', async () => {
  test.setTimeout(smokeConfig.timeoutMs);

  const pathToExtension = path.resolve('dist');
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'immersive-ai-translate-smoke-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
    ],
  });

  try {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    const extensionId = new URL(background.url()).host;
    const page = await context.newPage();
    await page.goto(smokeConfig.targetUrl, {
      waitUntil: 'domcontentloaded',
    });

    const articleTabId = await background.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({ url });
      return tabs[0]?.id ?? null;
    }, smokeConfig.targetUrl);

    expect(articleTabId).not.toBeNull();

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html?tabId=${articleTabId}`);
    await popup.getByRole('button', { name: '翻译当前页面' }).click();

    await expect(
      popup.getByText(/已完成 \d+ 段翻译|已完成 \d+ 段翻译，\d+ 个批次失败/),
    ).toBeVisible({ timeout: smokeConfig.timeoutMs });
    await expect(page.locator('[data-translation-for]').first()).toBeVisible({
      timeout: smokeConfig.timeoutMs,
    });
  } finally {
    await context.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
