/**
 * Pure catalog name matching for deck/category drift detection.
 *
 * Standalone skill package mirror of monorepo `@sourcards/shared` catalog-name.
 * Keep behavior aligned — monorepo shell-contracts / shared tests pin both sides.
 * No DB / network.
 */

/** Normalize for fuzzy compare: strip whitespace/punctuation, casefold. */
export function normalizeCatalogName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s/·・:：_\-—、,，.。]/g, '')
    .trim();
}

/** Cheap Levenshtein; short-circuits when |m-n| > 1 (we only care about ≤1). */
export function catalogEditDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return 2;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * First near-match in pool for the same field spelled/spaced differently.
 */
export function findNearCatalogName(name, pool) {
  const nn = normalizeCatalogName(name);
  if (!nn) return undefined;
  for (const p of pool) {
    const np = normalizeCatalogName(p);
    if (!np || np === nn) continue;
    if (np.includes(nn) || nn.includes(np)) return p;
    const short = Math.min(nn.length, np.length);
    if (short >= 2 && nn.slice(0, short) === np.slice(0, short)) return p;
    if (catalogEditDistance(nn, np) <= 1) return p;
  }
  return undefined;
}

export function catalogNameExists(name, pool) {
  const nn = normalizeCatalogName(name);
  if (!nn) return false;
  return pool.some((p) => normalizeCatalogName(p) === nn);
}

/** All near-matches (import skill catalog cross-check lists multiples). */
export function findNearCatalogNames(name, pool) {
  const nn = normalizeCatalogName(name);
  if (!nn) return [];
  return pool.filter((p) => {
    const np = normalizeCatalogName(p);
    if (!np || np === nn) return false;
    if (np.includes(nn) || nn.includes(np)) return true;
    const short = Math.min(nn.length, np.length);
    if (short >= 2 && nn.slice(0, short) === np.slice(0, short)) return true;
    return catalogEditDistance(nn, np) <= 1;
  });
}
