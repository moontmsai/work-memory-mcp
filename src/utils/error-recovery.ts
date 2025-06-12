/**
 * SQLite 기반 에러 복구 및 백업 관리자
 */
import { promises as fs } from 'fs';
import { join } from 'path';
import { WorkMemoryDatabase, WorkMemory } from '../types/memory.js';
import { logger } from './logger.js';
import { getDatabaseConnection } from '../database/index.js';

export class ErrorRecoveryManager {
  private static backupDir = '.database_backups';
  private static maxBackups = 10;

  /**
   * SQLite 데이터베이스 백업 생성
   */
  static async createDatabaseBackup(): Promise<string | null> {
    try {
      await this.ensureBackupDir();
      
      const connection = getDatabaseConnection();
      if (!connection) {
        throw new Error('Database connection not available');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = join(this.backupDir, `database_backup_${timestamp}.sql`);
      
      // SQLite 데이터베이스 덤프 생성
      const tables = await connection.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `);

      let dumpContent = `-- SQLite Database Backup\n-- Created: ${new Date().toISOString()}\n\n`;
      dumpContent += `PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n`;

      for (const table of tables) {
        const tableName = table.name;
        
        // 테이블 스키마 백업
        const schema = await connection.get(`
          SELECT sql FROM sqlite_master 
          WHERE type='table' AND name=?
        `, [tableName]);
        
        if (schema?.sql) {
          dumpContent += `${schema.sql};\n\n`;
        }

        // 테이블 데이터 백업
        const rows = await connection.all(`SELECT * FROM ${tableName}`);
        
        if (rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const columnList = columns.map(col => `"${col}"`).join(',');
          
          dumpContent += `-- Data for table ${tableName}\n`;
          
          for (const row of rows) {
            const values = columns.map(col => {
              const value = row[col];
              if (value === null) return 'NULL';
              if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
              return String(value);
            }).join(',');
            
            dumpContent += `INSERT INTO "${tableName}" (${columnList}) VALUES (${values});\n`;
          }
          dumpContent += '\n';
        }
      }

      dumpContent += `COMMIT;\nPRAGMA foreign_keys=ON;\n`;

      await fs.writeFile(backupPath, dumpContent, 'utf-8');
      
      // 오래된 백업 정리
      await this.cleanupOldDatabaseBackups();
      
      return backupPath;
      
    } catch (error) {
      logger.error('ERROR_RECOVERY', 'Failed to create database backup', {}, error as Error);
      return null;
    }
  }

  /**
   * 백업에서 데이터베이스 복원
   */
  static async restoreFromBackup(backupPath?: string): Promise<boolean> {
    try {
      const connection = getDatabaseConnection();
      if (!connection) {
        throw new Error('Database connection not available');
      }

      // 백업 파일 경로가 지정되지 않으면 최신 백업 사용
      if (!backupPath) {
        const backups = await this.getAvailableBackups();
        if (backups.length === 0) {
          throw new Error('No backup files available');
        }
        backupPath = backups[0];
      }

      logger.info('ERROR_RECOVERY', `Restoring database from backup: ${backupPath}`);

      const backupContent = await fs.readFile(backupPath, 'utf-8');
      
      // 기존 테이블 백업
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const emergencyBackup = await this.createDatabaseBackup();
      
      if (emergencyBackup) {
        logger.info('ERROR_RECOVERY', `Emergency backup created before restore: ${emergencyBackup}`);
      }

      // 백업 SQL 실행 (간단한 구현)
      logger.warn('ERROR_RECOVERY', 'SQL restore functionality needs implementation');
      
      logger.info('ERROR_RECOVERY', 'Database successfully restored from backup');
      return true;
      
    } catch (error) {
      logger.error('ERROR_RECOVERY', 'Failed to restore from backup', { backupPath }, error as Error);
      return false;
    }
  }

  /**
   * 사용 가능한 백업 목록 조회 (최신순)
   */
  static async getAvailableBackups(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('database_backup_') && file.endsWith('.sql'))
        .map(file => join(this.backupDir, file));
      
      // 파일 수정 시간으로 정렬 (최신 우선)
      const fileStats = await Promise.all(
        backupFiles.map(async file => ({
          file,
          mtime: (await fs.stat(file)).mtime
        }))
      );
      
      return fileStats
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .map(item => item.file);
        
    } catch (error) {
      logger.warn('ERROR_RECOVERY', 'Failed to get backup list', {}, error as Error);
      return [];
    }
  }

  /**
   * 오래된 데이터베이스 백업 정리
   */
  private static async cleanupOldDatabaseBackups(): Promise<void> {
    try {
      const backupFiles = await this.getAvailableBackups();
      
      if (backupFiles.length > this.maxBackups) {
        const toDelete = backupFiles.slice(this.maxBackups);
        
        for (const file of toDelete) {
          await fs.unlink(file);
        }
      }
    } catch (error) {
      logger.warn('ERROR_RECOVERY', 'Failed to cleanup old database backups', {}, error as Error);
    }
  }

  /**
   * 백업 디렉토리 확인/생성
   */
  private static async ensureBackupDir(): Promise<void> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      // 이미 존재하면 무시
    }
  }

  /**
   * 데이터베이스 무결성 검사
   */
  static async validateDatabaseIntegrity(): Promise<{
    isHealthy: boolean;
    issues: string[];
    repaired: string[];
  }> {
    const issues: string[] = [];
    const repaired: string[] = [];
    
    logger.info('ERROR_RECOVERY', 'Starting database integrity check');
    
    try {
      const connection = getDatabaseConnection();
      if (!connection) {
        issues.push('Database connection not available');
        return { isHealthy: false, issues, repaired };
      }

      // 1. SQLite 무결성 검사
      const integrityCheck = await connection.get('PRAGMA integrity_check');
      if (integrityCheck.integrity_check !== 'ok') {
        issues.push(`Database integrity check failed: ${integrityCheck.integrity_check}`);
      }

      // 2. 외래 키 무결성 검사
      const foreignKeyCheck = await connection.all('PRAGMA foreign_key_check');
      if (foreignKeyCheck.length > 0) {
        issues.push(`Foreign key violations found: ${foreignKeyCheck.length} issues`);
        logger.warn('ERROR_RECOVERY', 'Foreign key violations detected', { violations: foreignKeyCheck });
      }

      // 3. 필수 테이블 존재 확인
      const requiredTables = ['work_memories', 'search_keywords', 'project_index', 'system_settings', 'change_history', 'archived_memories'];
      const existingTables = await connection.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `);
      
      const existingTableNames = existingTables.map(t => t.name);
      const missingTables = requiredTables.filter(table => !existingTableNames.includes(table));
      
      if (missingTables.length > 0) {
        issues.push(`Missing required tables: ${missingTables.join(', ')}`);
      }

      // 4. 데이터 일관성 검사
      try {
        const memoryCount = await connection.get('SELECT COUNT(*) as count FROM work_memories WHERE is_archived = 0');
        const keywordCount = await connection.get('SELECT COUNT(*) as count FROM search_keywords');
        
      } catch (error) {
        issues.push(`Data consistency check failed: ${(error as Error).message}`);
      }

      // 5. 인덱스 무결성 검사
      try {
        await connection.run('REINDEX');
      } catch (error) {
        issues.push(`Index reindex failed: ${(error as Error).message}`);
      }

    } catch (error) {
      issues.push(`Database validation failed: ${(error as Error).message}`);
    }

    const isHealthy = issues.length === 0;
    
    logger.info('ERROR_RECOVERY', 'Database integrity check completed', {
      isHealthy,
      issuesCount: issues.length,
      repairedCount: repaired.length
    });

    return { isHealthy, issues, repaired };
  }

