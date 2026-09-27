export interface RowValidationResult<T> {
  rowNumber: number;
  raw: Record<string, string>;
  status: "valid" | "invalid";
  reasons: string[];
  resolved?: T;
}

export interface DryRunSummary<T> {
  rows: RowValidationResult<T>[];
  validCount: number;
  invalidCount: number;
  /** true when the store's profile disables this create action entirely —
   * short-circuits before any row validation, mirroring createProduct's/
   * createCategory's own feature-flag check ordering (flag before writes). */
  featureBlocked: boolean;
  featureBlockedMessage?: string;
}

export interface CommitRowResult {
  rowNumber: number;
  success: boolean;
  id?: string;
  error?: string;
}

export interface CommitSummary {
  results: CommitRowResult[];
}
