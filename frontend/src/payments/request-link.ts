/** A pasted link, a scanned QR code or the bare code -> the request's token. Payment links look like
 *  https://demo-bank.example/pay/<token>; anything after the last "/" (and before "?" or "#") is the token. */
export function tokenFromText(text: string): string | null {
  const cleaned = text.trim().split(/[?#]/)[0].replace(/\/+$/, '');
  const token = cleaned.slice(cleaned.lastIndexOf('/') + 1);
  return /^[A-Za-z0-9_-]{8,40}$/.test(token) ? token : null;
}
