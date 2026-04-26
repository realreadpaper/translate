import type {
  TranslationTarget,
  TranslationTargetKind,
} from '../../shared/translation-target';

type BrowserTabLike = {
  id?: number;
  url?: string;
  title?: string;
};

export async function detectTranslationTarget(
  tab: BrowserTabLike,
  requestedKind?: TranslationTargetKind,
): Promise<TranslationTarget> {
  const tabId = typeof tab.id === 'number' ? tab.id : -1;
  const url = tab.url ?? '';

  if (requestedKind === 'html-page') {
    return {
      kind: 'html-page',
      tabId,
      url,
    };
  }

  if (requestedKind === 'youtube-subtitles') {
    return {
      kind: 'youtube-subtitles',
      tabId,
      url,
      videoId: extractYoutubeVideoId(url),
    };
  }

  if (requestedKind === 'pdf-document') {
    return createPdfTarget(tabId, url, tab.title);
  }

  const youtubeVideoId = extractYoutubeVideoId(url);
  if (youtubeVideoId) {
    return {
      kind: 'youtube-subtitles',
      tabId,
      url,
      videoId: youtubeVideoId,
    };
  }

  if (isStandalonePdfUrl(url)) {
    return createPdfTarget(tabId, url, tab.title);
  }

  return {
    kind: 'html-page',
    tabId,
    url,
  };
}

function extractYoutubeVideoId(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (
      (parsedUrl.hostname === 'www.youtube.com' || parsedUrl.hostname === 'youtube.com') &&
      parsedUrl.pathname === '/watch'
    ) {
      return parsedUrl.searchParams.get('v') ?? '';
    }
  } catch {
    return '';
  }

  return '';
}

function isStandalonePdfUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return url.toLowerCase().endsWith('.pdf');
  }
}

function createPdfTarget(tabId: number, url: string, title?: string): TranslationTarget {
  let displayName = title?.trim() || 'document.pdf';

  try {
    const pathnameName = new URL(url).pathname.split('/').filter(Boolean).at(-1);
    if (pathnameName) {
      displayName = decodeURIComponent(pathnameName);
    }
  } catch {
    const fallbackName = url.split('/').filter(Boolean).at(-1);
    if (fallbackName) {
      displayName = fallbackName;
    }
  }

  return {
    kind: 'pdf-document',
    tabId,
    url,
    sourceKind: url.startsWith('file://') ? 'file-url' : 'http-url',
    displayName,
  };
}
