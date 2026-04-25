export type HtmlPageTarget = {
  kind: 'html-page';
  tabId: number;
  url: string;
};

export type YoutubeSubtitleTarget = {
  kind: 'youtube-subtitles';
  tabId: number;
  url: string;
  videoId: string;
};

export type PdfDocumentTarget = {
  kind: 'pdf-document';
  tabId: number;
  url: string;
  sourceKind: 'http-url' | 'file-url';
  displayName: string;
};

export type TranslationTarget =
  | HtmlPageTarget
  | YoutubeSubtitleTarget
  | PdfDocumentTarget;

export function isYoutubeSubtitleTarget(
  target: TranslationTarget,
): target is YoutubeSubtitleTarget {
  return target.kind === 'youtube-subtitles';
}

export function isPdfDocumentTarget(
  target: TranslationTarget,
): target is PdfDocumentTarget {
  return target.kind === 'pdf-document';
}
