import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { databaseManager } from '../database/connection.js';
import { VersionManager } from '../history/version-manager.js';
import { VersionInfo } from '../history/types.js';
import { getCurrentISOString } from '../utils/index.js';
import { WorkMemory } from '../types/memory.js';

/**
 * 메모리 버전 복구 인수 타입
 */
export interface RestoreMemoryVersionArgs {
  memory_id: string;
  target_version?: string;
  restore_mode?: 'full' | 'selective' | 'preview';
  selective_fields?: string[];
  create_backup?: boolean;
  auto_version?: boolean;
  description?: string;
  confirm_restore?: boolean;
}

/**
 * 메모리 버전 목록 조회 인수 타입
 */
export interface ListMemoryVersionsArgs {
  memory_id: string;
  limit?: number;
  include_data?: boolean;
  format?: 'summary' | 'detailed';
}

export const restoreMemoryVersionTool: Tool = {
  name: 'restore_memory_version',
  description: '이전 버전으로 메모리를 복구합니다. 전체/선택적/미리보기 모드 지원',
  inputSchema: {
    type: 'object',
    properties: {
      memory_id: {
        type: 'string',
        description: '복구할 메모리의 ID',
        minLength: 1
      },
      target_version: {
        type: 'string',
        description: '복구할 대상 버전 (선택사항, 미지정시 가장 최근 이전 버전)',
        minLength: 1
      },
      restore_mode: {
        type: 'string',
        enum: ['full', 'selective', 'preview'],
        description: '복구 모드: full(전체 복구), selective(선택적 복구), preview(미리보기)',
        default: 'full'
      },
      selective_fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'selective 모드에서 복구할 필드 목록',
        maxItems: 10
      },
      create_backup: {
        type: 'boolean',
        description: '복구 전 현재 상태를 백업으로 저장할지 여부',
        default: true
      },
      auto_version: {
        type: 'boolean',
        description: '복구 후 자동으로 새 버전을 생성할지 여부',
        default: true
      },
      description: {
        type: 'string',
        description: '복구 작업에 대한 설명',
        maxLength: 200
      },
      confirm_restore: {
        type: 'boolean',
        description: '복구 실행 확인 (true로 설정해야 실제 복구 수행)',
        default: false
      }
    },
    required: ['memory_id']
  }
};

export const listMemoryVersionsTool: Tool = {
  name: 'list_memory_versions',
  description: '메모리의 모든 버전 목록을 조회합니다',
  inputSchema: {
    type: 'object',
    properties: {
      memory_id: {
        type: 'string',
        description: '조회할 메모리의 ID',
        minLength: 1
      },
      limit: {
        type: 'number',
        description: '조회할 최대 버전 수',
        minimum: 1,
        maximum: 100,
        default: 20
      },
      include_data: {
        type: 'boolean',
        description: '각 버전의 데이터 정보도 포함할지 여부',
        default: false
      },
      format: {
        type: 'string',
        enum: ['summary', 'detailed'],
        description: '출력 형식: summary(요약), detailed(상세)',
        default: 'summary'
      }
    },
    required: ['memory_id']
  }
};

