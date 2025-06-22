import { DatabaseConnection } from '../database/connection.js';
import { 
  VersionInfo, 
  VersionQuery, 
  VersionComparisonResult, 
  VersionDifference 
} from './types.js';
import { WorkMemory } from '../types/memory.js';
import { safeStringify, safeParse, extractSafeWorkMemory } from '../utils/safe-json.js';

/**
 * SQLite 기반 메모리 버전 관리 클래스
 */
export class VersionManager {
  private connection: DatabaseConnection;

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
  }

  /**
   * 새 버전 생성 및 저장
   */
  async createVersion(
    memoryId: string,
    memoryData: WorkMemory,
    changeLogId?: number,
    description?: string
  ): Promise<VersionInfo> {
    try {
      // 버전 관리 활성화 확인
      const versioningEnabled = await this.connection.get(
        'SELECT value FROM system_settings WHERE key = ?',
        ['enable_versioning']
      );

      if (!versioningEnabled || versioningEnabled.value !== 'true') {
        throw new Error('Versioning is disabled');
      }

      // 기존 버전들 조회
      const existingVersions = await this.getVersions(memoryId);
      
      // 새 버전 번호 생성
      const newVersionNumber = this.generateVersionNumber(existingVersions);
      
      const dataString = safeStringify(memoryData);
      const size = dataString.length;

      // 새 버전 생성
      const result = await this.connection.run(`
        INSERT INTO memory_versions (
          memory_id, version, data, change_log_id, size, description, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        memoryId,
        newVersionNumber,
        dataString,
        changeLogId || null,
        size,
        description || 'Auto-generated version',
        'system'
      ]);

      // 생성된 버전 정보 조회
      const versionInfo = await this.connection.get(
        'SELECT * FROM memory_versions WHERE id = ?',
        [result.lastInsertRowid]
      );

      // 안전한 JSON 파싱 (한글 호환) - 기본 WorkMemory 구조 제공
      const defaultMemory = {
        id: memoryId,
        content: '',
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: 'system',
        access_count: 0,
        importance_score: 50
      };
      const parsedData = safeParse(versionInfo.data, defaultMemory);

      return {
        version: versionInfo.version,
        timestamp: versionInfo.timestamp,
        changeLogId: versionInfo.change_log_id,
        memoryId: versionInfo.memory_id,
        data: parsedData,
        size: versionInfo.size,
        description: versionInfo.description
      };

    } catch (error) {
      throw new Error(`Failed to create version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 메모리의 모든 버전 조회
   */
  async getVersions(memoryId: string, limit?: number): Promise<VersionInfo[]> {
    try {
      const query = `
        SELECT * FROM memory_versions
        WHERE memory_id = ?
        ORDER BY timestamp DESC
        ${limit ? 'LIMIT ?' : ''}
      `;

      const params = limit ? [memoryId, limit] : [memoryId];
      const versions = await this.connection.all(query, params);

      return versions.map(v => {
        // 안전한 JSON 파싱 (한글 호환) - 기본 WorkMemory 구조 제공
        const defaultMemory = {
          id: v.memory_id,
          content: '',
          tags: [],
          created_at: v.timestamp,
          updated_at: v.timestamp,
          created_by: 'system',
          access_count: 0,
          importance_score: 50
        };
        const parsedData = safeParse(v.data, defaultMemory);

        return {
          version: v.version,
          timestamp: v.timestamp,
          changeLogId: v.change_log_id,
          memoryId: v.memory_id,
          data: parsedData,
          size: v.size,
          description: v.description
        };
      });

    } catch (error) {
      throw new Error(`Failed to get versions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 특정 버전 조회
   */
  async getVersion(memoryId: string, version: string): Promise<VersionInfo | null> {
    try {
      // 버전 번호 정규화 (v1.0.0 → 1.0.0)
      const normalizedVersion = version.startsWith('v') ? version.substring(1) : version;
      
      const versionData = await this.connection.get(
        'SELECT * FROM memory_versions WHERE memory_id = ? AND version = ?',
        [memoryId, normalizedVersion]
      );

      if (!versionData) {
        return null;
      }

      // 안전한 JSON 파싱 (한글 호환) - 기본 WorkMemory 구조 제공
      const defaultMemory = {
        id: memoryId,
        content: '',
        tags: [],
        created_at: versionData.timestamp,
        updated_at: versionData.timestamp,
        created_by: 'system',
        access_count: 0,
        importance_score: 50
      };
      const parsedData = safeParse(versionData.data, defaultMemory);

      return {
        version: versionData.version,
        timestamp: versionData.timestamp,
        changeLogId: versionData.change_log_id,
        memoryId: versionData.memory_id,
        data: parsedData,
        size: versionData.size,
        description: versionData.description
      };

    } catch (error) {
      throw new Error(`Failed to get version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 최신 버전 조회
   */
  async getLatestVersion(memoryId: string): Promise<VersionInfo | null> {
    const versions = await this.getVersions(memoryId, 1);
    return versions.length > 0 ? versions[0] : null;
  }

  /**
   * 두 버전 간 비교
   */
  async compareVersions(
    memoryId: string,
    fromVersion: string,
    toVersion: string
  ): Promise<VersionComparisonResult> {
    try {
      const fromVersionInfo = await this.getVersion(memoryId, fromVersion);
      const toVersionInfo = await this.getVersion(memoryId, toVersion);

      if (!fromVersionInfo || !toVersionInfo) {
        throw new Error('One or both versions not found');
      }

      const differences = this.calculateDifferences(
        fromVersionInfo.data,
        toVersionInfo.data
      );

      const summary = {
        additions: differences.filter(d => d.type === 'added').length,
        deletions: differences.filter(d => d.type === 'removed').length,
        modifications: differences.filter(d => d.type === 'modified').length
      };

      return {
        memoryId,
        fromVersion,
        toVersion,
        differences,
        summary
      };

    } catch (error) {
      throw new Error(`Failed to compare versions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 특정 버전으로 복원
   */
  async restoreVersion(memoryId: string, version: string): Promise<WorkMemory> {
    try {
      const versionInfo = await this.getVersion(memoryId, version);
      
      if (!versionInfo) {
        throw new Error(`Version ${version} not found for memory ${memoryId}`);
      }

      // 타입 안전한 WorkMemory 추출
      const defaultMemory: WorkMemory = {
        id: memoryId,
        content: '',
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: 'system',
        access_count: 0,
        importance_score: 50
      };

      return extractSafeWorkMemory(versionInfo.data, defaultMemory);

    } catch (error) {
      throw new Error(`Failed to restore version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 버전 삭제
   */
  async deleteVersion(memoryId: string, version: string): Promise<boolean> {
    try {
      const result = await this.connection.run(
        'DELETE FROM memory_versions WHERE memory_id = ? AND version = ?',
        [memoryId, version]
      );

      return result.changes > 0;

    } catch (error) {
      throw new Error(`Failed to delete version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 메모리의 모든 버전 삭제
   */
  async deleteAllVersions(memoryId: string): Promise<number> {
    try {
      const result = await this.connection.run(
        'DELETE FROM memory_versions WHERE memory_id = ?',
        [memoryId]
      );

      return result.changes;

    } catch (error) {
      throw new Error(`Failed to delete all versions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 버전 정리 (오래된 버전 삭제)
   */
  async cleanupVersions(memoryId: string, keepCount?: number): Promise<number> {
    try {
      const maxVersions = keepCount || await this.getMaxVersionsPerMemory();
      
      // 유지할 버전들의 ID 조회
      const keepVersions = await this.connection.all(`
        SELECT id FROM memory_versions
        WHERE memory_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `, [memoryId, maxVersions]);

      if (keepVersions.length === 0) {
        return 0;
      }

      // 유지할 버전 외 모든 버전 삭제
      const keepIds = keepVersions.map(v => v.id);
      const placeholders = keepIds.map(() => '?').join(',');
      
      const result = await this.connection.run(`
        DELETE FROM memory_versions 
        WHERE memory_id = ? AND id NOT IN (${placeholders})
      `, [memoryId, ...keepIds]);

      return result.changes;

    } catch (error) {
      throw new Error(`Failed to cleanup versions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 버전 통계 조회
   */
  async getVersionStatistics(memoryId?: string): Promise<{
    totalVersions: number;
    memoriesWithVersions: number;
    averageVersionsPerMemory: number;
    oldestVersion?: VersionInfo;
    newestVersion?: VersionInfo;
  }> {
    try {
      if (memoryId) {
        // 특정 메모리의 통계
        const versions = await this.getVersions(memoryId);
        return {
          totalVersions: versions.length,
          memoriesWithVersions: versions.length > 0 ? 1 : 0,
          averageVersionsPerMemory: versions.length,
          oldestVersion: versions[versions.length - 1],
          newestVersion: versions[0]
        };
      } else {
        // 전체 통계
        const stats = await this.connection.get(`
          SELECT 
            COUNT(*) as total_versions,
            COUNT(DISTINCT memory_id) as memories_with_versions
          FROM memory_versions
        `);

        const oldestVersion = await this.connection.get(`
          SELECT * FROM memory_versions
          ORDER BY timestamp ASC
          LIMIT 1
        `);

        const newestVersion = await this.connection.get(`
          SELECT * FROM memory_versions
          ORDER BY timestamp DESC
          LIMIT 1
        `);

        return {
          totalVersions: stats.total_versions,
          memoriesWithVersions: stats.memories_with_versions,
          averageVersionsPerMemory: stats.memories_with_versions > 0 
            ? stats.total_versions / stats.memories_with_versions 
            : 0,
          oldestVersion: oldestVersion ? {
            version: oldestVersion.version,
            timestamp: oldestVersion.timestamp,
            changeLogId: oldestVersion.change_log_id,
            memoryId: oldestVersion.memory_id,
            data: safeParse(oldestVersion.data, {
              id: oldestVersion.memory_id,
              content: '',
              tags: [],
              created_at: oldestVersion.timestamp,
              updated_at: oldestVersion.timestamp,
              created_by: 'system',
              access_count: 0,
              importance_score: 50
            }),
            size: oldestVersion.size,
            description: oldestVersion.description
          } : undefined,
          newestVersion: newestVersion ? {
            version: newestVersion.version,
            timestamp: newestVersion.timestamp,
            changeLogId: newestVersion.change_log_id,
            memoryId: newestVersion.memory_id,
            data: safeParse(newestVersion.data, {
              id: newestVersion.memory_id,
              content: '',
              tags: [],
              created_at: newestVersion.timestamp,
              updated_at: newestVersion.timestamp,
              created_by: 'system',
              access_count: 0,
              importance_score: 50
            }),
            size: newestVersion.size,
            description: newestVersion.description
          } : undefined
        };
      }

    } catch (error) {
      throw new Error(`Failed to get version statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 시스템 설정에서 최대 버전 수 조회
   */
  private async getMaxVersionsPerMemory(): Promise<number> {
    try {
      const setting = await this.connection.get(
        'SELECT value FROM system_settings WHERE key = ?',
        ['max_versions_per_memory']
      );
      return setting ? parseInt(setting.value) : 20;
    } catch (error) {
      return 20; // 기본값
    }
  }

  /**
   * 버전 번호 생성
   */
  private generateVersionNumber(existingVersions: VersionInfo[]): string {
    if (existingVersions.length === 0) {
      return '1.0.0';
    }

    // 최신 버전 번호 파싱
    const latestVersion = existingVersions[0].version;
    const [major, minor, patch] = latestVersion.split('.').map(Number);

    // 일반적으로 patch 버전 증가
    return `${major}.${minor}.${patch + 1}`;
  }

  /**
   * 두 버전 번호 비교
   */
  private compareVersionNumbers(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }

  /**
   * 두 데이터 간 차이점 계산
   */
  private calculateDifferences(oldData: any, newData: any): VersionDifference[] {
    const differences: VersionDifference[] = [];

    // 모든 키 수집
    const allKeys = new Set([
      ...Object.keys(oldData || {}),
      ...Object.keys(newData || {})
    ]);

    for (const key of allKeys) {
      const oldValue = oldData?.[key];
      const newValue = newData?.[key];

      if (oldValue === undefined && newValue !== undefined) {
        differences.push({
          field: key,
          type: 'added',
          oldValue: undefined,
          newValue: newValue
        });
      } else if (oldValue !== undefined && newValue === undefined) {
        differences.push({
          field: key,
          type: 'removed',
          oldValue: oldValue,
          newValue: undefined
        });
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        differences.push({
          field: key,
          type: 'modified',
          oldValue: oldValue,
          newValue: newValue
        });
      }
    }

    return differences;
  }
}