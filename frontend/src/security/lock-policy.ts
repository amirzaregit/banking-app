/** How long the app may sit in the background before it asks for your fingerprint again. */
export const LOCK_AFTER_MS = 30_000;

/**
 * Pure rule, easy to test: should the app lock when it returns to the foreground?
 * A grace period avoids locking you out for a quick glance at another app, and also stops the
 * system fingerprint prompt (which briefly backgrounds the app) from instantly re-locking it.
 */
export function shouldLock(opts: {
  enabled: boolean;
  backgroundedAt: number | null;
  now: number;
  graceMs?: number;
}): boolean {
  const { enabled, backgroundedAt, now, graceMs = LOCK_AFTER_MS } = opts;
  if (!enabled || backgroundedAt === null) return false;
  return now - backgroundedAt >= graceMs;
}
