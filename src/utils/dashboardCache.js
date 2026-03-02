/**
 * dashboardCache.js
 * ──────────────────────────────────────────────────────────────────────────
 * Thin localStorage cache for dashboard data.
 *
 * Pattern used everywhere: stale-while-revalidate
 *   1. Load cached snapshot immediately → graphs stay populated offline /
 *      on slow connections.
 *   2. Fetch fresh data in the background.
 *   3. On success  → update state + overwrite cache.
 *   4. On failure  → state already holds cached data, nothing goes blank.
 *
 * TTL is soft — stale entries are still returned (caller decides whether to
 * skip the background refresh).  This means a hard-refresh after the TTL
 * will still show last-known data until the new fetch resolves.
 * ──────────────────────────────────────────────────────────────────────────
 */

const CACHE_PREFIX = "erp_dash_";
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Read a cached entry.
 * @param {string} key
 * @returns {{ data: any, isStale: boolean, cachedAt: number } | null}
 */
export function getCached(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const { data, expiresAt, cachedAt } = parsed || {};
    if (data === undefined) return null;
    return {
      data,
      cachedAt: Number(cachedAt || 0),
      isStale: Date.now() > Number(expiresAt || 0),
    };
  } catch {
    return null;
  }
}

/**
 * Write a cache entry.
 * @param {string} key
 * @param {any}    data
 * @param {number} [ttlMs]
 */
export function setCached(key, data, ttlMs = DEFAULT_TTL_MS) {
  try {
    const now = Date.now();
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ data, cachedAt: now, expiresAt: now + ttlMs }),
    );
  } catch {
    // localStorage quota exceeded or unavailable — fail silently
  }
}

/**
 * Remove a single cache entry.
 * @param {string} key
 */
export function clearCached(key) {
  try {
    localStorage.removeItem(CACHE_PREFIX + key);
  } catch {}
}

/**
 * Remove ALL erp_dash_* entries (e.g. on logout / db-mode switch).
 */
export function clearAllDashboardCache() {
  try {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(CACHE_PREFIX),
    );
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

/**
 * Human-readable "last updated X ago" label from a cachedAt timestamp.
 * @param {number} cachedAt  — unix ms
 * @returns {string}
 */
export function cacheAgeLabel(cachedAt) {
  if (!cachedAt) return "";
  const diffMs = Date.now() - cachedAt;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}
