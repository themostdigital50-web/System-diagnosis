/** Small TTL cache for OS facts that do not change from one request to the next. */
export function createTtlCache(ttlMs: number) {
  const entries = new Map<string, { at: number; value: unknown }>();

  return async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const value = await loader();
    entries.set(key, { at: Date.now(), value });
    return value;
  };
}

export interface Cached<T> {
  value: T;
  collectedAt: string;
}

/**
 * Coalesces concurrent calls and serves a short-lived cached result.
 * Expensive OS/network probes are never run twice for overlapping polls.
 */
export function cached<T>(ttlMs: number, producer: () => Promise<T>): () => Promise<Cached<T>> {
  let entry: Cached<T> | null = null;
  let expiresAt = 0;
  let inFlight: Promise<Cached<T>> | null = null;

  return async () => {
    const now = Date.now();
    if (entry && now < expiresAt) return entry;
    if (inFlight) return inFlight;

    inFlight = producer()
      .then((value) => {
        entry = { value, collectedAt: new Date().toISOString() };
        expiresAt = Date.now() + ttlMs;
        return entry;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}