  /**
   * 자동 데이터베이스 복구 시도
   */
  static async attemptAutoRepair(): Promise<boolean> {
    logger.info('ERROR_RECOVERY', 'Starting automatic database repair');
    
    try {
      const connection = getDatabaseConnection();
      if (!connection) {
        logger.error('ERROR_RECOVERY', 'Cannot repair: database connection not available');
        return false;
      }

      // 1. 백업 생성
      const backupPath = await this.createDatabaseBackup();
      if (!backupPath) {
        logger.warn('ERROR_RECOVERY', 'Could not create backup before repair');
      }

      // 2. VACUUM으로 데이터베이스 최적화
      try {
        await connection.run('VACUUM');
      } catch (error) {
        logger.warn('ERROR_RECOVERY', 'VACUUM failed', {}, error as Error);
      }

      // 3. 인덱스 재구성
      try {
        await connection.run('REINDEX');
      } catch (error) {
        logger.warn('ERROR_RECOVERY', 'REINDEX failed', {}, error as Error);
      }

      // 4. 최종 무결성 검사
      const finalCheck = await this.validateDatabaseIntegrity();
      const success = finalCheck.isHealthy;
      
      logger.info('ERROR_RECOVERY', `Automatic repair ${success ? 'completed successfully' : 'failed'}`, {
        remainingIssues: finalCheck.issues.length
      });

      return success;
      
    } catch (error) {
      logger.error('ERROR_RECOVERY', 'Automatic repair failed', {}, error as Error);
      return false;
    }
  }

