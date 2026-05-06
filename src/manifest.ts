import type { ManifestV3Export } from '@crxjs/vite-plugin';

type StaticManifest = Exclude<ManifestV3Export, Promise<unknown> | ((...args: never[]) => unknown)>;

export const manifest: StaticManifest = {
  manifest_version: 3,
  name: 'Immersive AI Translate',
  version: '0.2.1',
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyx563u6aj5OLoWQsURdedYzmN3QzNtypxpqy5qamqvX2+uAnentLkthI/Pb659isx9izOVXX+aZv/hVG8sSNwLuzjhvKR1qyr0OHlqOMBRrur27fR8H5xZ/6iGVCLmtto6+1nLait1fEJhLNv/w/qdjJJAOK2eR1PopZVDjHT7wKZveelu87LvZh9xxLg0T7CZquBypMNiWyNy7MBtwfJy9vQsvHGUYzrEJyROrcb/itJdiHPhQb9109x6W8AAaegrWFIzK6DNmLHqZuaE5kzUOMl23F9ndl8MdP9uk1WJc6SvK0wN0fVZ7vNz8zXavWQbmvyWNse0gYoTSwX/5VNwIDAQAB',
  action: {
    default_popup: 'src/popup/index.html',
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: [
    'storage',
    'activeTab',
    'scripting',
    'tabs',
    'contextMenus',
    'tabCapture',
    'offscreen',
  ],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      matches: ['<all_urls>'],
      resources: [
        'src/pdf/index.html',
        'src/pdf-viewer/index.html',
        'src/offscreen/index.html',
        'src/offscreen/audio-capture.html',
      ],
    },
  ],
};