export async function handleRestoreMemoryVersion(args: RestoreMemoryVersionArgs): Promise<string> {
  try {
    const connection = databaseManager.getConnection();

    // 1. 메모리 존재 확인
    const currentMemory = await connection.get(
      'SELECT * FROM work_memories WHERE id = ? AND is_archived = 0',
      [args.memory_id]
    );

    if (!currentMemory) {
      return `❌ ID '${args.memory_id}'인 메모리를 찾을 수 없습니다.`;
    }

    const versionManager = new VersionManager(connection);

    // 2. 대상 버전 확인 및 결정
    const targetVersion = await (async (): Promise<VersionInfo> => {
      if (args.target_version) {
        const foundVersion = await versionManager.getVersion(args.memory_id, args.target_version);
        if (!foundVersion) {
          throw new Error(`❌ 버전 '${args.target_version}'을 찾을 수 없습니다.`);
        }
        return foundVersion;
      } else {
        // 가장 최근 이전 버전 가져오기
        const versions = await versionManager.getVersions(args.memory_id, 2);
        if (versions.length < 2) {
          throw new Error(`❌ 복구할 이전 버전이 없습니다.`);
        }
        return versions[1]; // 두 번째가 이전 버전
      }
    })().catch(error => {
      throw error;
    });

    // 3. 미리보기 모드
    if (args.restore_mode === 'preview') {
      return formatRestorePreview(currentMemory, targetVersion, args.selective_fields);
    }

    // 4. 복구 확인
    if (!args.confirm_restore) {
      return `⚠️ 복구를 진행하려면 confirm_restore를 true로 설정해주세요.\n\n` +
             `복구 대상: ${args.memory_id} → 버전 ${targetVersion.version}\n` +
             `복구 모드: ${args.restore_mode || 'full'}\n` +
             `백업 생성: ${args.create_backup !== false ? '예' : '아니오'}`;
    }

    // 5. 백업 생성 (설정된 경우)
    let backupVersion: any = null;
    if (args.create_backup !== false) {
      try {
        const currentData: WorkMemory = {
          id: currentMemory.id,
          content: currentMemory.content,
          project: currentMemory.project,
          tags: JSON.parse(currentMemory.tags || '[]'),
          created_at: currentMemory.created_at,
          updated_at: currentMemory.updated_at,
          created_by: currentMemory.created_by,
          access_count: currentMemory.access_count,
          importance_score: currentMemory.importance_score
        };

        backupVersion = await versionManager.createVersion(
          args.memory_id,
          currentData,
          undefined,
          'Backup before restore operation'
        );
      } catch (backupError) {
        return `❌ 백업 생성 실패: ${backupError instanceof Error ? backupError.message : '알 수 없는 오류'}`;
      }
    }

    // 6. 복구 실행
    try {
      const now = getCurrentISOString();
      let restoredData = targetVersion.data;

      if (args.restore_mode === 'selective' && args.selective_fields) {
        // 선택적 복구: 지정된 필드만 복구
        const currentData = {
          id: currentMemory.id,
          content: currentMemory.content,
          project: currentMemory.project,
          tags: JSON.parse(currentMemory.tags || '[]'),
          created_at: currentMemory.created_at,
          updated_at: currentMemory.updated_at,
          created_by: currentMemory.created_by,
          access_count: currentMemory.access_count,
          importance_score: currentMemory.importance_score
        };

        restoredData = { ...currentData };
        for (const field of args.selective_fields) {
          if (field in targetVersion.data) {
            (restoredData as any)[field] = targetVersion.data[field];
          }
        }
        restoredData.updated_at = now;
      }

      // 데이터베이스 업데이트
      await connection.run(`
        UPDATE work_memories 
        SET content = ?, project = ?, tags = ?, importance = ?, updated_at = ?
        WHERE id = ?
      `, [
        restoredData.content,
        restoredData.project,
        JSON.stringify(restoredData.tags || []),
        restoredData.importance_score,
        now,
        args.memory_id
      ]);

      // 변경 히스토리 기록
      const changeResult = await connection.run(`
        INSERT INTO change_history (
          memory_id, action, timestamp, details, old_data, new_data
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        args.memory_id,
        'restored',
        now,
        `Restored from version ${targetVersion.version} (${args.restore_mode} mode)`,
        JSON.stringify(currentMemory),
        JSON.stringify(restoredData)
      ]);

      // 7. 자동 버전 생성 (설정된 경우)
      let newVersionInfo = '';
      if (args.auto_version !== false) {
        try {
          const newVersion = await versionManager.createVersion(
            args.memory_id,
            restoredData,
            changeResult.lastInsertRowid as number,
            args.description || `Restored from version ${targetVersion.version}`
          );
          newVersionInfo = `\n🔄 새 버전 생성: ${newVersion.version}`;
        } catch (versionError) {
          newVersionInfo = '\n⚠️ 새 버전 생성 실패 (복구는 완료됨)';
        }
      }

      // 8. 검색 키워드 업데이트 (태그가 변경된 경우)
      if (JSON.stringify(restoredData.tags) !== currentMemory.tags) {
        await connection.run(
          'DELETE FROM search_keywords WHERE memory_id = ? AND source = ?',
          [args.memory_id, 'tags']
        );

        for (const tag of restoredData.tags || []) {
          await connection.run(`
            INSERT OR IGNORE INTO search_keywords (
              memory_id, keyword, source, weight
            ) VALUES (?, ?, ?, ?)
          `, [args.memory_id, tag, 'tags', 2.0]);
        }
      }

      const mode = args.restore_mode === 'selective' ? 
        `선택적 복구 (${args.selective_fields?.join(', ')})` : '전체 복구';
      
      let result = `✅ 메모리 '${args.memory_id}'가 버전 ${targetVersion.version}으로 복구되었습니다.\n`;
      result += `📋 복구 모드: ${mode}`;
      if (backupVersion) {
        result += `\n💾 백업 버전: ${backupVersion.version}`;
      }
      result += newVersionInfo;

      return result;

    } catch (restoreError) {
      return `❌ 복구 실행 실패: ${restoreError instanceof Error ? restoreError.message : '알 수 없는 오류'}`;
    }

  } catch (error) {
    return `❌ 버전 복구 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}

export async function handleListMemoryVersions(args: ListMemoryVersionsArgs): Promise<string> {
  try {
    const connection = databaseManager.getConnection();

    // 메모리 존재 확인
    const memory = await connection.get(
      'SELECT id, content FROM work_memories WHERE id = ? AND is_archived = 0',
      [args.memory_id]
    );

    if (!memory) {
      return `❌ ID '${args.memory_id}'인 메모리를 찾을 수 없습니다.`;
    }

    const versionManager = new VersionManager(connection);
    const versions = await versionManager.getVersions(args.memory_id, args.limit);

    if (versions.length === 0) {
      return `📝 메모리 '${args.memory_id}'에는 아직 버전이 없습니다.`;
    }

    return formatVersionsList(versions, args.format || 'summary', args.include_data || false);

  } catch (error) {
    return `❌ 버전 목록 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}

/**
 * 복구 미리보기 생성
 */
function formatRestorePreview(currentMemory: any, targetVersion: any, selectiveFields?: string[]): string {
  const current = {
    content: currentMemory.content,
    project: currentMemory.project,
    tags: JSON.parse(currentMemory.tags || '[]'),
    importance: currentMemory.importance
  };

  const target = targetVersion.data;

  let result = `🔍 복구 미리보기: 버전 ${targetVersion.version}\n\n`;
  result += `📅 대상 버전 생성일: ${new Date(targetVersion.timestamp).toLocaleString('ko-KR')}\n\n`;

  if (selectiveFields && selectiveFields.length > 0) {
    result += `📋 선택적 복구 대상 필드: ${selectiveFields.join(', ')}\n\n`;
    
    for (const field of selectiveFields) {
      if (field in current && field in target) {
        result += `🔄 ${field}:\n`;
        result += `  현재: ${JSON.stringify(current[field as keyof typeof current])}\n`;
        result += `  복구될 값: ${JSON.stringify(target[field])}\n\n`;
      }
    }
  } else {
    result += `📋 전체 복구 미리보기:\n\n`;
    
    const fields = ['content', 'project', 'tags', 'importance'];
    for (const field of fields) {
      const currentValue = current[field as keyof typeof current];
      const targetValue = target[field];
      
      if (JSON.stringify(currentValue) !== JSON.stringify(targetValue)) {
        result += `🔄 ${field}:\n`;
        result += `  현재: ${JSON.stringify(currentValue)}\n`;
        result += `  복구될 값: ${JSON.stringify(targetValue)}\n\n`;
      }
    }
  }

  result += `⚠️ 실제 복구를 수행하려면 confirm_restore=true로 설정하세요.`;
  return result;
}

/**
 * 버전 목록 포맷팅
 */
function formatVersionsList(versions: any[], format: string, includeData: boolean): string {
  let result = `📚 버전 목록 (총 ${versions.length}개)\n\n`;

  versions.forEach((version, index) => {
    const date = new Date(version.timestamp).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    if (format === 'detailed') {
      result += `${index + 1}. 📦 버전 ${version.version}\n`;
      result += `   📅 생성일: ${date}\n`;
      result += `   📏 크기: ${formatBytes(version.size)}\n`;
      if (version.description) {
        result += `   📝 설명: ${version.description}\n`;
      }
      if (version.changeLogId) {
        result += `   🔗 변경 로그 ID: ${version.changeLogId}\n`;
      }
      
      if (includeData && version.data) {
        result += `   💾 내용 미리보기: ${version.data.content?.substring(0, 80)}${version.data.content?.length > 80 ? '...' : ''}\n`;
        if (version.data.project) {
          result += `   🗂️ 프로젝트: ${version.data.project}\n`;
        }
        if (version.data.tags && version.data.tags.length > 0) {
          result += `   🏷️ 태그: ${version.data.tags.join(', ')}\n`;
        }
        result += `   ⭐ 중요도: ${version.data.importance}\n`;
      }
      result += '\n';
    } else {
      result += `${index + 1}. v${version.version} (${date}) - ${formatBytes(version.size)}`;
      if (version.description) {
        result += ` - ${version.description}`;
      }
      result += '\n';
    }
  });

  return result;
}

/**
 * 바이트 수를 읽기 쉬운 형식으로 변환
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}