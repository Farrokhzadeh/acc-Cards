declare module "pg" {
  export interface QueryResult<R = Record<string, unknown>> {
    command: string;
    rowCount: number | null;
    rows: R[];
  }

  export interface Queryable {
    query<R = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
  }

  export interface PoolClient extends Queryable {
    release(err?: Error | boolean): void;
  }

  export interface PoolConfig {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean | { rejectUnauthorized?: boolean };
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    statement_timeout?: number;
    application_name?: string;
  }

  export class Pool implements Queryable {
    constructor(config?: PoolConfig);
    query<R = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    on(event: "error", listener: (error: Error) => void): this;
  }
}
