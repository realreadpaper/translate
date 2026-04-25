import type { TranslationTarget } from '../../shared/translation-target';

type BrowserTabLike = {
  id?: number;
  url?: string;
  title?: string;
};

export async function detectTranslationTarget(tab: BrowserTabLike): Promise<TranslationTarget> {
  const tabId = typeof tab.id === 'number' ? tab.id : -1;
  const url = tab.url ?? '';

  if (url.startsWith('https://www.youtube.com/watch')) {
    const videoId = new URL(url).searchParams.get('v') ?? '';
    return {
      kind: 'youtube-subtitles',
      tabId,
      url,
      videoId,
    };
  }

  if (url.toLowerCase().includes('.pdf')) {
    const pathname = new URL(url).pathname;
    const displayName = pathname.split('/').pop() || tab.title || 'document.pdf';

    return {
      kind: 'pdf-document',
      tabId,
      url,
      sourceKind: url.startsWith('file://') ? 'file-url' : 'http-url',
      displayName,
    };
  }

  return {
    kind: 'html-page',
    tabId,
    url,
  };
}
