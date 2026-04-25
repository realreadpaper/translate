import { chromium, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SETTINGS_KEY = 'immersive-ai-translate.settings';

test('opens the pdf translation workspace for standalone pdf tabs', async () => {
  const pathToExtension = path.resolve('dist');
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'immersive-ai-translate-pdf-'));
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

    const pdfUrl = 'http://127.0.0.1:4173/report.pdf';
    const page = await context.newPage();
    await page.route(pdfUrl, async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>Standalone PDF placeholder</h1></body></html>',
      });
    });

    await background.evaluate(async ({ storageKey }) => {
      await chrome.storage.local.set({
        [storageKey]: {
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
            'openai-compatible': {
              apiKey: '',
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

    await page.goto(pdfUrl);

    const pdfTabId = await background.evaluate(async ({ targetUrl }) => {
      const tabs = await chrome.tabs.query({});
      const targetTab = tabs.find((tab) => tab.url === targetUrl);
      if (!targetTab?.id) {
        throw new Error('Failed to find PDF tab for workspace redirection.');
      }
      return targetTab.id;
    }, { targetUrl: pdfUrl });

    const controlPage = await context.newPage();
    await controlPage.goto(`chrome-extension://${extensionId}/src/options/index.html`);

    const [workspacePage, response] = await Promise.all([
      context.waitForEvent('page'),
      controlPage.evaluate(async (tabId) => chrome.runtime.sendMessage({
        type: 'START_TRANSLATION_JOB',
        tabId,
      }), pdfTabId),
    ]);

    expect(response).toMatchObject({
      type: 'TRANSLATION_JOB_REDIRECTED',
      target: {
        kind: 'pdf-document',
        displayName: 'report.pdf',
      },
    });

    await workspacePage.waitForLoadState('domcontentloaded');

    await expect(workspacePage.getByText('PDF 翻译工作台')).toBeVisible();
  } finally {
    await context.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
