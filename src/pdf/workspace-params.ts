import type { TranslationTarget } from '../shared/translation-target';

type PdfDocumentTarget = Extract<TranslationTarget, { kind: 'pdf-document' }>;

export type PdfWorkspaceParams = {
  sourceUrl: string;
  displayName: string;
  sourceKind: PdfDocumentTarget['sourceKind'];
  debugLoggingEnabled: boolean;
};

export function readPdfWorkspaceParams(
  search: string,
  hash = typeof window !== 'undefined' ? window.location.hash : '',
): PdfWorkspaceParams {
  const params = new URLSearchParams(search);
  const sourceUrl = params.get('sourceUrl') || readHashSourceUrl(hash);
  if (!sourceUrl) {
    throw new Error('PDF sourceUrl is required.');
  }

  return {
    sourceUrl,
    displayName: params.get('displayName') || inferPdfDisplayName(sourceUrl),
    sourceKind: readPdfSourceKind(params.get('sourceKind'), sourceUrl),
    debugLoggingEnabled: isDebugParamEnabled(params.get('debug')),
  };
}

function isDebugParamEnabled(value: string | null): boolean {
  return value === '1' || value === 'true';
}

function readHashSourceUrl(hash: string): string {
  const prefix = '#sourceUrl=';
  if (!hash.startsWith(prefix)) {
    return '';
  }

  return hash.slice(prefix.length);
}

function readPdfSourceKind(
  sourceKind: string | null,
  sourceUrl: string,
): PdfDocumentTarget['sourceKind'] {
  if (sourceKind === 'http-url' || sourceKind === 'file-url') {
    return sourceKind;
  }

  return sourceUrl.startsWith('file://') ? 'file-url' : 'http-url';
}

function inferPdfDisplayName(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const pathName = decodeURIComponent(parsed.pathname);
    const lastSegment = pathName.split('/').filter(Boolean).at(-1);
    return lastSegment || 'document.pdf';
  } catch {
    return 'document.pdf';
  }
}
