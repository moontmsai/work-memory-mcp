import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';
import { VersionManager } from '../history/version-manager.js';

/**
 * get_work_memory_versions MCP 도구
 * 메모리 버전 정보 조회 및 비교 기능
 */

export interface GetWorkMemoryVersionsArgs {
  memory_id: string;
  version?: string;
  compare_versions?: boolean;
  from_version?: string;
  to_version?: string;
  include_data?: boolean;
  limit?: number;
  format?: 'list' | 'comparison' | 'detailed';
}

export const getWorkMemoryVersionsTool: Tool = {
  name: 'get_work_memory_versions',
  description: '메모리의 버전 정보를 조회하고 버전 간 비교를 수행합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      memory_id: {
        type: 'string',
        description: '조회할 메모리의 ID (필수)',
        minLength: 1
      },
      version: {
        type: 'string',
        description: '특정 버전 조회 (선택사항, 예: "1.0.0")',
        minLength: 1
      },
      compare_versions: {
        type: 'boolean',
        description: '버전 비교 모드 활성화 (기본값: false)',
        default: false
      },
      from_version: {
        type: 'string',
        description: '비교 시작 버전 (compare_versions가 true일 때 필수)',
        minLength: 1
      },
      to_version: {
        type: 'string',
        description: '비교 대상 버전 (compare_versions가 true일 때 필수)',
        minLength: 1
      },
      include_data: {
        type: 'boolean',
        description: '버전 데이터 포함 여부 (기본값: false)',
        default: false
      },
      limit: {
        type: 'number',
        description: '조회할 버전 수 제한 (기본값: 10)',
        minimum: 1,
        maximum: 50,
        default: 10
      },
      format: {
        type: 'string',
        enum: ['list', 'comparison', 'detailed'],
        description: '출력 형식 (기본값: list)',
        default: 'list'
      }
    },
    required: ['memory_id']
  }
};

export async function handleGetWorkMemoryVersions(args: GetWorkMemoryVersionsArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    // 1. 메모리 존재 확인
    const memory = await connection.get(
      'SELECT id, content FROM work_memories WHERE id = ? AND is_archived = 0',
      [args.memory_id]
    );

    if (!memory) {
      return `❌ ID '${args.memory_id}'인 메모리를 찾을 수 없습니다.`;
    }

    const versionManager = new VersionManager(connection);

    // 2. 버전 비교 모드
    if (args.compare_versions) {
      if (!args.from_version || !args.to_version) {
        return '❌ 버전 비교를 위해서는 from_version과 to_version이 필요합니다.';
      }

      try {
        const comparison = await versionManager.compareVersions(
          args.memory_id,
          args.from_version,
          args.to_version
        );

        return formatVersionComparison(comparison);
      } catch (error) {
        return `❌ 버전 비교 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
      }
    }

    // 3. 특정 버전 조회
    if (args.version) {
      try {
        const versionInfo = await versionManager.getVersion(args.memory_id, args.version);
        
        if (!versionInfo) {
          return `❌ 버전 '${args.version}'을 찾을 수 없습니다.`;
        }

        return formatSingleVersion(versionInfo, args.include_data || false);
      } catch (error) {
        return `❌ 버전 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
      }
    }

    // 4. 버전 목록 조회
    try {
      const versions = await versionManager.getVersions(args.memory_id, args.limit);
      
      if (versions.length === 0) {
        return `📝 메모리 '${args.memory_id}'에는 아직 버전이 없습니다.`;
      }

      return formatVersionList(versions, args.format || 'list', args.include_data || false);
    } catch (error) {
      return `❌ 버전 목록 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
    }

  } catch (error) {
    return `❌ 버전 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}

/**
 * 단일 버전 정보 포맷팅
 */
function formatSingleVersion(version: any, includeData: boolean): string {
  const date = new Date(version.timestamp).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  let result = `📋 버전 ${version.version} 정보\n\n`;
  result += `🕒 생성 시간: ${date}\n`;
  result += `📏 데이터 크기: ${formatBytes(version.size)}\n`;
  if (version.description) {
    result += `📝 설명: ${version.description}\n`;
  }
  if (version.changeLogId) {
    result += `🔗 변경 로그 ID: ${version.changeLogId}\n`;
  }

  if (includeData && version.data) {
    result += `\n📄 버전 데이터:\n`;
    result += `내용: ${version.data.content?.substring(0, 200)}${version.data.content?.length > 200 ? '...' : ''}\n`;
    if (version.data.project) {
      result += `프로젝트: ${version.data.project}\n`;
    }
    if (version.data.tags && version.data.tags.length > 0) {
      result += `태그: ${version.data.tags.join(', ')}\n`;
    }
    result += `중요도: ${version.data.importance}\n`;
  }

  return result;
}

/**
 * 버전 목록 포맷팅
 */
function formatVersionList(versions: any[], format: string, includeData: boolean): string {
  let result = `📚 버전 목록 (총 ${versions.length}개)\n\n`;

  if (format === 'detailed') {
    versions.forEach((version, index) => {
      const date = new Date(version.timestamp).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      result += `${index + 1}. 버전 ${version.version}\n`;
      result += `   📅 생성: ${date}\n`;
      result += `   📏 크기: ${formatBytes(version.size)}\n`;
      if (version.description) {
        result += `   📝 ${version.description}\n`;
      }
      
      if (includeData && version.data) {
        result += `   💾 내용: ${version.data.content?.substring(0, 100)}${version.data.content?.length > 100 ? '...' : ''}\n`;
      }
      result += '\n';
    });
  } else {
    // 간단한 목록 형식
    versions.forEach((version, index) => {
      const date = new Date(version.timestamp).toLocaleDateString('ko-KR');
      result += `${index + 1}. v${version.version} (${date}) - ${formatBytes(version.size)}`;
      if (version.description) {
        result += ` - ${version.description}`;
      }
      result += '\n';
    });
  }

  return result;
}

/**
 * 버전 비교 결과 포맷팅
 */
function formatVersionComparison(comparison: any): string {
  let result = `🔄 버전 비교: ${comparison.fromVersion} → ${comparison.toVersion}\n\n`;
  
  result += `📊 변경 요약:\n`;
  result += `• 추가: ${comparison.summary.additions}개\n`;
  result += `• 삭제: ${comparison.summary.deletions}개\n`;
  result += `• 수정: ${comparison.summary.modifications}개\n\n`;

  if (comparison.differences.length > 0) {
    result += `📝 상세 변경사항:\n`;
    comparison.differences.forEach((diff: any, index: number) => {
      result += `${index + 1}. [${diff.type.toUpperCase()}] ${diff.field}\n`;
      
      if (diff.type === 'added') {
        result += `   + ${JSON.stringify(diff.newValue)}\n`;
      } else if (diff.type === 'removed') {
        result += `   - ${JSON.stringify(diff.oldValue)}\n`;
      } else if (diff.type === 'modified') {
        result += `   - ${JSON.stringify(diff.oldValue)}\n`;
        result += `   + ${JSON.stringify(diff.newValue)}\n`;
      }
      result += '\n';
    });
  } else {
    result += `✅ 두 버전 간 차이점이 없습니다.\n`;
  }

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