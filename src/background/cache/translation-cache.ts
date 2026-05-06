type TranslatedRecord = Array<{ id: string; translatedText: string }>;

export function createTranslationCache() {
  const memory = new Map<string, TranslatedRecord>();

  return {
    get(key: string) {
      return memory.get(key) ?? null;
    },
    set(key: string, value: TranslatedRecord) {
      memory.set(key, value);
    },
    delete(key: string) {
      memory.delete(key);
    },
  };
}
