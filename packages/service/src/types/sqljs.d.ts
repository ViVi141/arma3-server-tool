declare module "sql.js" {
  type SqlJsValue = number | string | Uint8Array | null;
  interface QueryExecResult {
    columns: string[];
    values: SqlJsValue[][];
  }
  interface Database {
    run(sql: string, params?: unknown[]): Database;
    exec(sql: string, params?: unknown[]): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }
  interface Statement {
    run(params?: unknown[]): Statement;
    get(params?: unknown[]): Record<string, unknown>;
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getAsObject(params?: unknown[]): Record<string, unknown>;
    free(): boolean;
  }
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }
  export { Database, QueryExecResult, SqlJsValue, SqlJsStatic };
  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
}
