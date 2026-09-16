// ─── PLG growth analytics — result cache ─────────────────────────────────────
//
// A 30-day cohort reads every real session, search, play and download of the
// month and takes ~13s on prod. The Growth views ask for the same window many
// times in a row (the funnel, its previous period, the insights built on both),
// so results are kept in-process for a few minutes and concurrent identical
// requests share one query instead of racing.
//
// Per process, not shared: two API instances each warm their own. That is fine
// for an internal dashboard, and it means a deploy always starts clean.

interface Entry {
  at: number;
  ttl: number;
  value: Promise<unknown>;
}

const MAX_ENTRIES = 300;
const store = new Map<string, Entry>();

/**
 * How long a result may be reused. A window that includes today is still
 * filling, so it is kept briefly; a closed window cannot change except by a
 * backfill, so it is kept longer.
 */
export const ttlFor = (endDate: string, todayIst: string): number =>
  endDate >= todayIst ? 3 * 60_000 : 30 * 60_000;

export const todayIst = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const memo = <T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T> => {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < hit.ttl) return hit.value as Promise<T>;

  const value = run();
  store.set(key, { at: now, ttl: ttlMs, value });
  // A failure must not be cached — the next request retries.
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });

  if (store.size > MAX_ENTRIES) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, store.size - MAX_ENTRIES);
    for (const [k] of oldest) store.delete(k);
  }
  return value;
};

/** A stable key for a filter object. */
export const keyOf = (name: string, params: Record<string, unknown>): string =>
  `${name}:${JSON.stringify(Object.keys(params).sort().map((k) => [k, params[k] ?? null]))}`;
