/**
 * 데이터베이스 연결 및 쿼리 관련 타입 정의
 */

// 기본 데이터베이스 연결 인터페이스 (실제 구현체에 맞춰 수정)
export interface DatabaseConnection {
  // 실제 구현된 메서드들
  run: (sql: string, params?: any[]) => Promise<any>;
  get: (sql: string, params?: any[]) => Promise<any>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
  batch: (operations: Array<{sql: string, params?: any[]}>) => Promise<any[]>;
  
  // 쿼리 실행 메서드 (호환성을 위해 추가)
  query<T = any>(sql: string, params?: any[]): Promise<T>;
  
  // 트랜잭션 관련 메서드
  beginTransaction?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
  
  // 연결 관리
  close?(): Promise<void>;
  isConnected?(): boolean;
  
  // 스키마 관련
  createTable?(tableName: string, schema: string): Promise<void>;
  dropTable?(tableName: string): Promise<void>;
  
  // 유틸리티 메서드
  escape?(value: any): string;
  lastInsertId?(): number | string;
}

// 쿼리 결과 타입
export interface QueryResult<T = any> {
  data: T[];
  total?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
}

// 데이터베이스 설정
export interface DatabaseConfig {
  path: string;
  readonly?: boolean;
  timeout?: number;
  memory?: boolean;
  verbose?: boolean;
}

// 쿼리 옵션
export interface QueryOptions {
  timeout?: number;
  retries?: number;
  transaction?: boolean;
}

// 페이징 옵션
export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
}

// 정렬 옵션
export interface SortOptions {
  field: string;
  direction: 'ASC' | 'DESC';
}

// 검색 필터 옵션
export interface FilterOptions {
  [key: string]: any;
}

// 데이터베이스 연결 상태
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

// 연결 상태 정보
export interface ConnectionInfo {
  status: ConnectionStatus;
  lastConnection?: Date;
  errorMessage?: string;
  version?: string;
}
