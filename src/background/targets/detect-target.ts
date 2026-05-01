import type {
  TranslationTarget,
  TranslationTargetKind,
} from '../../shared/translation-target';

type BrowserTabLike = {
  id?: number;
  url?: string;
  title?: string;
};

type DetectTranslationTargetDependencies = {
  getContentType?: (url: string) => Promise<string>;
};

export async function detectTranslationTarget(
  tab: BrowserTabLike,
  requestedKind?: TranslationTargetKind,
  { getContentType }: DetectTranslationTargetDependencies = {},
): Promise<TranslationTarget> {
  const tabId = typeof tab.id === 'number' ? tab.id : -1;
  const url = tab.url ?? '';
  const pdfViewerSourceUrl = extractPdfViewerSourceUrl(url);
  const embeddedPdfUrl = extractEmbeddedPdfUrl(url);

  if (requestedKind === 'html-page') {
    return {
      kind: 'html-page',
      tabId,
      url,
    };
  }

  if (requestedKind === 'youtube-subtitles') {
    const videoId = extractYoutubeVideoId(url);
    if (!videoId) {
      return createHtmlTarget(tabId, url);
    }

    return {
      kind: 'youtube-subtitles',
      tabId,
      url,
      videoId,
    };
  }

  if (requestedKind === 'pdf-document') {
    return createPdfTarget(tabId, pdfViewerSourceUrl || embeddedPdfUrl || url, tab.title);
  }

  if (pdfViewerSourceUrl) {
    return createPdfTarget(tabId, pdfViewerSourceUrl, tab.title);
  }

  if (embeddedPdfUrl) {
    return createPdfTarget(tabId, embeddedPdfUrl, tab.title);
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

  if (isPdfUrlLike(url) || (await isPdfContentType(url, getContentType))) {
    return createPdfTarget(tabId, url, tab.title);
  }

  return createHtmlTarget(tabId, url);
}

function createHtmlTarget(tabId: number, url: string): TranslationTarget {
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

function isPdfUrlLike(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.toLowerCase();
    return pathname.endsWith('.pdf') || pathname === '/pdf' || pathname.startsWith('/pdf/');
  } catch {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.endsWith('.pdf') || lowerUrl.includes('/pdf/');
  }
}

function extractEmbeddedPdfUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    for (const key of ['file', 'url', 'pdf', 'src', 'source']) {
      const value = parsedUrl.searchParams.get(key) ?? '';
      if (!value) {
        continue;
      }

      const decodedValue = decodeURIComponent(value);
      if (
        (decodedValue.startsWith('http') || decodedValue.startsWith('file://')) &&
        isPdfUrlLike(decodedValue)
      ) {
        return decodedValue;
      }
    }
  } catch {
    return '';
  }

  return '';
}

function extractPdfViewerSourceUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (
      parsedUrl.protocol !== 'chrome-extension:' &&
      parsedUrl.protocol !== 'edge-extension:'
    ) {
      return '';
    }

    const sourceUrl = parsedUrl.searchParams.get('src') ?? '';
    if (!sourceUrl.startsWith('http') && !sourceUrl.startsWith('file://')) {
      return '';
    }

    return sourceUrl;
  } catch {
    return '';
  }
}

async function isPdfContentType(
  url: string,
  getContentType?: (url: string) => Promise<string>,
): Promise<boolean> {
  if (!getContentType || !url.startsWith('http')) {
    return false;
  }

  try {
    const contentType = await getContentType(url);
    return contentType.toLowerCase().split(';')[0].trim() === 'application/pdf';
  } catch {
    return false;
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
