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
  
  // 새 기능: 세션 기반 삭제
  session_id?: string;
  
  // 새 기능: 중요도 점수 기반 삭제
  min_importance_score?: number;
  max_importance_score?: number;
  
  // 새 기능: 작업 유형 기반 삭제
  work_type?: 'memory' | 'todo';
  worked?: '완료' | '미완료';
  
  // 새 기능: 생성자 기반 삭제
  created_by?: string;
  
  // 새 기능: 복합 조건 삭제
  combined_criteria?: {
    session_id?: string;
    project?: string;
    importance_range?: { min?: number; max?: number };
    work_type?: 'memory' | 'todo';
    worked?: '완료' | '미완료';
    older_than_days?: number;
  };
}

export const deleteWorkMemoryTool: Tool = {
  name: 'delete_work_memory',
  description: '워크 메모리를 삭제하거나 아카이브합니다. 단일/복수/세션/점수/유형 기반 일괄 삭제 지원',
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
      session_id: {
        type: 'string',
        description: '특정 세션의 모든 메모리 삭제',
        minLength: 1
      },
      min_importance_score: {
        type: 'number',
        description: '최소 중요도 점수 (이상 삭제)',
        minimum: 0,
        maximum: 100
      },
      max_importance_score: {
        type: 'number',
        description: '최대 중요도 점수 (이하 삭제)',
        minimum: 0,
        maximum: 100
      },
      work_type: {
        type: 'string',
        enum: ['memory', 'todo'],
        description: '작업 유형별 삭제 (memory: 메모리, todo: 할일)'
      },
      worked: {
        type: 'string',
        enum: ['완료', '미완료'],
        description: '완료 상태별 삭제 (완료된 것 또는 미완료된 것)'
      },
      created_by: {
        type: 'string',
        description: '특정 생성자의 메모리만 삭제',
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
      },
      combined_criteria: {
        type: 'object',
        description: '복합 조건으로 삭제 (여러 조건 동시 적용)',
        properties: {
          session_id: { type: 'string' },
          project: { type: 'string' },
          importance_range: {
            type: 'object',
            properties: {
              min: { type: 'number', minimum: 0, maximum: 100 },
              max: { type: 'number', minimum: 0, maximum: 100 }
            },
            additionalProperties: false
          },
          work_type: { type: 'string', enum: ['memory', 'todo'] },
          worked: { type: 'string', enum: ['완료', '미완료'] },
          older_than_days: { type: 'number', minimum: 1 }
        }
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
    if (args.combined_criteria) {
      // 복합 조건 처리
      const criteria = args.combined_criteria;
      const conditions: string[] = [];
      const conditionParams: any[] = [];

      if (criteria.session_id) {
        // session_id 컬럼 존재 여부 확인
        try {
          await connection.get('SELECT session_id FROM work_memories LIMIT 1');
          conditions.push('session_id = ?');
          conditionParams.push(criteria.session_id);
        } catch (sessionError) {
          return '❌ 복합 조건의 session_id는 현재 지원되지 않습니다. session_id를 제외하고 다시 시도해주세요.';
        }
      }
      if (criteria.project) {
        conditions.push('project = ?');
        conditionParams.push(criteria.project);
      }
      if (criteria.importance_range) {
        if (criteria.importance_range.min !== undefined) {
          conditions.push('importance_score >= ?');
          conditionParams.push(criteria.importance_range.min);
        }
        if (criteria.importance_range.max !== undefined) {
          conditions.push('importance_score <= ?');
          conditionParams.push(criteria.importance_range.max);
        }
      }
      if (criteria.work_type) {
        conditions.push('work_type = ?');
        conditionParams.push(criteria.work_type);
      }
      if (criteria.worked) {
        conditions.push('worked = ?');
        conditionParams.push(criteria.worked);
      }
      if (criteria.older_than_days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - criteria.older_than_days);
        conditions.push('created_at < ?');
        conditionParams.push(cutoffDate.toISOString());
      }

      if (conditions.length === 0) {
        return '❌ 복합 조건에서 최소 하나의 조건은 지정해야 합니다.';
      }

      whereClause = `WHERE ${conditions.join(' AND ')}`;
      params = conditionParams;
    } else if (args.id) {
      whereClause = 'WHERE id = ?';
      params = [args.id];
    } else if (args.ids && args.ids.length > 0) {
      whereClause = `WHERE id IN (${args.ids.map(() => '?').join(',')})`;
      params = args.ids;
    } else if (args.session_id) {
      // session_id 존재 여부 확인 후 처리
      try {
        const sessionCheck = await connection.get('SELECT COUNT(*) as count FROM work_memories WHERE session_id IS NOT NULL LIMIT 1');
        whereClause = 'WHERE session_id = ?';
        params = [args.session_id];
      } catch (sessionError) {
        return '❌ 세션 기반 삭제는 현재 지원되지 않습니다. 다른 조건을 사용해주세요.';
      }
    } else if (args.project) {
      whereClause = 'WHERE project = ?';
      params = [args.project];
    } else if (args.min_importance_score !== undefined || args.max_importance_score !== undefined) {
      const conditions: string[] = [];
      const scoreParams: any[] = [];
      
      if (args.min_importance_score !== undefined) {
        conditions.push('importance_score >= ?');
        scoreParams.push(args.min_importance_score);
      }
      if (args.max_importance_score !== undefined) {
        conditions.push('importance_score <= ?');
        scoreParams.push(args.max_importance_score);
      }
      
      whereClause = `WHERE ${conditions.join(' AND ')}`;
      params = scoreParams;
    } else if (args.work_type) {
      const conditions = ['work_type = ?'];
      const typeParams: any[] = [args.work_type];
      
      if (args.worked) {
        conditions.push('worked = ?');
        typeParams.push(args.worked);
      }
      
      whereClause = `WHERE ${conditions.join(' AND ')}`;
      params = typeParams;
    } else if (args.worked) {
      whereClause = 'WHERE worked = ?';
      params = [args.worked];
    } else if (args.created_by) {
      whereClause = 'WHERE created_by = ?';
      params = [args.created_by];
    } else if (args.older_than_days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - args.older_than_days);
      whereClause = 'WHERE created_at < ?';
      params = [cutoffDate.toISOString()];
    } else {
      return '❌ 삭제할 대상을 지정해야 합니다.';
    }

    // 삭제 전 개수 확인 및 안전성 검사
    const countResult = await connection.get(
      `SELECT COUNT(*) as count FROM work_memories ${whereClause}`,
      params
    );
    const totalCount = countResult.count;

    if (totalCount === 0) {
      return '❌ 삭제할 메모리를 찾을 수 없습니다.';
    }

    // 대량 삭제 시 안전성 확인
    if (totalCount > 1000 && !args.confirm) {
      return `⚠️ ${totalCount}개의 대량 삭제가 예정되어 있습니다. 안전을 위해 confirm=true를 설정해주세요.`;
    }

    // 매우 대량 삭제 시 추가 보호
    if (totalCount > 5000) {
      return `❌ ${totalCount}개는 너무 많습니다. 배치 크기를 줄이거나 여러 번에 나누어 삭제해주세요. (최대 5000개)`;
    }

    // 트랜잭션으로 안전하게 처리
    try {
      if (totalCount > 100) {
        // 대량 삭제는 배치 처리로 안전하게
        if (args.archive_only) {
          await connection.batch([
            { sql: `UPDATE work_memories SET is_archived = 1, archived_at = datetime('now') ${whereClause}`, params }
          ]);
        } else {
          await connection.batch([
            { sql: `DELETE FROM work_memories ${whereClause}`, params }
          ]);
        }
      } else {
        // 소량 삭제는 단일 쿼리로
        if (args.archive_only) {
          await connection.run(
            `UPDATE work_memories SET is_archived = 1, archived_at = datetime('now') ${whereClause}`,
            params
          );
        } else {
          await connection.run(
            `DELETE FROM work_memories ${whereClause}`,
            params
          );
        }
      }
      
      const action = args.archive_only ? '아카이브' : '삭제';
      return `✅ ${totalCount}개의 메모리를 ${action}했습니다.`;
      
    } catch (dbError) {
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      return `❌ 데이터베이스 오류: ${errorMsg}. 작업이 롤백되었습니다.`;
    }

  } catch (error) {
    return `❌ 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}