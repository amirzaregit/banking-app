import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';

/** A PDF made on the phone: the file to use, other copies of the same file to fall back to, and the same bytes as base64. */
export type PdfFile = {
  uri: string;
  base64: string;
  /** The same PDF in other places. The share sheet only reads some folders (which ones depends on the phone and on Expo Go), so every copy gets a try. */
  alternates?: string[];
};

/** The files to try, nicest first, without repeating one. */
const candidates = (pdf: PdfFile): string[] => [...new Set([pdf.uri, ...(pdf.alternates ?? [])])];

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Draw the document into a PDF on the phone (nothing is uploaded). If the phone's print engine refuses the page-size
 * options, it tries again with its defaults, and if that fails too it throws an error that includes BOTH reasons.
 * The print engine leaves the file in its own temporary folder under a random name. To give the receiver a real file name,
 * the same bytes are also written under that name in the app's cache, in two ways (the older file API, which is what share
 * sheets are most used to, and the newer one). Which copy a phone lets the share sheet read differs, so all copies are kept
 * and `sharePdf` tries them in turn. The web has no file, so it returns null.
 */
export async function makePdfFile(html: string, fileName: string): Promise<PdfFile | null> {
  if (isWeb) return null;
  const printed = await printToFile(html);
  const copies: string[] = [];
  try {
    if (LegacyFileSystem.cacheDirectory && printed.base64) {
      const target = `${LegacyFileSystem.cacheDirectory}${fileName}`;
      await LegacyFileSystem.writeAsStringAsync(target, printed.base64, { encoding: LegacyFileSystem.EncodingType.Base64 });
      copies.push(target);
    }
  } catch {
    // a nicety: the other copies still work
  }
  try {
    const named = new File(Paths.cache, fileName);
    if (named.exists) named.delete();
    await new File(printed.uri).copy(named);
    copies.push(named.uri);
  } catch {
    // the original file is still there
  }
  // Only files that really are PDFs may be handed to the share sheet: a PDF starts with "%PDF" (JVBER in base64). A share
  // target that gets anything else answers "unsupported file format".
  const checked = await Promise.all([...copies, printed.uri].map(async (uri) => ({ uri, ...(await inspect(uri)) })));
  const valid = checked.filter((c) => c.pdf !== false); // unreadable by this check (null) is kept: only a file seen not to be a PDF is dropped
  if (valid.length === 0) {
    throw new Error(`The file is not a PDF: ${checked.map((c) => `${c.uri} (${c.size ?? '?'} bytes, starts with "${c.head}")`).join(' | ')}`);
  }
  const [first, ...rest] = valid.map((c) => c.uri);
  return { uri: first, base64: printed.base64, alternates: rest };
}

/** What is really in the file: its size, its first characters, and whether that is how a PDF begins (null: could not be looked at). */
async function inspect(uri: string): Promise<{ pdf: boolean | null; size: number | null; head: string }> {
  try {
    const info = await LegacyFileSystem.getInfoAsync(uri);
    const size = info.exists ? (info.size ?? null) : null;
    const base64 = await LegacyFileSystem.readAsStringAsync(uri, { encoding: LegacyFileSystem.EncodingType.Base64, position: 0, length: 6 });
    const head = base64.startsWith('JVBER') ? '%PDF' : base64.slice(0, 8);
    return { pdf: base64.startsWith('JVBER') && (size ?? 1) > 0, size, head };
  } catch (e) {
    return { pdf: null, size: null, head: messageOf(e) }; // could not look: say nothing against the file
  }
}

async function printToFile(html: string): Promise<PdfFile> {
  const toFile = (r: { uri: string; base64?: string }): PdfFile => ({ uri: r.uri, base64: r.base64 ?? '' });
  try {
    return toFile(await Print.printToFileAsync({ html, width: 595, height: 842, base64: true })); // A4 in points
  } catch (first) {
    try {
      return toFile(await Print.printToFileAsync({ html, base64: true }));
    } catch (second) {
      throw new Error(`${messageOf(first)} | ${messageOf(second)}`);
    }
  }
}

export type SaveResult = 'saved' | 'cancelled';

/**
 * Save the PDF into a folder the customer picks (Downloads, Documents, ...). With no PDF file (the web, or a phone whose
 * PDF step failed) it opens the system print dialog instead, which has "Save as PDF".
 */
export async function saveToPhone(pdf: PdfFile | null, html: string, fileName: string): Promise<SaveResult> {
  if (isWeb || !pdf) {
    await Print.printAsync({ html });
    return 'saved';
  }
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return 'cancelled'; // the customer closed the folder picker
  }
  const target = folder.createFile(fileName, 'application/pdf');
  if (pdf.base64) await target.write(pdf.base64, { encoding: 'base64' });
  else await target.write(new Uint8Array(await new File(pdf.uri).arrayBuffer()));
  return 'saved';
}

/** The phone's share sheet for the PDF (send it, save it to Drive, print it...). */
export async function sharePdf(pdf: PdfFile | null, html: string, title: string): Promise<void> {
  if (isWeb || !pdf) {
    await Print.printAsync({ html });
    return;
  }
  const reasons: string[] = [];
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone'); // never fail silently
  for (const uri of candidates(pdf)) {
    try {
      return await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
    } catch (e) {
      reasons.push(`${uri}: ${messageOf(e)}`);
    }
  }
  throw new Error(reasons.join(' | '));
}

/** The system print screen: it previews the certificate and offers "Save as PDF". It needs no PDF file and no sharing. */
export async function printDialog(html: string): Promise<void> {
  await Print.printAsync({ html });
}

/**
 * Look at the PDF now. Tries, in order: the phone's own file preview, the share sheet (which lists apps that can open a
 * PDF), and the system print screen (which previews it). Throws an error naming every reason only if all three fail.
 */
export async function viewPdf(pdf: PdfFile | null, html: string, title: string): Promise<void> {
  if (isWeb || !pdf) {
    await Print.printAsync({ html });
    return;
  }
  const reasons: string[] = [];
  for (const uri of candidates(pdf)) {
    try {
      const file = new File(uri);
      if (await file.canPreview()) return await file.preview();
      reasons.push('preview: not available for PDFs on this phone');
    } catch (e) {
      reasons.push(`preview: ${messageOf(e)}`);
    }
  }
  for (const uri of candidates(pdf)) {
    try {
      if (await Sharing.isAvailableAsync()) return await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
      reasons.push('share: not available');
      break;
    } catch (e) {
      reasons.push(`share ${uri}: ${messageOf(e)}`);
    }
  }
  for (const uri of candidates(pdf)) {
    try {
      return await Print.printAsync({ uri });
    } catch (e) {
      reasons.push(`print: ${messageOf(e)}`);
    }
  }
  throw new Error(reasons.join(' | '));
}
