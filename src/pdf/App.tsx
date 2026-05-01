import { useEffect, useMemo, useState } from 'react';

import { loadSettings } from '../storage/settings';
import { configureRuntimeDebugLogging, logDebug } from '../shared/debug';
import type { DisplayMode } from '../shared/types';
import { extractPdfTextPages, type PdfTextPage } from './pdf-text';
import type { PdfTextBlock } from './pdf-text-blocks';
import { createPdfPageTranslationCache } from './pdf-translation-cache';
import { translatePdfPagesIncrementally } from './translate-pdf';
import { readPdfWorkspaceParams, type PdfWorkspaceParams } from './workspace-params';

type PdfPageView = Omit<PdfTextPage, 'blocks'> & {
  blocks: Array<PdfTextBlock & { translatedText?: string; translationError?: string }>;
};

const MODE_LABELS: Record<DisplayMode, string> = {
  bilingual: '双语',
  'original-only': '仅原文',
  'translated-only': '仅译文',
};

export function App() {
  const params = useMemo(() => readPdfWorkspaceParams(window.location.search), []);
  const [status, setStatus] = useState('正在读取 PDF 文本层...');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('bilingual');
  const [pages, setPages] = useState<PdfPageView[]>([]);
  const [job] = useState<PdfWorkspaceParams>(params);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        configureRuntimeDebugLogging(params.debugLoggingEnabled);
        logDebug('pdf workspace bootstrapping', {
          sourceUrl: params.sourceUrl,
          displayName: params.displayName,
          sourceKind: params.sourceKind,
          debugFromQuery: params.debugLoggingEnabled,
        });
        const settings = await loadSettings();
        configureRuntimeDebugLogging(settings.debugLoggingEnabled || params.debugLoggingEnabled);
        logDebug('pdf workspace starting', {
          sourceUrl: params.sourceUrl,
          displayName: params.displayName,
          sourceKind: params.sourceKind,
          debugFromSettings: settings.debugLoggingEnabled,
          debugFromQuery: params.debugLoggingEnabled,
          providerId: settings.providerId,
          sourceLanguage: settings.sourceLanguage,
          targetLanguage: settings.targetLanguage,
          displayMode: settings.displayMode,
          cacheEnabled: settings.translationCacheEnabled,
        });
        const extractedPages = await extractPdfTextPages(params.sourceUrl);
        if (cancelled) {
          logDebug('pdf workspace cancelled after extraction');
          return;
        }

        const textBlocks = extractedPages.flatMap((page) => page.blocks);
        logDebug('pdf workspace text extracted', {
          pageCount: extractedPages.length,
          blockCount: textBlocks.length,
        });
        if (textBlocks.length === 0) {
          setPages(extractedPages);
          setDisplayMode(settings.displayMode);
          setStatus(createOcrStatusMessage(settings.pdfOcrFallback));
          logDebug('pdf workspace found no text blocks', {
            pdfOcrFallback: settings.pdfOcrFallback,
          });
          return;
        }

        setPages(extractedPages);
        setStatus(`已解析 ${textBlocks.length} 个文本块，正在优先翻译第 1 页...`);

        logDebug('pdf workspace translation starting', {
          blockCount: textBlocks.length,
          providerId: settings.providerId,
          targetLanguage: settings.targetLanguage,
        });
        const translatedById = new Map<string, string>();
        const failedById = new Map<string, string>();
        const result = await translatePdfPagesIncrementally({
          pages: extractedPages,
          sourceUrl: params.sourceUrl,
          settings,
          cache: createPdfPageTranslationCache({
            sourceUrl: params.sourceUrl,
            settings,
          }),
          onChunkStarting: (progress) => {
            if (cancelled) {
              return;
            }

            logDebug('pdf workspace chunk status update', {
              chunkIndex: progress.chunkIndex,
              chunkCount: progress.chunkCount,
              cachedCount: progress.cachedCount,
              missingCount: progress.missingCount,
              translatedCount: progress.translatedCount,
              totalCount: progress.totalCount,
            });
            const cacheText = progress.cachedCount > 0 ? `，缓存命中 ${progress.cachedCount} 段` : '';
            setStatus(
              `正在并发翻译，已启动第 ${progress.chunkIndex + 1}/${progress.chunkCount} 组，已完成 ${progress.translatedCount}/${progress.totalCount} 段${cacheText}...`,
            );
          },
          onTranslationsReady: (translated, progress) => {
            if (cancelled) {
              return;
            }

            for (const item of translated) {
              translatedById.set(item.id, item.translatedText);
              failedById.delete(item.id);
            }

            logDebug('pdf workspace applying translated segments', {
              receivedCount: translated.length,
              totalTranslatedCount: translatedById.size,
              failedCount: failedById.size,
              progress,
              firstSegmentId: translated[0]?.id,
              lastSegmentId: translated.at(-1)?.id,
            });
            setPages((currentPages) => applyTranslationState(currentPages, translatedById, failedById));
            setStatus(`已完成 ${progress.translatedCount}/${progress.totalCount} 段翻译`);
          },
          onTranslationsFailed: (failed, progress) => {
            if (cancelled) {
              return;
            }

            for (const failedBatch of failed) {
              for (const segmentId of failedBatch.segmentIds) {
                failedById.set(segmentId, failedBatch.message);
              }
            }

            setPages((currentPages) => applyTranslationState(currentPages, translatedById, failedById));
            const firstMessage = failed[0]?.message ?? '未知错误';
            logDebug('pdf workspace translation batch failed', {
              chunkIndex: progress.chunkIndex,
              chunkCount: progress.chunkCount,
              failedBatchCount: failed.length,
              message: firstMessage,
            });
            setStatus(
              `第 ${progress.chunkIndex + 1}/${progress.chunkCount} 组翻译失败：${firstMessage}`,
            );
          },
        });

        if (cancelled) {
          logDebug('pdf workspace cancelled before final render');
          return;
        }

        setPages(
          extractedPages.map((page) => ({
            ...page,
            blocks: page.blocks.map((block) => ({
              ...block,
              translatedText: translatedById.get(block.id),
              translationError: failedById.get(block.id),
            })),
          })),
        );
        setDisplayMode(settings.displayMode);
        logDebug('pdf workspace translation finished', {
          status: result.status,
          translatedCount: result.translated.length,
          failedBatchCount: result.failedBatches.length,
        });
        setStatus(
          result.status === 'partial-success'
            ? `已完成 ${result.translated.length} 个文本块翻译，${result.failedBatches.length} 个批次失败`
            : `已完成 ${result.translated.length} 个文本块翻译`,
        );
      } catch (error) {
        if (!cancelled) {
          logDebug('pdf workspace failed', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          setStatus(`PDF 翻译失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [params.sourceUrl]);

  return (
    <main className="pdf-workspace">
      <header className="pdf-toolbar">
        <div>
          <p className="pdf-eyebrow">护眼 PDF 翻译工作台</p>
          <h1>{job.displayName}</h1>
        </div>
        <div className="pdf-actions" role="group" aria-label="显示模式">
          {(['bilingual', 'original-only', 'translated-only'] as DisplayMode[]).map((mode) => (
            <button
              className={displayMode === mode ? 'is-active' : ''}
              key={mode}
              type="button"
              onClick={() => setDisplayMode(mode)}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </header>

      <section className="pdf-status">{status}</section>

      <section className={`pdf-pages pdf-pages--${displayMode}`}>
        {pages.map((page) => (
          <article className="pdf-page" key={page.pageNumber}>
            <header>第 {page.pageNumber} 页</header>
            {displayMode !== 'translated-only' ? (
              <section className="pdf-page-column">
                <h2>原文</h2>
                {page.blocks.length > 0 ? (
                  page.blocks.map((block) => <p key={block.id}>{block.text}</p>)
                ) : (
                  <p>此页未检测到文本层</p>
                )}
              </section>
            ) : null}
            {displayMode !== 'original-only' ? (
              <section className="pdf-page-column">
                <h2>译文</h2>
                {page.blocks.length > 0 ? (
                  page.blocks.map((block) => (
                    <p className={block.translationError ? 'is-error' : undefined} key={block.id}>
                      {block.translatedText ||
                        (block.translationError
                          ? `翻译失败：${block.translationError}`
                          : '等待翻译结果')}
                    </p>
                  ))
                ) : (
                  <p>等待 OCR 兜底</p>
                )}
              </section>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}

function createOcrStatusMessage(pdfOcrFallback: 'confirm-first' | 'disabled'): string {
  if (pdfOcrFallback === 'disabled') {
    return '未检测到可用文本层。OCR 兜底已在设置中关闭。';
  }

  return '未检测到可用文本层。OCR 兜底已预留用户确认入口，尚未接入识别服务。';
}

function applyTranslationState(
  pages: PdfPageView[],
  translatedById: Map<string, string>,
  failedById: Map<string, string>,
): PdfPageView[] {
  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => ({
      ...block,
      translatedText: translatedById.get(block.id),
      translationError: failedById.get(block.id),
    })),
  }));
}
