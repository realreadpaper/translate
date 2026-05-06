type PdfJob = {
  target: {
    kind: 'pdf-document';
    tabId: number;
    url: string;
    sourceKind: 'http-url' | 'file-url';
    displayName: string;
  };
  targetLanguage: string;
};

export function createPdfJobStore() {
  const jobs = new Map<string, PdfJob>();

  return {
    put(job: PdfJob) {
      const id = crypto.randomUUID();
      jobs.set(id, job);
      return id;
    },
    get(id: string) {
      return jobs.get(id) ?? null;
    },
    delete(id: string) {
      jobs.delete(id);
    },
  };
}
