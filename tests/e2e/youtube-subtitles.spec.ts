import { chromium, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SETTINGS_KEY = 'immersive-ai-translate.settings';

test('renders bilingual subtitles on a youtube watch page fixture', async () => {
  const pathToExtension = path.resolve('dist');
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'immersive-ai-translate-youtube-'));
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
          youtubeAutoCaptionFallback: true,
          youtubeSubtitlePrefetchEnabled: true,
          youtubeSubtitlePrefetchWindowSeconds: 180,
          youtubeExperimentalAudioPrefetchEnabled: false,
          youtubeAsrProvider: {
            providerId: 'openai-compatible',
            apiKey: '',
            baseUrl: 'https://api.openai.com/v1',
            model: 'whisper-1',
          },
          pdfOcrFallback: 'confirm-first',
          youtubeAsrFallback: 'disabled',
          subtitleDisplayStyle: 'overlay-bottom',
          translationCacheEnabled: true,
          debugLoggingEnabled: false,
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

    const page = await context.newPage();
    const youtubeUrl = 'https://www.youtube.com/watch?v=demo-video';
    const captionsUrl = 'https://www.youtube.com/api/timedtext?mock=1';
    const playerResponse = {
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: captionsUrl,
              languageCode: 'en',
            },
          ],
        },
      },
    };

    await page.route(youtubeUrl, async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html lang="en">
            <body>
              <main>
                <video controls></video>
                <script>
                  window.ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
                </script>
              </main>
            </body>
          </html>
        `,
      });
    });
    await page.route(captionsUrl, async (route) => {
      await route.fulfill({
        contentType: 'text/xml',
        body: '<transcript><text start="0" dur="120">Hello world</text></transcript>',
      });
    });

    await page.goto(youtubeUrl);

    const floatingTrigger = page.locator('[data-floating-ball-trigger]');
    await expect(floatingTrigger).toBeVisible();
    await floatingTrigger.click();

    const subtitleOverlay = page.locator('[data-youtube-subtitle-overlay]');
    await expect(subtitleOverlay).toContainText('Hello world');
    await expect(subtitleOverlay).toContainText('你好，世界');
  } finally {
    await context.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
