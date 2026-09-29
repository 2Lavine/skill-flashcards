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
 * Same catalog field, misspelled — not a related longer name.
 * - one substitution, same length (心里学 / 心理学)
 * - one extra trailing character (博弈 / 博弈论)
 * Does NOT treat a longer different word as drift (心理学 / 心理咨询,
 * 心理学 / 应用心理学).
 */
export function isNearNormalizedCatalogName(nn, np) {
  if (!nn || !np || nn === np) return false;
  if (nn.length === np.length && nn.length >= 2 && catalogEditDistance(nn, np) <= 1) {
    return true;
  }
  const short = nn.length <= np.length ? nn : np;
  const long = nn.length <= np.length ? np : nn;
  return short.length >= 2 && long.length === short.length + 1 && long.startsWith(short);
}

/**
 * First near-match in pool for the same field spelled differently.
 */
export function findNearCatalogName(name, pool) {
  const nn = normalizeCatalogName(name);
  if (!nn) return undefined;
  for (const p of pool) {
    if (isNearNormalizedCatalogName(nn, normalizeCatalogName(p))) return p;
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
  return pool.filter((p) => isNearNormalizedCatalogName(nn, normalizeCatalogName(p)));
}
