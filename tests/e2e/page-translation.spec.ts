import { chromium, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SETTINGS_KEY = 'immersive-ai-translate.settings';

test('translates a page and switches between bilingual, original-only, and translated-only modes from the floating ball', async () => {
  const pathToExtension = path.resolve('dist');
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'immersive-ai-translate-'));
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
    await background.evaluate(async ({ storageKey }) => {
      await chrome.storage.local.set({
        [storageKey]: {
          providerId: 'traditional',
          sourceLanguage: 'auto',
          targetLanguage: 'zh-CN',
          displayMode: 'bilingual',
          autoTranslateOnLoad: false,
          providers: {
            'openai-compatible': {
              apiKey: 'test-key',
              baseUrl: 'https://api.openai.com/v1',
              model: 'gpt-4o-mini',
            },
            deepseek: {
              apiKey: '',
              baseUrl: 'https://api.deepseek.com/v1',
              model: 'deepseek-v4-flash',
            },
            traditional: {
              apiKey: '',
              endpoint: 'google-translate',
            },
          },
        },
      });
    }, { storageKey: SETTINGS_KEY });

    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/article.html');

    const floatingTrigger = page.locator('[data-floating-ball-trigger]');
    await expect(floatingTrigger).toBeVisible();
    await floatingTrigger.click();

    await expect(page.getByText('你好，世界')).toBeVisible();
    await expect(page.getByText('当前模式：双语')).toBeVisible();

    await page.getByRole('button', { name: '原文' }).click();
    await expect(page.getByText('Hello world')).toBeVisible();
    await expect(page.getByText('你好，世界')).toBeHidden();
    await expect(page.getByText('当前模式：仅原文')).toBeVisible();

    await page.getByRole('button', { name: '译文' }).click();
    await expect(page.getByText('Hello world')).toBeHidden();
    await expect(page.getByText('你好，世界')).toBeVisible();
    await expect(page.getByText('当前模式：仅译文')).toBeVisible();
  } finally {
    await context.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
