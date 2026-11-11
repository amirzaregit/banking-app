import { useRef, useState } from 'react';

import { isWeb, makePdfFile, printDialog, saveToPhone, sharePdf, viewPdf, type PdfFile } from '@/certificates/pdf';
import { useI18n } from '@/i18n/provider';

/** A document ready to become a PDF: the page (HTML), the file name it should get, and the title shown in share sheets. */
export type PdfSource = { html: string; fileName: string; title: string };

/** The page was made but the phone could not turn it into a PDF file. */
class PdfBuildError extends Error {}

export type PdfDocument = ReturnType<typeof usePdfDocument>;

/**
 * Everything a screen needs to offer one document as a file: view it, save it to the phone, share it, or print it. THE one
 * place that handles PDF files: certificates, insurance policies and receipts all use it (with `<PdfCard>` for the buttons), so a
 * fix to saving or sharing lands everywhere at once.
 *
 * The PDF is made the first time a button needs it and kept while the document stays the same. A PDF that failed to build is not
 * kept (the next press tries again) and is reported with its real reason; so is a failed share.
 */
export function usePdfDocument(source: PdfSource | null) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null); // the technical reason, in small type
  const [notice, setNotice] = useState<string | null>(null);
  const cache = useRef<{ html: string; fileName: string; pdf: PdfFile | null } | null>(null);

  async function prepare(src: PdfSource, needPdf: boolean) {
    const kept = cache.current;
    if (kept && kept.html === src.html && kept.fileName === src.fileName) return kept;
    let pdf: PdfFile | null = null;
    let reason: string | null = null;
    try {
      pdf = await makePdfFile(src.html, src.fileName);
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
    if (!isWeb && !pdf && needPdf) throw new PdfBuildError(reason ?? 'no file was produced');
    const made = { html: src.html, fileName: src.fileName, pdf };
    if (pdf || isWeb) cache.current = made;
    return made;
  }

  async function run(kind: string, work: (file: { html: string; pdf: PdfFile | null }, src: PdfSource) => Promise<void>, needPdf = true) {
    if (!source) return;
    setBusy(kind);
    setError(null);
    setDetail(null);
    setNotice(null);
    try {
      await work(await prepare(source, needPdf), source);
    } catch (e) {
      setError(e instanceof PdfBuildError ? t('files.pdfFailed') : kind === 'share' ? t('files.shareFailed') : t('errors.generic'));
      setDetail(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return {
    ready: source !== null,
    busy,
    error,
    detail,
    notice,
    view: () => run('view', (f, s) => viewPdf(f.pdf, f.html, s.title)),
    share: () => run('share', (f, s) => sharePdf(f.pdf, f.html, s.title)),
    print: () => run('print', (f) => printDialog(f.html), false),
    save: () =>
      run('save', async (f, s) => {
        if ((await saveToPhone(f.pdf, f.html, s.fileName)) === 'saved' && !isWeb) setNotice(t('files.saved'));
      }),
  };
}
