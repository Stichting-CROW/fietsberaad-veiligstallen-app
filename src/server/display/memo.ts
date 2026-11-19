const store = new Map<string, { expires: number; value: unknown }>();

const DEFAULT_TTL_MS = 15_000;

export function memoGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function memoSet(key: string, value: unknown, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export async function memoFetch<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const cached = memoGet<T>(key);
  if (cached !== undefined) return cached;
  const value = await fn();
  memoSet(key, value, ttlMs);
  return value;
}
