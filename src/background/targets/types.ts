import type { TranslationTarget } from '../../shared/translation-target';

export type DetectTarget = (tabId: number) => Promise<TranslationTarget>;
