/**
 * Represents a single import execution.
 * Used for traceability, auditing, and import history.
 */
export type ImportSessionStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface ImportSession {
  readonly filename: string;
  readonly importDate: Date;
  readonly status: ImportSessionStatus;
  readonly recordsImported: number;
  readonly errors: number;
}