import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';

/**
 * delete_work_memory MCP 도구 (SQLite 기반)
 */

export interface DeleteWorkMemoryArgs {
  id?: string;
  ids?: string[];
  project?: string;
  archive_only?: boolean;
  confirm?: boolean;
  delete_all?: boolean;
  older_than_days?: number;
}

export const deleteWorkMemoryTool: Tool = {
  name: 'delete_work_memory',
  description: '워크 메모리를 삭제하거나 아카이브합니다. 단일/복수 삭제, 프로젝트별 삭제, 일괄 삭제 지원',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '삭제할 메모리 ID (단일 삭제)',
        minLength: 1
      },
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: '삭제할 메모리 ID 배열 (복수 삭제)',
        maxItems: 50
      },
      project: {
        type: 'string',
        description: '특정 프로젝트의 모든 메모리 삭제',
        minLength: 1
      },
      archive_only: {
        type: 'boolean',
        description: '완전 삭제 대신 아카이브로 이동 (기본값: false)',
        default: false
      },
      confirm: {
        type: 'boolean',
        description: '삭제 확인 (위험한 작업시 필수)',
        default: false
      },
      delete_all: {
        type: 'boolean',
        description: '모든 메모리 삭제 (confirm=true 필수)',
        default: false
      },
      older_than_days: {
        type: 'number',
        description: '지정된 일수보다 오래된 메모리만 삭제',
        minimum: 1
      }
    }
  }
};

/**
 * delete_work_memory 도구 핸들러 (SQLite 기반)
 */
export async function handleDeleteWorkMemory(args: DeleteWorkMemoryArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    // 전체 삭제시 확인 필수
    if (args.delete_all && !args.confirm) {
      return '❌ 전체 삭제시에는 confirm=true가 필요합니다.';
    }

    // delete_all인 경우, 모든 데이터를 삭제하고 바로 반환
    if (args.delete_all) {
      await connection.batch([
        { sql: 'DELETE FROM work_memories;' },
        { sql: 'DELETE FROM search_keywords;' },
        { sql: 'DELETE FROM change_history;' },
        { sql: 'DELETE FROM project_index;' }
      ]);
      // VACUUM을 위해 별도 도구를 사용하므로, 여기서는 삭제만 수행
      return `✅ 모든 작업 기억 관련 데이터를 삭제했습니다. DB 최적화를 원하시면 optimize_database 도구를 사용하세요.`;
    }

    let whereClause = '';
    let params: any[] = [];

    // 삭제 조건 구성
    if (args.id) {
      whereClause = 'WHERE id = ?';
      params = [args.id];
    } else if (args.ids && args.ids.length > 0) {
      whereClause = `WHERE id IN (${args.ids.map(() => '?').join(',')})`;
      params = args.ids;
    } else if (args.project) {
      whereClause = 'WHERE project = ?';
      params = [args.project];
    } else if (args.older_than_days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - args.older_than_days);
      whereClause = 'WHERE created_at < ?';
      params = [cutoffDate.toISOString()];
    } else {
      return '❌ 삭제할 대상을 지정해야 합니다.';
    }

    // 삭제 전 개수 확인
    const countResult = await connection.get(
      `SELECT COUNT(*) as count FROM work_memories ${whereClause}`,
      params
    );
    const totalCount = countResult.count;

    if (totalCount === 0) {
      return '❌ 삭제할 메모리를 찾을 수 없습니다.';
    }

    if (args.archive_only) {
      // 아카이브로 이동
      await connection.run(
        `UPDATE work_memories SET is_archived = 1 ${whereClause}`,
        params
      );
      
      return `✅ ${totalCount}개의 메모리를 아카이브했습니다.`;
    } else {
      // 완전 삭제
      await connection.run(
        `DELETE FROM work_memories ${whereClause}`,
        params
      );
      
      return `✅ ${totalCount}개의 메모리를 삭제했습니다.`;
    }

  } catch (error) {
    return `❌ 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}