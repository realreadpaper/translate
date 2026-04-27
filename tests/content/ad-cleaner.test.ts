import { describe, expect, it, vi } from 'vitest';

import { extractSegments } from '../../src/content/dom-extractor';
import { cleanAds, startAdCleaner } from '../../src/content/ad-cleaner';

describe('ad cleaner', () => {
  it('hides likely ad containers and marks them ignored', () => {
    document.body.innerHTML = `
      <main>
        <article>
          <p>Readable article text.</p>
        </article>
        <aside class="ad-banner">Buy this noisy thing.</aside>
        <div data-testid="sponsored-post">Sponsored interruption.</div>
        <iframe src="https://googleads.g.doubleclick.net/pagead/ads"></iframe>
      </main>
    `;

    const result = cleanAds(document.body);

    expect(result.hiddenCount).toBe(3);
    expect((document.querySelector('article') as HTMLElement).dataset.immersiveAdHidden).toBe(
      undefined,
    );
    document.querySelectorAll('[data-immersive-ad-hidden="true"]').forEach((node) => {
      const element = node as HTMLElement;
      expect(element.dataset.immersiveIgnore).toBe('true');
      expect(element.style.display).toBe('none');
    });
  });

  it('prevents ad text from being extracted for translation', () => {
    document.body.innerHTML = `
      <main>
        <p>Translate this article.</p>
        <div id="sponsored-card">Do not translate this sponsored card.</div>
      </main>
    `;

    cleanAds(document.body);

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Translate this article.' },
    ]);
  });

  it('does not hide ordinary words that merely contain ad letters', () => {
    document.body.innerHTML = `
      <main>
        <div class="reading-list">Reading list stays visible.</div>
        <div class="thread-card">Thread card stays visible.</div>
      </main>
    `;

    expect(cleanAds(document.body)).toEqual({ hiddenCount: 0 });
    expect(document.body.textContent).toContain('Reading list stays visible.');
    expect(document.querySelectorAll('[data-immersive-ad-hidden="true"]')).toHaveLength(0);
  });

  it('hides dynamically inserted ads', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main><p>Article remains.</p></main>';

    const controller = startAdCleaner(document.body);
    const lateAd = document.createElement('div');
    lateAd.className = 'promoted-card';
    lateAd.textContent = 'Late promoted content.';
    document.querySelector('main')?.append(lateAd);

    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(lateAd.dataset.immersiveAdHidden).toBe('true');
    expect(lateAd.dataset.immersiveIgnore).toBe('true');
    expect(lateAd.style.display).toBe('none');

    controller.disconnect();
    vi.useRealTimers();
  });
});
