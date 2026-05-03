import { describe, expect, it } from 'vitest';

import { manifest } from '../../src/manifest';

describe('manifest', () => {
  it('declares popup, options, content script, and service worker entrypoints', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.action?.default_popup).toBe('src/popup/index.html');
    expect(manifest.options_page).toBe('src/options/index.html');
    expect(manifest.background && 'service_worker' in manifest.background).toBe(true);
    if (manifest.background && 'service_worker' in manifest.background) {
      expect(manifest.background.service_worker).toBe('src/background/index.ts');
    }
    expect(manifest.key).toBeTruthy();
    expect(manifest.content_scripts?.[0].js).toEqual(['src/content/index.ts']);
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['tabs', 'contextMenus']),
    );
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['tabCapture', 'offscreen']),
    );
    expect(manifest.permissions).not.toEqual(
      expect.arrayContaining(['webNavigation', 'webRequest', 'declarativeNetRequest']),
    );
    expect(manifest.declarative_net_request).toBeUndefined();
    expect(manifest.web_accessible_resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resources: expect.arrayContaining(['src/pdf/index.html']),
        }),
      ]),
    );
    expect(JSON.stringify(manifest.web_accessible_resources)).toContain(
      'src/offscreen/audio-capture.html',
    );
  });
});
