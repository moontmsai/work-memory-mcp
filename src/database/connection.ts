import sqlite3 from 'sqlite3';
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
  query: <T = any>(sql: string, params?: any[]) => Promise<T>;
}

interface CachedConnection {
  db: sqlite3.Database;
  lastUsed: number;
  useCount: number;
}

class DatabaseManager {
  private static instance: DatabaseManager;
  private dbPath: string;
  private connectionCache: CachedConnection | null = null;
  private readonly CACHE_TTL = 30000;
  private readonly MAX_USE_COUNT = 100;
  private cleanupTimer: NodeJS.Timeout | null = null;

  private constructor() {
    const workMemoryDir = process.env.WORK_MEMORY_DIR;
    
    if (workMemoryDir) {
      const dbFileName = process.env.DB_FILENAME || 'database.sqlite';
      this.dbPath = path.join(workMemoryDir, dbFileName);
    } else {
      const workMemoryDirRel = 'work_memory';
      const dbFileName = 'database.sqlite';
      this.dbPath = path.join(process.cwd(), workMemoryDirRel, dbFileName);
    }
    
    this.startCleanupTimer();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private createOptimizedDatabase(): sqlite3.Database {
    const db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('Failed to open database', err);
        throw err;
      }
    });

    db.serialize(() => {
      db.run('PRAGMA journal_mode = WAL');
      db.run('PRAGMA synchronous = NORMAL');
      db.run('PRAGMA cache_size = -64000');
      db.run('PRAGMA temp_store = MEMORY');
      db.run('PRAGMA busy_timeout = 5000');
    });
    
    return db;
  }

  private getCachedConnection(): sqlite3.Database | null {
    if (!this.connectionCache) return null;
    
    const now = Date.now();
    const isExpired = (now - this.connectionCache.lastUsed) > this.CACHE_TTL;
    const isOverused = this.connectionCache.useCount >= this.MAX_USE_COUNT;
    
    if (isExpired || isOverused) {
      this.connectionCache.db.close();
      this.connectionCache = null;
      return null;
    }
    
    this.connectionCache.lastUsed = now;
    this.connectionCache.useCount++;
    
    return this.connectionCache.db;
  }

  private getOrCreateConnection(): sqlite3.Database {
    const cached = this.getCachedConnection();
    if (cached) return cached;
    
    const db = this.createOptimizedDatabase();
    
    this.connectionCache = {
      db,
      lastUsed: Date.now(),
      useCount: 1
    };
    
    return db;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      if (this.connectionCache) {
        const now = Date.now();
        const isExpired = (now - this.connectionCache.lastUsed) > this.CACHE_TTL;
        
        if (isExpired) {
          this.connectionCache.db.close();
          this.connectionCache = null;
        }
      }
    }, this.CACHE_TTL / 2);
  }

  public async initialize(): Promise<DatabaseConnection> {
    const workMemoryDir = path.dirname(this.dbPath);
    if (!fs.existsSync(workMemoryDir)) {
      fs.mkdirSync(workMemoryDir, { recursive: true });
    }
    return this.createConnection();
  }

  private createConnection(): DatabaseConnection {
    const run = (sql: string, params?: any[]): Promise<any> => {
      return new Promise((resolve, reject) => {
        const db = this.getOrCreateConnection();
        db.run(sql, params, function(err) {
          if (err) return reject(err);
          resolve({ changes: this.changes, lastID: this.lastID });
        });
      });
    };

    const get = (sql: string, params?: any[]): Promise<any> => {
      return new Promise((resolve, reject) => {
        const db = this.getOrCreateConnection();
        db.get(sql, params, (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });
    };

    const all = (sql: string, params?: any[]): Promise<any[]> => {
      return new Promise((resolve, reject) => {
        const db = this.getOrCreateConnection();
        db.all(sql, params, (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });
    };
    
    const batch = async (operations: Array<{sql: string, params?: any[]}>): Promise<any[]> => {
        const db = this.getOrCreateConnection();
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                const stmts = operations.map(op => db.prepare(op.sql));

                const results: any[] = [];
                stmts.forEach((stmt, i) => {
                    stmt.run(operations[i].params, function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                        }
                        results.push({ changes: this.changes, lastID: this.lastID });
                    });
                });

                stmts.forEach(stmt => stmt.finalize());

                db.run('COMMIT', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            });
        });
    };

    const query = async <T = any>(sql: string, params?: any[]): Promise<T> => {
      const trimmedSql = sql.trim().toLowerCase();
      if (trimmedSql.startsWith('select')) {
        if (trimmedSql.includes('limit 1')) {
          return await get(sql, params) as T;
        } else {
          return await all(sql, params) as unknown as T;
        }
      } else {
        return await run(sql, params) as T;
      }
    };
    
    const close = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (this.connectionCache) {
          this.connectionCache.db.close((err) => {
            if (err) return reject(err);
            this.connectionCache = null;
            resolve();
          });
        } else {
          resolve();
        }
      });
    };

    return { run, get, all, close, batch, query };
  }

  public async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.connectionCache) {
      return new Promise((resolve, reject) => {
        this.connectionCache!.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.connectionCache = null;
            resolve();
          }
        });
      });
    }
  }

  public getConnection(): DatabaseConnection {
    return this.createConnection();
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  public getConnectionStats(): { cached: boolean; useCount: number; age: number } {
    if (this.connectionCache) {
      return {
        cached: true,
        useCount: this.connectionCache.useCount,
        age: Date.now() - this.connectionCache.lastUsed
      };
    }
    return { cached: false, useCount: 0, age: 0 };
  }
}

const databaseManager = DatabaseManager.getInstance();
export default databaseManager; 