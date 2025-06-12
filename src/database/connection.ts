import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DatabaseConnection {
  run: (sql: string, params?: any[]) => Promise<any>;
  get: (sql: string, params?: any[]) => Promise<any>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
  close: () => Promise<void>;
  batch: (operations: Array<{sql: string, params?: any[]}>) => Promise<any[]>;
}

// 연결 캐시 인터페이스
interface CachedConnection {
  db: Database.Database;
  lastUsed: number;
  useCount: number;
}

class DatabaseManager {
  private static instance: DatabaseManager;
  private dbPath: string;
  private connectionCache: CachedConnection | null = null;
  private readonly CACHE_TTL = 30000; // 30초 캐시 유지
  private readonly MAX_USE_COUNT = 100; // 최대 100회 사용 후 갱신
  private cleanupTimer: NodeJS.Timeout | null = null;

  private constructor() {
    // 환경변수가 설정되어 있으면 우선 사용
    const workMemoryDir = process.env.WORK_MEMORY_DIR;
    
    if (workMemoryDir) {
      // 환경변수로 완전한 경로가 지정된 경우
      const dbFileName = process.env.DB_FILENAME || 'database.sqlite';
      this.dbPath = path.join(workMemoryDir, dbFileName);
    } else {
      // 환경변수가 없을 때만 상대 경로 사용
      const workMemoryDirRel = 'work_memory';
      const dbFileName = 'database.sqlite';
      this.dbPath = path.join(process.cwd(), workMemoryDirRel, dbFileName);
    }
    
    // 정리 타이머 시작
    this.startCleanupTimer();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * 최적화된 SQLite 연결 생성
   */
  private createOptimizedDatabase(): Database.Database {
    const db = new Database(this.dbPath);
    
    // 성능 최적화 PRAGMA 설정
    db.pragma('journal_mode = WAL');        // WAL 모드로 동시성 향상
    db.pragma('synchronous = NORMAL');      // 안전성과 성능의 균형
    db.pragma('cache_size = -64000');       // 64MB 캐시 (메모리 사용)
    db.pragma('temp_store = MEMORY');       // 임시 데이터를 메모리에
    db.pragma('mmap_size = 268435456');     // 256MB 메모리 맵 사용
    db.pragma('optimize');                  // 통계 정보 최적화
    
    // 멀티클라이언트 환경을 위한 설정
    db.pragma('busy_timeout = 5000');       // 5초 대기 후 에러
    db.pragma('wal_autocheckpoint = 1000'); // 1000 페이지마다 체크포인트
    
    return db;
  }

  /**
   * 연결 캐시 관리
   */
  private getCachedConnection(): Database.Database | null {
    if (!this.connectionCache) return null;
    
    const now = Date.now();
    const isExpired = (now - this.connectionCache.lastUsed) > this.CACHE_TTL;
    const isOverused = this.connectionCache.useCount >= this.MAX_USE_COUNT;
    
    if (isExpired || isOverused) {
      // 캐시된 연결 정리
      try {
        this.connectionCache.db.close();
      } catch (e) {
        // 이미 닫혀있을 수 있음
      }
      this.connectionCache = null;
      return null;
    }
    
    // 사용 통계 업데이트
    this.connectionCache.lastUsed = now;
    this.connectionCache.useCount++;
    
    return this.connectionCache.db;
  }

  /**
   * 새 연결 생성 및 캐싱
   */
  private getOrCreateConnection(): Database.Database {
    // 캐시된 연결 확인
    const cached = this.getCachedConnection();
    if (cached) return cached;
    
    // 새 연결 생성
    const db = this.createOptimizedDatabase();
    
    // 캐시에 저장
    this.connectionCache = {
      db,
      lastUsed: Date.now(),
      useCount: 1
    };
    
    return db;
  }

  /**
   * 정리 타이머 시작
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      if (this.connectionCache) {
        const now = Date.now();
        const isExpired = (now - this.connectionCache.lastUsed) > this.CACHE_TTL;
        
        if (isExpired) {
          try {
            this.connectionCache.db.close();
          } catch (e) {
            // 이미 닫혀있을 수 있음
          }
          this.connectionCache = null;
        }
      }
    }, this.CACHE_TTL / 2); // 15초마다 정리 확인
  }

  public async initialize(): Promise<DatabaseConnection> {
    // work_memory 디렉토리가 없으면 생성
    const workMemoryDir = path.dirname(this.dbPath);
    if (!fs.existsSync(workMemoryDir)) {
      fs.mkdirSync(workMemoryDir, { recursive: true });
    }

    // 연결 객체 반환
    return this.createConnection();
  }

  private createConnection(): DatabaseConnection {
    const run = async (sql: string, params?: any[]): Promise<any> => {
      const db = this.getOrCreateConnection();
      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(...(params || []));
        return result;
      } catch (error) {
        // 연결 오류 시 캐시 무효화
        if (this.connectionCache) {
          try {
            this.connectionCache.db.close();
          } catch (e) {}
          this.connectionCache = null;
        }
        throw error;
      }
    };

    const get = async (sql: string, params?: any[]): Promise<any> => {
      const db = this.getOrCreateConnection();
      try {
        const stmt = db.prepare(sql);
        const result = stmt.get(...(params || []));
        return result;
      } catch (error) {
        // 연결 오류 시 캐시 무효화
        if (this.connectionCache) {
          try {
            this.connectionCache.db.close();
          } catch (e) {}
          this.connectionCache = null;
        }
        throw error;
      }
    };

    const all = async (sql: string, params?: any[]): Promise<any[]> => {
      const db = this.getOrCreateConnection();
      try {
        const stmt = db.prepare(sql);
        const result = stmt.all(...(params || []));
        return result || [];
      } catch (error) {
        // 연결 오류 시 캐시 무효화
        if (this.connectionCache) {
          try {
            this.connectionCache.db.close();
          } catch (e) {}
          this.connectionCache = null;
        }
        throw error;
      }
    };

    const batch = async (operations: Array<{sql: string, params?: any[]}>): Promise<any[]> => {
      const db = this.getOrCreateConnection();
      try {
                 const transaction = db.transaction(() => {
           const results: any[] = [];
           for (const op of operations) {
             const stmt = db.prepare(op.sql);
             results.push(stmt.run(...(op.params as any[] || [])));
           }
           return results;
         });
        
        return transaction();
      } catch (error) {
        // 연결 오류 시 캐시 무효화
        if (this.connectionCache) {
          try {
            this.connectionCache.db.close();
          } catch (e) {}
          this.connectionCache = null;
        }
        throw error;
      }
    };

    const close = async (): Promise<void> => {
      // 캐시된 연결은 타이머가 관리하므로 즉시 닫지 않음
      return Promise.resolve();
    };

    return {
      run,
      get,
      all,
      batch,
      close
    };
  }

  public async close(): Promise<void> {
    // 정리 타이머 중지
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // 캐시된 연결 정리
    if (this.connectionCache) {
      try {
        this.connectionCache.db.close();
      } catch (e) {
        // 이미 닫혀있을 수 있음
      }
      this.connectionCache = null;
    }
  }

  public getConnection(): DatabaseConnection {
    return this.createConnection();
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  // 상태 확인용 메서드
  public getConnectionStats(): { cached: boolean; useCount: number; age: number } {
    if (!this.connectionCache) {
      return { cached: false, useCount: 0, age: 0 };
    }
    
    return {
      cached: true,
      useCount: this.connectionCache.useCount,
      age: Date.now() - this.connectionCache.lastUsed
    };
  }
}

export { DatabaseManager };
export const databaseManager = DatabaseManager.getInstance();
export default databaseManager; 