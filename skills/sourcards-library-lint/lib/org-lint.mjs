/**
 * Pure library organization lint (Single Source of Truth).
 *
 * Used by:
 * - skills/sourcards-library-lint (outer agents / CLI)
 * - SourCards server lint_cards tool (in-app Coach)
 *
 * No DB / network — pass pre-aggregated deck/category counts.
 */

/**
 * @typedef {'info' | 'warning' | 'suggestion'} LintSeverity
 * @typedef {{ type: string, severity: LintSeverity, detail: string, suggestion?: string }} LibraryLintIssue
 * @typedef {{ id: string, name: string, cardCount: number }} LibraryDeckRow
 * @typedef {{ deckId: string, deckName: string, category: string, cardCount: number }} LibraryCategoryRow
 * @typedef {{ deckId: string, deckName: string, cardCount: number }} LibraryUncategorizedRow
 * @typedef {{
 *   decks: LibraryDeckRow[],
 *   categories: LibraryCategoryRow[],
 *   uncategorized?: LibraryUncategorizedRow[],
 * }} LibraryLintInput
 * @typedef {{
 *   summary: {
 *     total_decks: number,
 *     total_cards: number,
 *     total_categories: number,
 *     total_uncategorized: number,
 *     total_issues: number,
 *   },
 *   issues: LibraryLintIssue[],
 * }} LibraryLintResult
 */

/** @param {string} s */
export function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bigram-overlap similarity, 0–1. @param {string} a @param {string} b */
export function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const bigramsA = new Set();
  const bigramsB = new Set();
  for (let i = 0; i < na.length - 1; i++) bigramsA.add(na.slice(i, i + 2));
  for (let i = 0; i < nb.length - 1; i++) bigramsB.add(nb.slice(i, i + 2));
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  let overlap = 0;
  for (const bg of bigramsA) if (bigramsB.has(bg)) overlap += 1;
  return overlap / Math.max(bigramsA.size, bigramsB.size);
}

export const NEAR_DUPLICATE_THRESHOLD = 0.7;

/**
 * Organizational lint over aggregated library rows.
 * @param {LibraryLintInput} input
 * @returns {LibraryLintResult}
 */
export function lintLibraryOrganization(input) {
  const decks = Array.isArray(input?.decks) ? input.decks : [];
  const categories = Array.isArray(input?.categories) ? input.categories : [];
  const uncategorized = Array.isArray(input?.uncategorized) ? input.uncategorized : [];

  /** @type {LibraryLintIssue[]} */
  const issues = [];
  const deckMap = new Map(decks.map((d) => [d.id, d]));

  for (const deck of decks) {
    if (deck.cardCount === 0 && deck.name !== 'Default') {
      issues.push({
        type: 'empty_deck',
        severity: 'warning',
        detail: `Deck "${deck.name}" is empty (0 cards).`,
        suggestion: `Delete the empty deck "${deck.name}" via Settings > Deck Management.`,
      });
    }
  }

  for (const deck of decks) {
    if (deck.cardCount === 1) {
      issues.push({
        type: 'single_card_deck',
        severity: 'suggestion',
        detail: `Deck "${deck.name}" has only 1 card.`,
        suggestion: `Move that card to another deck and delete "${deck.name}" via Settings > Deck Management.`,
      });
    }
  }

  for (let i = 0; i < decks.length; i++) {
    for (let j = i + 1; j < decks.length; j++) {
      const d1 = decks[i];
      const d2 = decks[j];
      const sim = nameSimilarity(d1.name, d2.name);
      if (sim >= NEAR_DUPLICATE_THRESHOLD) {
        issues.push({
          type: 'duplicate_deck_name',
          severity: 'warning',
          detail: `Decks "${d1.name}" (${d1.cardCount} cards) and "${d2.name}" (${d2.cardCount} cards) are very similar (similarity: ${(sim * 100).toFixed(0)}%).`,
          suggestion: `Consider merging "${d1.name}" into "${d2.name}" (or vice versa) via Settings > Deck Management > Merge.`,
        });
      }
    }
  }

  for (const deck of decks) {
    if (deck.cardCount >= 2 && deck.cardCount <= 3) {
      issues.push({
        type: 'small_deck',
        severity: 'info',
        detail: `Deck "${deck.name}" has only ${deck.cardCount} cards.`,
        suggestion: `Consider merging this small deck into a related larger deck via Settings > Deck Management.`,
      });
    }
  }

  for (const row of categories) {
    if (row.cardCount <= 2) {
      issues.push({
        type: 'small_category',
        severity: 'info',
        detail: `Category "${row.category}" in deck "${row.deckName}" has only ${row.cardCount} card${row.cardCount === 1 ? '' : 's'}.`,
        suggestion: `Consider merging this category into a related one or removing the category label from these cards via Settings > Deck Management > Rename Category.`,
      });
    }
  }

  /** @type {Map<string, Array<{ name: string, count: number }>>} */
  const catByDeck = new Map();
  for (const row of categories) {
    if (!catByDeck.has(row.deckId)) catByDeck.set(row.deckId, []);
    catByDeck.get(row.deckId).push({ name: row.category, count: row.cardCount });
  }
  for (const [deckId, cats] of catByDeck) {
    const deckName = deckMap.get(deckId)?.name ?? 'unknown';
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        const c1 = cats[i];
        const c2 = cats[j];
        const sim = nameSimilarity(c1.name, c2.name);
        if (sim >= NEAR_DUPLICATE_THRESHOLD) {
          issues.push({
            type: 'duplicate_category_name',
            severity: 'warning',
            detail: `Categories "${c1.name}" (${c1.count} cards) and "${c2.name}" (${c2.count} cards) in deck "${deckName}" are very similar (similarity: ${(sim * 100).toFixed(0)}%).`,
            suggestion: `Consider merging "${c1.name}" into "${c2.name}" (or vice versa) via Settings > Deck Management > Rename Category.`,
          });
        }
      }
    }
  }

  /** @type {Map<string, Array<{ deckName: string, count: number }>>} */
  const catAcrossDecks = new Map();
  for (const row of categories) {
    if (!catAcrossDecks.has(row.category)) catAcrossDecks.set(row.category, []);
    catAcrossDecks.get(row.category).push({ deckName: row.deckName, count: row.cardCount });
  }
  for (const [catName, deckList] of catAcrossDecks) {
    if (deckList.length >= 2) {
      const rendered = deckList.map((d) => `"${d.deckName}" (${d.count} cards)`).join(', ');
      issues.push({
        type: 'cross_deck_category',
        severity: 'info',
        detail: `Category "${catName}" appears in ${deckList.length} decks: ${rendered}.`,
        suggestion: `If "${catName}" is meant to be a cross-deck topic, this is fine. Otherwise, consider renaming to make the context clear per deck.`,
      });
    }
  }

  const totalUncategorized = uncategorized.reduce((a, r) => a + (r.cardCount || 0), 0);

  return {
    summary: {
      total_decks: decks.length,
      total_cards: decks.reduce((a, d) => a + (d.cardCount || 0), 0),
      total_categories: categories.length,
      total_uncategorized: totalUncategorized,
      total_issues: issues.length,
    },
    issues,
  };
}
