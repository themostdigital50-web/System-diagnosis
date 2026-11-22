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
