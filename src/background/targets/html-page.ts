import type { TranslationTarget } from '../../shared/translation-target';

export function isHtmlPageTarget(
  target: TranslationTarget,
): target is TranslationTarget & { kind: 'html-page' } {
  return target.kind === 'html-page';
}
