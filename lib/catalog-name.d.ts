export declare function normalizeCatalogName(s: string): string;
export declare function catalogEditDistance(a: string, b: string): number;
export declare function findNearCatalogName(
  name: string,
  pool: readonly string[],
): string | undefined;
export declare function catalogNameExists(
  name: string,
  pool: readonly string[],
): boolean;
export declare function findNearCatalogNames(
  name: string,
  pool: readonly string[],
): string[];