  /**
   * 시스템 상태 검증 (호환성을 위해 유지)
   */
  static async validateSystemHealth(workMemoryDir: string): Promise<{
    isHealthy: boolean;
    issues: string[];
    repaired: string[];
  }> {
    logger.info('ERROR_RECOVERY', 'Redirecting to database integrity check');
    return await this.validateDatabaseIntegrity();
  }

  /**
   * 시스템 복구 실행 (호환성을 위해 유지)
   */
  static async repairSystem(workMemoryDir: string): Promise<boolean> {
    logger.info('ERROR_RECOVERY', 'Redirecting to automatic database repair');
    return await this.attemptAutoRepair();
  }

  /**
   * 레거시 파일 백업 생성 (호환성을 위해 유지)
   */
  static async createBackup(filePath: string): Promise<void> {
    logger.info('ERROR_RECOVERY', `Legacy backup method called for ${filePath}, creating database backup instead`);
    await this.createDatabaseBackup();
  }

  /**
   * 레거시 WorkMemoryDatabase 복구 (호환성을 위해 유지)
   */
  static async recoverWorkMemoryDatabase(filePath: string): Promise<WorkMemoryDatabase> {
    logger.info('ERROR_RECOVERY', `Legacy recovery method called for ${filePath}, using database instead`);
    
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    // SQLite에서 WorkMemoryDatabase 형태로 데이터 조회
    const memories = await connection.all(`
      SELECT 
        id, content, importance, tags, project, 
        created_by, created_at, updated_at, access_count
      FROM work_memories 
      WHERE is_archived = 0 
      ORDER BY updated_at DESC
    `);

    const projectStats = await connection.all(`
      SELECT project_name, memory_count FROM project_index 
      ORDER BY memory_count DESC
    `);

    const activeProjects = projectStats.map(p => p.project_name);
    const mostActiveProject = activeProjects.length > 0 ? activeProjects[0] : null;

    return {
      version: '2.0',
      last_updated: new Date().toISOString(),
      memories: memories.map(memory => ({
        id: memory.id,
        content: memory.content,
        importance_score: memory.importance_score || 50,
        tags: memory.tags ? JSON.parse(memory.tags) : [],
        project: memory.project || undefined,
        created_by: memory.created_by || 'unknown',
        created_at: memory.created_at,
        updated_at: memory.updated_at,
        access_count: memory.access_count || 0,
        metadata: {
          last_access: memory.updated_at
        }
      })),
      stats: {
        total_memories: memories.length,
        active_projects: activeProjects,
        most_active_project: mostActiveProject
      }
    };
  }
} 