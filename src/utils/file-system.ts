import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { WorkMemoryDatabase, SearchIndex, Settings, WorkMemory } from '../types/memory.js';
// FileLockManager는 SQLite 전환으로 더 이상 필요 없음
// MemoryFactory는 SQLite 전환으로 더 이상 필요 없음
import { getDatabaseConnection } from '../database/index.js';

/**
 * 파일 시스템 기본 유틸리티 함수들
 */

/**
 * 디렉토리가 존재하지 않으면 생성 (외부에서 사용 가능)
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // 이미 존재하면 무시
  }
}

export class FileSystemManager {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || process.env.WORK_MEMORY_DIR || './work_memory';
  }

  /**
   * 작업 메모리 디렉토리 경로 반환
   */
  getWorkMemoryDir(): string {
    return this.basePath;
  }

  /**
   * 디렉토리가 존재하지 않으면 생성
   */
  private async ensureDirectory(filePath: string): Promise<void> {
    try {
      await fs.mkdir(dirname(filePath), { recursive: true });
    } catch (error) {
      // 이미 존재하면 무시
    }
  }

  /**
   * SQLite에서 WorkMemoryDatabase 형태로 데이터 조회
   */
  private async getWorkMemoryFromDatabase(): Promise<WorkMemoryDatabase> {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    try {
      // 활성 메모리들 조회
      const memories = await connection.all(`
        SELECT 
          id,
          content,
          importance,
          tags,
          project,
          created_by,
          created_at,
          updated_at,
          access_count
        FROM work_memories 
        WHERE is_archived = 0 
        ORDER BY updated_at DESC
      `);

            // 프로젝트 통계 조회
      const projectStats = await connection.all(`
        SELECT 
          project,
          memory_count,
          last_updated
        FROM project_index
        ORDER BY memory_count DESC
      `);

      const activeProjects = projectStats.map(p => p.project);
      const mostActiveProject = activeProjects.length > 0 ? activeProjects[0] : null;

      return {
        version: '2.0', // SQLite 버전으로 업그레이드
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
    } catch (error) {
      throw error;
    }
  }

  /**
   * SQLite에서 SearchIndex 형태로 데이터 조회
   */
  private async getSearchIndexFromDatabase(): Promise<SearchIndex> {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    try {
      // 키워드 인덱스 조회 (실제 스키마에 맞게 수정)
      const keywords = await connection.all(`
        SELECT keyword, COUNT(*) as frequency, memory_id
        FROM search_keywords
        GROUP BY keyword
        ORDER BY frequency DESC
      `);

      // 프로젝트 인덱스 조회
      const projects = await connection.all(`
        SELECT 
          project,
          memory_count,
          last_updated
        FROM project_index
        ORDER BY memory_count DESC
      `);

      const keywordsObj: Record<string, any> = {};
      keywords.forEach(kw => {
        keywordsObj[kw.keyword] = {
          frequency: kw.frequency,
          last_used: new Date().toISOString(),
          related_memory_ids: [kw.memory_id]
        };
      });

      const projectsObj: Record<string, any> = {};
      projects.forEach(proj => {
        projectsObj[proj.project] = {
          memory_count: proj.memory_count,
          last_updated: proj.last_updated
        };
      });

      return {
        keywords: keywordsObj,
        projects: projectsObj,
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * SQLite에서 Settings 조회
   */
  private async getSettingsFromDatabase(): Promise<Settings> {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    try {
      const settings = await connection.all(`
        SELECT setting_key, setting_value, setting_type, updated_at
        FROM system_settings
      `);

      const settingsObj: any = {
        version: '2.0',
        last_updated: new Date().toISOString()
      };

      settings.forEach(setting => {
        try {
          if (setting.setting_type === 'json') {
            settingsObj[setting.setting_key] = JSON.parse(setting.setting_value);
          } else if (setting.setting_type === 'number') {
            settingsObj[setting.setting_key] = parseFloat(setting.setting_value);
          } else if (setting.setting_type === 'boolean') {
            settingsObj[setting.setting_key] = setting.setting_value === 'true';
          } else {
            settingsObj[setting.setting_key] = setting.setting_value;
          }
        } catch (parseError) {
          settingsObj[setting.setting_key] = setting.setting_value;
        }
      });

      return settingsObj as Settings;
    } catch (error) {
      // 기본 설정 반환
             return {
         version: '2.0',
         last_updated: new Date().toISOString(),
         max_memories: 1000,
         auto_cleanup_days: 30,
         max_keywords_per_memory: 10,
         enable_history: true,
         enable_auto_archive: true,
         search: {
           exact_match_score: 10,
           partial_match_score: 5,
           tag_match_score: 3,
           max_results: 50
         }
       } as Settings;
    }
  }

  /**
   * JSON 파일 안전하게 쓰기 (원자적 쓰기) - 호환성을 위해 유지
   */
  private async writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    await this.ensureDirectory(filePath);
    const tempPath = `${filePath}.tmp`;
    
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // 임시 파일 정리
      try {
        await fs.unlink(tempPath);
      } catch {
        // 임시 파일이 없으면 무시
      }
      throw error;
    }
  }

  /**
   * 락킹을 사용한 안전한 JSON 파일 쓰기 - SQLite 전환으로 더 이상 사용되지 않음
   */
  async writeJsonFileSafe<T>(filePath: string, data: T): Promise<void> {
    // console.warn( // JSON-RPC 간섭 방지'[FileSystem] writeJsonFileSafe is deprecated - SQLite handles concurrency automatically');
    await this.writeJsonFile(filePath, data);
  }

  /**
   * 락킹을 사용한 안전한 JSON 파일 읽기 - SQLite 기반으로 변경
   */
  async readJsonFileSafe<T>(filePath: string, defaultValue: T): Promise<T> {
    // JSON 파일 대신 SQLite에서 읽기
    if (filePath.includes('current_work.json')) {
      return await this.getWorkMemoryFromDatabase() as unknown as T;
    } else if (filePath.includes('search_index.json')) {
      return await this.getSearchIndexFromDatabase() as unknown as T;
    } else if (filePath.includes('settings.json')) {
      return await this.getSettingsFromDatabase() as unknown as T;
    }
    
    // 기타 파일은 기본값 반환
    return defaultValue;
  }

  /**
   * 원자적 파일 업데이트 - SQLite 기반으로 변경
   */
  async atomicUpdate<T>(
    filePath: string, 
    updateFn: (current: T) => T, 
    defaultValue: T
  ): Promise<T> {
    // SQLite는 트랜잭션을 사용하므로 락이 필요 없음
    const current = await this.readJsonFileSafe(filePath, defaultValue);
    const updated = updateFn(current);
    
    // 업데이트된 데이터는 데이터베이스에 반영되지 않음 (읽기 전용)
    // 실제 업데이트는 각 도구에서 데이터베이스 직접 호출
    // console.warn( // JSON-RPC 간섭 방지'[FileSystem] atomicUpdate called but no database update performed');
    
    return updated;
  }

  /**
   * 동시성 안전 WorkMemoryDatabase 쓰기 - 더 이상 사용되지 않음
   */
  async writeWorkMemoryDatabaseSafe(database: WorkMemoryDatabase): Promise<void> {
    // console.warn( // JSON-RPC 간섭 방지'[FileSystem] writeWorkMemoryDatabaseSafe is deprecated - use database operations directly');
    // SQLite 기반에서는 개별 메모리 추가/수정으로 대체
  }

  /**
   * 동시성 안전 WorkMemoryDatabase 읽기 - SQLite 기반으로 변경
   */
  async readWorkMemoryDatabaseSafe(): Promise<WorkMemoryDatabase> {
    return await this.getWorkMemoryFromDatabase();
  }

  /**
   * 동시성 안전 SearchIndex 업데이트 - 더 이상 사용되지 않음
   */
  async updateSearchIndexSafe(updateFn: (index: SearchIndex) => SearchIndex): Promise<SearchIndex> {
    // console.warn( // JSON-RPC 간섭 방지'[FileSystem] updateSearchIndexSafe is deprecated - use database operations directly');
    const current = await this.getSearchIndexFromDatabase();
    return updateFn(current);
  }

  /**
   * 현재 작업 메모리 데이터베이스 읽기 - SQLite 기반으로 변경
   */
  async readWorkMemoryDatabase(): Promise<WorkMemoryDatabase> {
    return await this.getWorkMemoryFromDatabase();
  }

  /**
   * 현재 작업 메모리 데이터베이스 쓰기 - 더 이상 사용되지 않음
   */
  async writeWorkMemoryDatabase(data: WorkMemoryDatabase): Promise<void> {
    // console.warn( // JSON-RPC 간섭 방지'[FileSystem] writeWorkMemoryDatabase is deprecated - use database operations directly');
    // SQLite 기반에서는 개별 메모리 추가/수정/삭제로 대체
  }

  /**
   * 검색 인덱스 읽기 - SQLite 기반으로 변경
   */
  async readSearchIndex(): Promise<SearchIndex> {
    return await this.getSearchIndexFromDatabase();
  }

  /**
   * 검색 인덱스 쓰기 - 더 이상 사용되지 않음
   */
  async writeSearchIndex(index: SearchIndex): Promise<void> {
    // console.warn( // JSON-RPC 간섭 방지'[FileSystem] writeSearchIndex is deprecated - use database operations directly');
    // SQLite 기반에서는 개별 키워드/프로젝트 업데이트로 대체
  }

  /**
   * 설정 읽기 - SQLite 기반으로 변경
   */
  async readSettings(): Promise<Settings> {
    return await this.getSettingsFromDatabase();
  }

  /**
   * 설정 쓰기 - SQLite 기반으로 변경
   */
  async writeSettings(settings: Settings): Promise<void> {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    try {
      await connection.run('BEGIN TRANSACTION');

      // 기존 설정 삭제
      await connection.run('DELETE FROM system_settings');

             // 새 설정 삽입
       for (const [key, value] of Object.entries(settings)) {
         if (key === 'version' || key === 'last_updated') continue;

         let settingValue: string;
         let settingType: string;

         if (typeof value === 'object') {
           settingValue = JSON.stringify(value);
           settingType = 'json';
         } else if (typeof value === 'number') {
           settingValue = value.toString();
           settingType = 'number';
         } else if (typeof value === 'boolean') {
           settingValue = value.toString();
           settingType = 'boolean';
         } else {
           settingValue = String(value);
           settingType = 'string';
         }

         await connection.run(`
           INSERT INTO system_settings (setting_key, setting_value, setting_type, updated_at)
           VALUES (?, ?, ?, ?)
         `, [key, settingValue, settingType, new Date().toISOString()]);
       }
      await connection.run('COMMIT');

      // console.log( // JSON-RPC 간섭 방지'[FileSystem] Settings successfully written to database');
    } catch (error) {
      await connection.run('ROLLBACK');
      // console.error( // JSON-RPC 간섭 방지'[FileSystem] Failed to write settings to database:', error);
      throw error;
    }
  }

  /**
   * 히스토리 쓰기 - SQLite 기반으로 변경
   */
  async writeHistory(operation: string, data: any): Promise<void> {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    try {
      await connection.run(`
        INSERT INTO change_history (
          operation_type, 
          memory_id, 
          change_data, 
          timestamp, 
          metadata
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        operation,
        data.memory_id || null,
        JSON.stringify(data),
        new Date().toISOString(),
        JSON.stringify({ 
          source: 'file-system-manager',
          operation: operation 
        })
      ]);

      // console.log( // JSON-RPC 간섭 방지`[FileSystem] History entry written: ${operation}`);
    } catch (error) {
      // console.error( // JSON-RPC 간섭 방지'[FileSystem] Failed to write history:', error);
      // 히스토리 쓰기 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
  }
}