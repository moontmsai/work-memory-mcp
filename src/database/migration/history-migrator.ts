import fs from 'fs';
import path from 'path';
import { DatabaseConnection } from '../connection.js';

interface LegacyHistoryEntry {
  timestamp: string;
  operation: 'created' | 'updated' | 'deleted' | 'archived' | 'accessed';
  data: {
    memoryId: string;
    content?: string;
    project?: string;
    tags?: string[];
    oldData?: any;
    newData?: any;
    details?: string;
    [key: string]: any;
  };
}

export class HistoryMigrator {
  private connection: DatabaseConnection;
  private workMemoryPath: string;

  constructor(connection: DatabaseConnection, workMemoryPath: string = 'work_memory') {
    this.connection = connection;
    this.workMemoryPath = workMemoryPath;
  }

  /**
   * history/ 디렉토리의 모든 파일을 change_history 테이블로 마이그레이션
   */
  async migrate(): Promise<{ success: boolean; migratedEntries: number; processedFiles: number; errors: string[] }> {
    const errors: string[] = [];
    let migratedEntries = 0;
    let processedFiles = 0;

    try {
      // history 디렉토리 경로
      const historyDir = path.join(this.workMemoryPath, 'history');

      // 디렉토리 존재 여부 확인
      if (!fs.existsSync(historyDir)) {
        return { success: true, migratedEntries: 0, processedFiles: 0, errors: [] };
      }

      // 히스토리 파일 목록 가져오기
      const historyFiles = fs.readdirSync(historyDir)
        .filter(file => file.endsWith('.json'))
        .sort(); // 날짜순 정렬

      if (historyFiles.length === 0) {
        return { success: true, migratedEntries: 0, processedFiles: 0, errors: [] };
      }

      // 트랜잭션 시작
      await this.connection.run('BEGIN TRANSACTION');

      try {
        // 각 히스토리 파일 처리
        for (const fileName of historyFiles) {
          try {
            const filePath = path.join(historyDir, fileName);
            const fileEntries = await this.migrateHistoryFile(filePath, fileName);
            migratedEntries += fileEntries;
            processedFiles++;
          } catch (error) {
            const errorMsg = `Failed to migrate file ${fileName}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
          }
        }

        // 트랜잭션 커밋
        await this.connection.run('COMMIT');

        // 백업 생성
        await this.createBackup(historyDir);

        return { success: true, migratedEntries, processedFiles, errors };

      } catch (error) {
        // 트랜잭션 롤백
        await this.connection.run('ROLLBACK');
        throw error;
      }

    } catch (error) {
      const errorMsg = `History migration failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      return { success: false, migratedEntries, processedFiles, errors };
    }
  }

  /**
   * 개별 히스토리 파일 마이그레이션
   */
  private async migrateHistoryFile(filePath: string, fileName: string): Promise<number> {
    let migratedCount = 0;

    try {
      // 파일 읽기
      const rawData = fs.readFileSync(filePath, 'utf-8');
      const historyEntries: LegacyHistoryEntry[] = JSON.parse(rawData);

      if (!Array.isArray(historyEntries)) {
        throw new Error(`Invalid history file format: expected array, got ${typeof historyEntries}`);
      }

      // 각 히스토리 엔트리 마이그레이션
      for (const entry of historyEntries) {
        try {
          await this.migrateHistoryEntry(entry, fileName);
          migratedCount++;
        } catch (error) {
          // 개별 엔트리 실패는 전체 마이그레이션을 중단하지 않음
        }
      }

      return migratedCount;

    } catch (error) {
      throw new Error(`Failed to process file ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 개별 히스토리 엔트리 마이그레이션
   */
  private async migrateHistoryEntry(entry: LegacyHistoryEntry, sourceFile: string): Promise<void> {
    // 메모리 ID 검증
    if (!entry.data.memoryId) {
      throw new Error('Missing memoryId in history entry');
    }

    // 메모리가 실제로 존재하는지 확인 (선택적)
    const memoryExists = await this.connection.get(
      'SELECT id FROM work_memories WHERE id = ?',
      [entry.data.memoryId]
    );

    if (!memoryExists) {
      // Memory not found but continue with migration
    }

    // 중복 확인 (같은 타임스탬프와 메모리 ID)
    const existing = await this.connection.get(
      'SELECT id FROM change_history WHERE memory_id = ? AND timestamp = ?',
      [entry.data.memoryId, entry.timestamp]
    );

    if (existing) {
      return;
    }

    // 변경된 필드 추출
    const changedFields = this.extractChangedFields(entry);

    // old_data와 new_data 준비
    const oldData = entry.data.oldData ? JSON.stringify(entry.data.oldData) : null;
    const newData = this.prepareNewData(entry);

    // change_history 테이블에 삽입
    await this.connection.run(`
      INSERT INTO change_history (
        memory_id, action, old_data, new_data, timestamp, details,
        changed_fields, user_agent, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      entry.data.memoryId,
      entry.operation,
      oldData,
      newData,
      entry.timestamp,
      entry.data.details || `Migrated from ${sourceFile}`,
      JSON.stringify(changedFields),
      'legacy_migration',
      `migration_${Date.now()}`
    ]);
  }

  /**
   * 변경된 필드 추출
   */
  private extractChangedFields(entry: LegacyHistoryEntry): string[] {
    const fields: string[] = [];

    // 작업 타입에 따라 변경된 필드 추정
    switch (entry.operation) {
      case 'created':
        fields.push('content', 'project', 'tags', 'created_at');
        break;
      case 'updated':
        // 데이터에서 변경된 필드 추출
        if (entry.data.content) fields.push('content');
        if (entry.data.project) fields.push('project');
        if (entry.data.tags) fields.push('tags');
        fields.push('updated_at');
        break;
      case 'deleted':
        fields.push('deleted_at');
        break;
      case 'archived':
        fields.push('is_archived');
        break;
      case 'accessed':
        fields.push('access_count', 'last_accessed_at');
        break;
    }

    return fields;
  }

  /**
   * new_data 준비
   */
  private prepareNewData(entry: LegacyHistoryEntry): string {
    const newData: any = {};

    // 기본 데이터 복사
    if (entry.data.content) newData.content = entry.data.content;
    if (entry.data.project) newData.project = entry.data.project;
    if (entry.data.tags) newData.tags = entry.data.tags;

    // 작업별 추가 데이터
    switch (entry.operation) {
      case 'created':
        newData.created_at = entry.timestamp;
        break;
      case 'updated':
        newData.updated_at = entry.timestamp;
        break;
      case 'archived':
        newData.is_archived = true;
        newData.archived_at = entry.timestamp;
        break;
    }

    // 추가 데이터가 있으면 포함
    if (entry.data.newData) {
      Object.assign(newData, entry.data.newData);
    }

    return JSON.stringify(newData);
  }

  /**
   * 백업 생성
   */
  private async createBackup(historyDir: string): Promise<void> {
    try {
      const backupDir = `${historyDir}.backup.${Date.now()}`;
      await this.copyDirectory(historyDir, backupDir);
    } catch (error) {
      // Silently ignore backup creation failures
    }
  }

  /**
   * 디렉토리 재귀 복사
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * 마이그레이션 검증
   */
  async verify(): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // 히스토리 디렉토리 확인
      const historyDir = path.join(this.workMemoryPath, 'history');
      
      if (!fs.existsSync(historyDir)) {
        return { isValid: true, issues: [] };
      }

      // 원본 파일들의 엔트리 수 계산
      const historyFiles = fs.readdirSync(historyDir)
        .filter(file => file.endsWith('.json'));

      let originalEntryCount = 0;
      for (const fileName of historyFiles) {
        try {
          const filePath = path.join(historyDir, fileName);
          const rawData = fs.readFileSync(filePath, 'utf-8');
          const entries = JSON.parse(rawData);
          if (Array.isArray(entries)) {
            originalEntryCount += entries.length;
          }
        } catch (error) {
          issues.push(`Failed to read history file ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // 데이터베이스의 마이그레이션된 엔트리 수 확인
      const dbEntryCount = await this.connection.get(`
        SELECT COUNT(*) as count 
        FROM change_history 
        WHERE user_agent = 'legacy_migration'
      `);

      if (originalEntryCount !== dbEntryCount.count) {
        issues.push(`Entry count mismatch: expected ${originalEntryCount}, got ${dbEntryCount.count}`);
      }

      // 고아 히스토리 확인 (메모리가 없는 히스토리)
      const orphanHistory = await this.connection.all(`
        SELECT ch.memory_id, COUNT(*) as count
        FROM change_history ch
        LEFT JOIN work_memories wm ON ch.memory_id = wm.id
        WHERE wm.id IS NULL AND ch.user_agent = 'legacy_migration'
        GROUP BY ch.memory_id
      `);

      if (orphanHistory.length > 0) {
        issues.push(`Found ${orphanHistory.length} orphan history entries (no corresponding memory)`);
      }

      // 타임스탬프 형식 확인
      const invalidTimestamps = await this.connection.all(`
        SELECT memory_id, timestamp
        FROM change_history
        WHERE user_agent = 'legacy_migration'
        AND (timestamp IS NULL OR timestamp = '' OR length(timestamp) < 10)
        LIMIT 5
      `);

      if (invalidTimestamps.length > 0) {
        issues.push(`Found ${invalidTimestamps.length} entries with invalid timestamps`);
      }

      return { isValid: issues.length === 0, issues };

    } catch (error) {
      issues.push(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false, issues };
    }
  }

  /**
   * 히스토리 통계 조회
   */
  async getStatistics(): Promise<{
    totalEntries: number;
    entriesByAction: { action: string; count: number }[];
    entriesByDate: { date: string; count: number }[];
    memoryCount: number;
  }> {
    try {
      // 총 엔트리 수
      const totalResult = await this.connection.get(`
        SELECT COUNT(*) as count 
        FROM change_history 
        WHERE user_agent = 'legacy_migration'
      `);

      // 액션별 통계
      const actionStats = await this.connection.all(`
        SELECT action, COUNT(*) as count
        FROM change_history
        WHERE user_agent = 'legacy_migration'
        GROUP BY action
        ORDER BY count DESC
      `);

      // 날짜별 통계
      const dateStats = await this.connection.all(`
        SELECT DATE(timestamp) as date, COUNT(*) as count
        FROM change_history
        WHERE user_agent = 'legacy_migration'
        GROUP BY DATE(timestamp)
        ORDER BY date
      `);

      // 관련 메모리 수
      const memoryResult = await this.connection.get(`
        SELECT COUNT(DISTINCT memory_id) as count
        FROM change_history
        WHERE user_agent = 'legacy_migration'
      `);

      return {
        totalEntries: totalResult.count,
        entriesByAction: actionStats,
        entriesByDate: dateStats,
        memoryCount: memoryResult.count
      };

    } catch (error) {
      return {
        totalEntries: 0,
        entriesByAction: [],
        entriesByDate: [],
        memoryCount: 0
      };
    }
  }

  /**
   * 중복 히스토리 엔트리 정리
   */
  async cleanupDuplicates(): Promise<{ cleaned: number; errors: string[] }> {
    const errors: string[] = [];
    let cleaned = 0;

    try {
      // 중복 엔트리 찾기 (같은 memory_id, timestamp, action)
      const duplicates = await this.connection.all(`
        SELECT memory_id, timestamp, action, COUNT(*) as count
        FROM change_history
        GROUP BY memory_id, timestamp, action
        HAVING COUNT(*) > 1
      `);

      if (duplicates.length === 0) {
        return { cleaned: 0, errors: [] };
      }

      // 트랜잭션 시작
      await this.connection.run('BEGIN TRANSACTION');

      try {
        for (const duplicate of duplicates) {
          // 가장 오래된 것 하나만 남기고 나머지 삭제
          const ids = await this.connection.all(`
            SELECT id FROM change_history
            WHERE memory_id = ? AND timestamp = ? AND action = ?
            ORDER BY id ASC
          `, [duplicate.memory_id, duplicate.timestamp, duplicate.action]);

          // 첫 번째(가장 오래된) 것을 제외하고 나머지 삭제
          for (let i = 1; i < ids.length; i++) {
            await this.connection.run(
              'DELETE FROM change_history WHERE id = ?',
              [ids[i].id]
            );
            cleaned++;
          }
        }

        await this.connection.run('COMMIT');
        return { cleaned, errors };

      } catch (error) {
        await this.connection.run('ROLLBACK');
        throw error;
      }

    } catch (error) {
      const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      return { cleaned, errors };
    }
  }
} 