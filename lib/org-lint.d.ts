export type LintSeverity = 'info' | 'warning' | 'suggestion';

export type LibraryLintIssue = {
  type: string;
  severity: LintSeverity;
  detail: string;
  suggestion?: string;
};

export type LibraryDeckRow = {
  id: string;
  name: string;
  cardCount: number;
};

export type LibraryCategoryRow = {
  deckId: string;
  deckName: string;
  category: string;
  cardCount: number;
};

export type LibraryUncategorizedRow = {
  deckId: string;
  deckName: string;
  cardCount: number;
};

export type LibraryLintInput = {
  decks: LibraryDeckRow[];
  categories: LibraryCategoryRow[];
  uncategorized?: LibraryUncategorizedRow[];
};

export type LibraryLintResult = {
  summary: {
    total_decks: number;
    total_cards: number;
    total_categories: number;
    total_uncategorized: number;
    total_issues: number;
  };
  issues: LibraryLintIssue[];
};

export declare const NEAR_DUPLICATE_THRESHOLD: number;
export declare function normalizeName(s: string): string;
export declare function nameSimilarity(a: string, b: string): number;
export declare function lintLibraryOrganization(input: LibraryLintInput): LibraryLintResult;
