declare module 'pg' {
  export interface QueryResult<Row = unknown> {
    rows: Row[];
  }

  export class Pool {
    constructor(config?: { connectionString?: string; ssl?: unknown });
    query<Row = unknown>(text: string, params?: unknown[]): Promise<QueryResult<Row>>;
    end(): Promise<void>;
  }
}
