import databaseManager, { DatabaseConnection } from './connection.js';
import { initializeSchema, checkAndMigrateSchema } from './schema.js';

/**
 * 데이터베이스 초기화 및 설정
 */
export async function initializeDatabase(): Promise<DatabaseConnection> {
  try {
    // 데이터베이스 연결 초기화
    const connection = await databaseManager.initialize();
    
    // 스키마 초기화
    await initializeSchema(connection);
    
    // 스키마 버전 확인 및 마이그레이션
    await checkAndMigrateSchema(connection);
    
    return connection;
  } catch (error) {
    throw error;
  }
}

/**
 * 데이터베이스 연결 가져오기
 */
export function getDatabaseConnection(): DatabaseConnection {
  return databaseManager.getConnection();
}

/**
 * 데이터베이스 연결 종료
 */
export async function closeDatabaseConnection(): Promise<void> {
  return databaseManager.close();
}

/**
 * 데이터베이스 상태 확인
 */
export async function checkDatabaseHealth(): Promise<{ status: string; info: any }> {
  try {
    const connection = getDatabaseConnection();
    
    // 간단한 쿼리 실행으로 연결 상태 확인
    const result = await connection.get('SELECT sqlite_version() as version');
    
    // 테이블 존재 여부 확인
    const tables = await connection.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    // 기본 통계 정보 수집
    const memoryCount = await connection.get('SELECT COUNT(*) as count FROM work_memories');
    const projectCount = await connection.get('SELECT COUNT(*) as count FROM project_index');
    
    return {
      status: 'healthy',
      info: {
        sqliteVersion: result.version,
        tables: tables.map(t => t.name),
        memoryCount: memoryCount.count,
        projectCount: projectCount.count
      }
    };
  } catch (error) {
    return {
      status: 'error',
      info: { error: error instanceof Error ? error.message : String(error) }
    };
  }
}

// 데이터베이스 연결 및 스키마 관련 함수들 export
export * from './schema.js';
export { default as databaseManager, type DatabaseConnection } from './connection.js';
export { SCHEMA_SQL } from './schema.js'; 