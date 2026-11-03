export interface SqlResult<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes: number };
}
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<SqlResult<T>>;
  run(): Promise<SqlResult>;
}
export interface Database {
  prepare(sql: string): SqlStatement;
  batch(statements: SqlStatement[]): Promise<SqlResult[]>;
}
