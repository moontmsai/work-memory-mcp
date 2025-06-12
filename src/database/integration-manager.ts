import { DatabaseConnection } from './connection.js';
import { ArchiveManager } from './archive-manager.js';
import { WorkMemoriesMigrator } from './migration/work-memories-migrator.js';
import { SearchIndexMigrator } from './migration/search-index-migrator.js';
import { SettingsMigrator } from './migration/settings-migrator.js';
import { HistoryMigrator } from './migration/history-migrator.js';
import fs from 'fs';
import path from 'path';

export interface IntegrationStatus {
  database: {
    connected: boolean;
    version: string;
    tables_count: number;
    health: 'healthy' | 'warning' | 'error';
  };
  migration: {
    completed: boolean;
    work_memories: boolean;
    search_index: boolean;
    settings: boolean;
    history: boolean;
    total_migrated: number;
  };
  archive: {
    total_archived: number;
    total_backups: number;
    latest_backup: string | null;
    archive_size_mb: number;
  };
  storage: {
    database_size_mb: number;
    backup_size_mb: number;
    total_size_mb: number;
  };
}

export class IntegrationManager {
  private connection: DatabaseConnection;
  private archiveManager: ArchiveManager;
  private workMemoriesMigrator: WorkMemoriesMigrator;
  private searchIndexMigrator: SearchIndexMigrator;
  private settingsMigrator: SettingsMigrator;
  private historyMigrator: HistoryMigrator;

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
    this.archiveManager = new ArchiveManager(connection);
    this.workMemoriesMigrator = new WorkMemoriesMigrator(connection);
    this.searchIndexMigrator = new SearchIndexMigrator(connection);
    this.settingsMigrator = new SettingsMigrator(connection);
    this.historyMigrator = new HistoryMigrator(connection);
  }

  /**
   * 전체 시스템 상태 점검
   */
  async getSystemStatus(): Promise<IntegrationStatus> {
    try {
      // 1. 데이터베이스 상태 확인
      const databaseStatus = await this.checkDatabaseStatus();

      // 2. 마이그레이션 상태 확인
      const migrationStatus = await this.checkMigrationStatus();

      // 3. 아카이브 상태 확인
      const archiveStatus = await this.checkArchiveStatus();

      // 4. 저장소 사용량 확인
      const storageStatus = await this.checkStorageStatus();

      return {
        database: databaseStatus,
        migration: migrationStatus,
        archive: archiveStatus,
        storage: storageStatus
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * 전체 시스템 초기화 및 마이그레이션
   */
  async performFullInitialization(): Promise<{
    success: boolean;
    steps: { step: string; success: boolean; error?: string }[];
    summary: IntegrationStatus;
  }> {
    const steps: { step: string; success: boolean; error?: string }[] = [];
    
    try {
      // 1. 사전 백업 생성
      const backupResult = await this.archiveManager.createBackup(
        'migration', 
        'Pre-migration backup'
      );
      steps.push({
        step: 'Pre-migration backup',
        success: backupResult.success,
        error: backupResult.error
      });

      if (!backupResult.success) {
        throw new Error(`Backup failed: ${backupResult.error}`);
      }

      // 2. Work Memories 마이그레이션
      const workResult = await this.workMemoriesMigrator.migrate();
      steps.push({
        step: 'Work memories migration',
        success: workResult.success,
        error: workResult.errors.join(', ') || undefined
      });

      // 3. Search Index 마이그레이션
      const searchResult = await this.searchIndexMigrator.migrate();
      steps.push({
        step: 'Search index migration',
        success: searchResult.success,
        error: searchResult.errors.join(', ') || undefined
      });

      // 4. Settings 마이그레이션
      const settingsResult = await this.settingsMigrator.migrate();
      steps.push({
        step: 'Settings migration',
        success: settingsResult.success,
        error: settingsResult.errors.join(', ') || undefined
      });

      // 5. History 마이그레이션
      const historyResult = await this.historyMigrator.migrate();
      steps.push({
        step: 'History migration',
        success: historyResult.success,
        error: historyResult.errors.join(', ') || undefined
      });

      // 6. 사후 백업 생성
      const postBackupResult = await this.archiveManager.createBackup(
        'migration', 
        'Post-migration backup'
      );
      steps.push({
        step: 'Post-migration backup',
        success: postBackupResult.success,
        error: postBackupResult.error
      });

      // 7. 최종 상태 확인
      const summary = await this.getSystemStatus();

      const allSucceeded = steps.every(step => step.success);

      return {
        success: allSucceeded,
        steps,
        summary
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      steps.push({
        step: 'Full initialization',
        success: false,
        error: errorMsg
      });

      return {
        success: false,
        steps,
        summary: await this.getSystemStatus()
      };
    }
  }

  /**
   * 정기 유지보수 작업
   */
  async performMaintenance(): Promise<{
    backup_created: boolean;
    auto_archived: number;
    cleaned_entries: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let backupCreated = false;
    let autoArchived = 0;
    let cleanedEntries = 0;

    try {
      // 1. 정기 백업 생성
      const backupResult = await this.archiveManager.createBackup(
        'automatic',
        'Scheduled maintenance backup'
      );
      
      if (backupResult.success) {
        backupCreated = true;
      } else {
        errors.push(`Backup failed: ${backupResult.error}`);
      }

      // 2. 자동 아카이브 (30일 이상 된 낮은 중요도 메모리)
      const archiveResult = await this.archiveManager.performAutoArchive(30, 50);
      autoArchived = archiveResult.archived;
      
      if (archiveResult.errors.length > 0) {
        errors.push(...archiveResult.errors);
      }

      // 3. 중복 데이터 정리 (히스토리)
      const historyCleanup = await this.historyMigrator.cleanupDuplicates();
      cleanedEntries = historyCleanup.cleaned;
      
      if (historyCleanup.errors.length > 0) {
        errors.push(...historyCleanup.errors);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Maintenance failed: ${errorMsg}`);
    }

    return {
      backup_created: backupCreated,
      auto_archived: autoArchived,
      cleaned_entries: cleanedEntries,
      errors
    };
  }

  /**
   * 데이터베이스 상태 확인
   */
  private async checkDatabaseStatus(): Promise<IntegrationStatus['database']> {
    try {
      // SQLite 버전 확인
      const versionResult = await this.connection.get('SELECT sqlite_version() as version');
      
      // 테이블 수 확인
      const tablesResult = await this.connection.all(`
        SELECT COUNT(*) as count 
        FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `);

      // 기본 쿼리 실행으로 연결 상태 확인
      await this.connection.get('SELECT 1');

      return {
        connected: true,
        version: versionResult.version,
        tables_count: tablesResult[0].count,
        health: 'healthy'
      };

    } catch (error) {
      return {
        connected: false,
        version: 'unknown',
        tables_count: 0,
        health: 'error'
      };
    }
  }

  /**
   * 마이그레이션 상태 확인
   */
  private async checkMigrationStatus(): Promise<IntegrationStatus['migration']> {
    try {
      const [workCount, keywordCount, settingCount, historyCount] = await Promise.all([
        this.connection.get('SELECT COUNT(*) as count FROM work_memories'),
        this.connection.get('SELECT COUNT(*) as count FROM search_keywords'),
        this.connection.get('SELECT COUNT(*) as count FROM system_settings'),
        this.connection.get('SELECT COUNT(*) as count FROM change_history')
      ]);

      const totalMigrated = workCount.count + keywordCount.count + settingCount.count + historyCount.count;

      return {
        completed: totalMigrated > 0,
        work_memories: workCount.count > 0,
        search_index: keywordCount.count > 0,
        settings: settingCount.count > 0,
        history: historyCount.count > 0,
        total_migrated: totalMigrated
      };

    } catch (error) {
      return {
        completed: false,
        work_memories: false,
        search_index: false,
        settings: false,
        history: false,
        total_migrated: 0
      };
    }
  }

  /**
   * 아카이브 상태 확인
   */
  private async checkArchiveStatus(): Promise<IntegrationStatus['archive']> {
    try {
      const archivedCount = await this.connection.get('SELECT COUNT(*) as count FROM archived_memories');
      const archiveStats = await this.archiveManager.getArchiveStatistics();
      const backupFiles = await this.archiveManager.getBackupFiles();

      return {
        total_archived: archivedCount.count,
        total_backups: backupFiles.length,
        latest_backup: backupFiles.length > 0 ? backupFiles[0].filename : null,
        archive_size_mb: archiveStats.total_size_mb
      };

    } catch (error) {
      return {
        total_archived: 0,
        total_backups: 0,
        latest_backup: null,
        archive_size_mb: 0
      };
    }
  }

  /**
   * 저장소 사용량 확인
   */
  private async checkStorageStatus(): Promise<IntegrationStatus['storage']> {
    try {
      // 데이터베이스 파일 크기 (환경변수 우선 사용)
      let databaseSizeMb = 0;
      try {
        const workMemoryDir = process.env.WORK_MEMORY_DIR;
        
        let dbPath: string;
        if (workMemoryDir) {
          // 환경변수로 완전한 경로가 지정된 경우
          const dbFileName = process.env.DB_FILENAME || 'database.sqlite';
          dbPath = path.join(workMemoryDir, dbFileName);
        } else {
          // 환경변수가 없을 때만 상대 경로 사용
          dbPath = path.join(process.cwd(), 'work_memory', 'database.sqlite');
        }
        
        if (fs.existsSync(dbPath)) {
          const stats = fs.statSync(dbPath);
          databaseSizeMb = Math.round(stats.size / 1024 / 1024 * 100) / 100;
        }
      } catch (error) {
        // console.warn( // JSON-RPC 간섭 방지'Failed to get database file size:', error);
      }

      // 백업 파일 크기 (환경변수 우선 사용)
      let backupSizeMb = 0;
      try {
        const backupDir = process.env.BACKUP_DIR;
        
        let backupPath: string;
        if (backupDir) {
          // 환경변수로 완전한 경로가 지정된 경우
          backupPath = backupDir;
        } else {
          // 환경변수가 없을 때만 상대 경로 사용
          backupPath = path.join(process.cwd(), '.backups');
        }
        
        if (fs.existsSync(backupPath)) {
          const files = fs.readdirSync(backupPath);
          for (const file of files) {
            const filePath = path.join(backupPath, file);
            const stats = fs.statSync(filePath);
            backupSizeMb += stats.size;
          }
          backupSizeMb = Math.round(backupSizeMb / 1024 / 1024 * 100) / 100;
        }
      } catch (error) {
        // console.warn( // JSON-RPC 간섭 방지'Failed to get backup files size:', error);
      }

      return {
        database_size_mb: databaseSizeMb,
        backup_size_mb: backupSizeMb,
        total_size_mb: Math.round((databaseSizeMb + backupSizeMb) * 100) / 100
      };

    } catch (error) {
      return {
        database_size_mb: 0,
        backup_size_mb: 0,
        total_size_mb: 0
      };
    }
  }
} 