import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

import { logDebug } from '../shared/debug';
import { mergePdfTextItems, type PdfTextBlock, type PdfTextItemLike } from './pdf-text-blocks';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type PdfTextPage = {
  pageNumber: number;
  text: string;
  blocks: PdfTextBlock[];
};

export async function extractPdfTextPages(sourceUrl: string): Promise<PdfTextPage[]> {
  logDebug('pdf text extraction fetch starting', {
    sourceUrl,
  });
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    logDebug('pdf text extraction fetch failed', {
      sourceUrl,
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`PDF 读取失败：${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  logDebug('pdf text extraction fetch completed', {
    sourceUrl,
    byteLength: bytes.byteLength,
  });
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  logDebug('pdf document loaded', {
    sourceUrl,
    pageCount: pdf.numPages,
  });
  const pages: PdfTextPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    logDebug('pdf page text extraction starting', {
      pageNumber,
      pageCount: pdf.numPages,
    });
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const textItems: PdfTextItemLike[] = textContent.items.flatMap((item) => {
      if (!('str' in item) || !('transform' in item)) {
        return [];
      }

      return [
        {
          str: item.str,
          transform: Array.from(item.transform),
          width: item.width,
          height: item.height,
        },
      ];
    });
    const blocks = mergePdfTextItems(
      textItems,
      pageNumber,
    );
    const text = blocks.map((block) => block.text).join('\n').trim();
    logDebug('pdf page text extraction completed', {
      pageNumber,
      itemCount: textItems.length,
      blockCount: blocks.length,
      textLength: text.length,
    });

    pages.push({ pageNumber, text, blocks });
  }

  logDebug('pdf text extraction completed', {
    sourceUrl,
    pageCount: pages.length,
    blockCount: pages.reduce((total, page) => total + page.blocks.length, 0),
  });
  return pages;
}
