import fs from 'fs';
import path from 'path';
import { DatabaseConnection } from './connection.js';

interface ArchiveEntry {
  id: string;
  original_memory_id: string;
  content: string;
  original_data: string;
  archived_at: string;
  reason: string;
  archived_by: string;
  original_project: string;
  original_tags: string;
  original_importance: string;
}

interface BackupMetadata {
  filename: string;
  created_at: string;
  size_bytes: number;
  backup_type: 'automatic' | 'manual' | 'migration';
  source_data: string;
  description?: string;
}

export class ArchiveManager {
  private connection: DatabaseConnection;
  private backupPath: string;

  constructor(connection: DatabaseConnection, backupPath: string = '.backups') {
    this.connection = connection;
    this.backupPath = backupPath;
  }

  /**
   * 메모리를 아카이브로 이동
   */
  async archiveMemory(
    memoryId: string, 
    reason: string = 'manual', 
    archivedBy: string = 'system'
  ): Promise<{ success: boolean; archivedId?: string; error?: string }> {
    try {
      // 1. 원본 메모리 데이터 조회
      const memory = await this.connection.get(
        'SELECT * FROM work_memories WHERE id = ?',
        [memoryId]
      );

      if (!memory) {
        return { success: false, error: `Memory ${memoryId} not found` };
      }

      // 2. 트랜잭션 시작
      await this.connection.run('BEGIN TRANSACTION');

      try {
        // 3. archived_memories에 데이터 삽입
        const archivedId = `arch_${Date.now()}_${memoryId.slice(-6)}`;
        
        await this.connection.run(`
          INSERT INTO archived_memories (
            id, original_memory_id, content, original_data, 
            archived_at, reason, archived_by, original_project, 
            original_tags, original_importance
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          archivedId,
          memoryId,
          memory.content,
          JSON.stringify(memory),
          new Date().toISOString(),
          reason,
          archivedBy,
          memory.project || null,
          memory.tags || null,
          memory.importance || 'medium'
        ]);

        // 4. work_memories에서 아카이브 플래그 설정
        await this.connection.run(
          'UPDATE work_memories SET is_archived = 1 WHERE id = ?',
          [memoryId]
        );

        // 5. 변경 이력 기록
        await this.connection.run(`
          INSERT INTO change_history (
            memory_id, action, old_data, new_data, 
            timestamp, details, user_agent, session_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          memoryId,
          'archived',
          JSON.stringify(memory),
          JSON.stringify({ archived: true, archived_id: archivedId }),
          new Date().toISOString(),
          `Memory archived: ${reason}`,
          'archive_manager',
          `archive_${Date.now()}`
        ]);

        // 6. 프로젝트 인덱스 업데이트
        if (memory.project) {
          await this.updateProjectIndexAfterArchive(memory.project);
        }

        await this.connection.run('COMMIT');

        return { success: true, archivedId };

      } catch (error) {
        await this.connection.run('ROLLBACK');
        throw error;
      }

    } catch (error) {
      const errorMsg = `Failed to archive memory ${memoryId}: ${error instanceof Error ? error.message : String(error)}`;
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 아카이브된 메모리 복원
   */
  async restoreMemory(
    archivedId: string
  ): Promise<{ success: boolean; restoredId?: string; error?: string }> {
    try {
      // 1. 아카이브 데이터 조회
      const archived = await this.connection.get(
        'SELECT * FROM archived_memories WHERE id = ?',
        [archivedId]
      );

      if (!archived) {
        return { success: false, error: `Archived memory ${archivedId} not found` };
      }

      // 2. 원본 데이터 파싱
      const originalData = JSON.parse(archived.original_data);

      // 3. 트랜잭션 시작
      await this.connection.run('BEGIN TRANSACTION');

      try {
        // 4. work_memories 테이블에서 아카이브 플래그 해제
        await this.connection.run(
          'UPDATE work_memories SET is_archived = 0 WHERE id = ?',
          [archived.original_memory_id]
        );

        // 5. 변경 이력 기록
        await this.connection.run(`
          INSERT INTO change_history (
            memory_id, action, old_data, new_data, 
            timestamp, details, user_agent, session_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          archived.original_memory_id,
          'restored',
          JSON.stringify({ archived: true }),
          JSON.stringify(originalData),
          new Date().toISOString(),
          `Memory restored from archive ${archivedId}`,
          'archive_manager',
          `restore_${Date.now()}`
        ]);

        // 6. 프로젝트 인덱스 업데이트
        if (originalData.project) {
          await this.updateProjectIndexAfterRestore(originalData.project);
        }

        await this.connection.run('COMMIT');

        return { success: true, restoredId: archived.original_memory_id };

      } catch (error) {
        await this.connection.run('ROLLBACK');
        throw error;
      }

    } catch (error) {
      const errorMsg = `Failed to restore memory ${archivedId}: ${error instanceof Error ? error.message : String(error)}`;
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 백업 파일 생성
   */
  async createBackup(
    backupType: 'automatic' | 'manual' | 'migration' = 'manual',
    description?: string
  ): Promise<{ success: boolean; backupFile?: string; error?: string }> {
    try {
      // 1. 백업 디렉토리 확인
      if (!fs.existsSync(this.backupPath)) {
        fs.mkdirSync(this.backupPath, { recursive: true });
      }

      // 2. 모든 데이터 수집
      const [memories, keywords, projects, settings, history, archived] = await Promise.all([
        this.connection.all('SELECT * FROM work_memories ORDER BY created_at'),
        this.connection.all('SELECT * FROM search_keywords ORDER BY memory_id'),
        this.connection.all('SELECT * FROM project_index ORDER BY project'),
        this.connection.all('SELECT * FROM system_settings ORDER BY key'),
        this.connection.all('SELECT * FROM change_history ORDER BY timestamp'),
        this.connection.all('SELECT * FROM archived_memories ORDER BY archived_at')
      ]);

      // 3. 백업 데이터 구조화
      const backupData = {
        metadata: {
          created_at: new Date().toISOString(),
          backup_type: backupType,
          description: description || `${backupType} backup`,
          version: '1.0.0',
          total_records: {
            work_memories: memories.length,
            search_keywords: keywords.length,
            project_index: projects.length,
            system_settings: settings.length,
            change_history: history.length,
            archived_memories: archived.length
          }
        },
        data: {
          work_memories: memories,
          search_keywords: keywords,
          project_index: projects,
          system_settings: settings,
          change_history: history,
          archived_memories: archived
        }
      };

      // 4. 백업 파일 저장
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `database_backup_${backupType}_${timestamp}.json`;
      const backupFilePath = path.join(this.backupPath, backupFileName);

      fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

      // 5. 백업 메타데이터 로깅
      const stats = fs.statSync(backupFilePath);

      return { success: true, backupFile: backupFileName };

    } catch (error) {
      const errorMsg = `Failed to create backup: ${error instanceof Error ? error.message : String(error)}`;
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 아카이브된 메모리 목록 조회
   */
  async getArchivedMemories(
    limit: number = 50,
    offset: number = 0
  ): Promise<ArchiveEntry[]> {
    return this.connection.all(`
      SELECT * FROM archived_memories 
      ORDER BY archived_at DESC 
      LIMIT ? OFFSET ?
    `, [limit, offset]);
  }

  /**
   * 아카이브 통계 정보
   */
  async getArchiveStatistics(): Promise<{
    total_archived: number;
    by_reason: { reason: string; count: number }[];
    by_project: { project: string; count: number }[];
    by_month: { month: string; count: number }[];
    total_size_mb: number;
  }> {
    const [
      totalResult,
      byReason,
      byProject,
      byMonth
    ] = await Promise.all([
      this.connection.get('SELECT COUNT(*) as total FROM archived_memories'),
      this.connection.all(`
        SELECT reason, COUNT(*) as count 
        FROM archived_memories 
        GROUP BY reason 
        ORDER BY count DESC
      `),
      this.connection.all(`
        SELECT original_project as project, COUNT(*) as count 
        FROM archived_memories 
        WHERE original_project IS NOT NULL
        GROUP BY original_project 
        ORDER BY count DESC
      `),
      this.connection.all(`
        SELECT strftime('%Y-%m', archived_at) as month, COUNT(*) as count 
        FROM archived_memories 
        GROUP BY strftime('%Y-%m', archived_at) 
        ORDER BY month DESC
      `)
    ]);

    // 총 크기 계산 (대략적)
    const totalSizeBytes = await this.connection.get(`
      SELECT SUM(length(content) + length(original_data)) as total_bytes 
      FROM archived_memories
    `);

    return {
      total_archived: totalResult.total,
      by_reason: byReason,
      by_project: byProject,
      by_month: byMonth,
      total_size_mb: Math.round((totalSizeBytes.total_bytes || 0) / 1024 / 1024 * 100) / 100
    };
  }

  /**
   * 백업 파일 목록 조회
   */
  async getBackupFiles(): Promise<BackupMetadata[]> {
    try {
      if (!fs.existsSync(this.backupPath)) {
        return [];
      }

      const files = fs.readdirSync(this.backupPath)
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(this.backupPath, file);
          const stats = fs.statSync(filePath);
          
          // 파일명에서 백업 타입 추출
          let backupType: 'automatic' | 'manual' | 'migration' = 'manual';
          if (file.includes('_automatic_')) backupType = 'automatic';
          else if (file.includes('_migration_')) backupType = 'migration';

          return {
            filename: file,
            created_at: stats.birthtime.toISOString(),
            size_bytes: stats.size,
            backup_type: backupType,
            source_data: filePath
          };
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return files;

    } catch (error) {
      return [];
    }
  }

  /**
   * 자동 아카이브 (오래된 메모리 정리)
   */
  async performAutoArchive(
    daysOld: number = 90,
    maxToArchive: number = 100
  ): Promise<{ archived: number; errors: string[] }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // 오래된 메모리 조회 (중요도가 낮고 접근 빈도가 낮은 것 우선)
      const oldMemories = await this.connection.all(`
        SELECT id FROM work_memories 
        WHERE created_at < ? 
        AND is_archived = 0 
        AND importance != 'high'
        AND access_count < 5
        ORDER BY access_count ASC, created_at ASC
        LIMIT ?
      `, [cutoffDate.toISOString(), maxToArchive]);

      let archived = 0;
      const errors: string[] = [];

      for (const memory of oldMemories) {
        const result = await this.archiveMemory(
          memory.id, 
          `auto_archive_${daysOld}d`, 
          'auto_archive_system'
        );

        if (result.success) {
          archived++;
        } else {
          errors.push(result.error || 'Unknown error');
        }
      }

      return { archived, errors };

    } catch (error) {
      return { archived: 0, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  /**
   * 프로젝트 인덱스 업데이트 (아카이브 후)
   */
  private async updateProjectIndexAfterArchive(project: string): Promise<void> {
    const activeCount = await this.connection.get(
      'SELECT COUNT(*) as count FROM work_memories WHERE project = ? AND is_archived = 0',
      [project]
    );

    await this.connection.run(
      'UPDATE project_index SET memory_count = ? WHERE project = ?',
      [activeCount.count, project]
    );
  }

  /**
   * 프로젝트 인덱스 업데이트 (복원 후)
   */
  private async updateProjectIndexAfterRestore(project: string): Promise<void> {
    const activeCount = await this.connection.get(
      'SELECT COUNT(*) as count FROM work_memories WHERE project = ? AND is_archived = 0',
      [project]
    );

    await this.connection.run(
      'UPDATE project_index SET memory_count = ? WHERE project = ?',
      [activeCount.count, project]
    );
  }

  /**
   * 바이트를 읽기 쉬운 형태로 변환
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
} 