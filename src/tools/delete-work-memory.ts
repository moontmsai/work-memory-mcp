import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';

/**
 * delete_work_memory MCP 도구 (SQLite 기반)
 */

export interface DeleteWorkMemoryArgs {
  // 기본 삭제 옵션
  id?: string;
  ids?: string[];
  project?: string;
  archive_only?: boolean;
  delete_all?: boolean;
  older_than_days?: number;
  
  // 카테고리별 삭제 옵션
  category?: 'work_memories' | 'sessions' | 'history' | 'search_index' | 'project_index' | 'all_data';
  
  // 세션 기반 삭제
  session_id?: string;
  delete_sessions?: boolean; // 세션 자체 삭제
  sessions_older_than_days?: number; // 오래된 세션 삭제
  
  // 히스토리 삭제
  delete_history?: boolean;
  history_older_than_days?: number;
  history_actions?: string[]; // 특정 액션만 삭제 (예: ['created', 'updated'])
  clean_orphaned_history?: boolean; // 고아 히스토리 정리
  history_memory_ids?: string[]; // 특정 메모리 ID의 히스토리만 삭제
  
  // 중요도 점수 기반 삭제
  min_importance_score?: number;
  max_importance_score?: number;
  
  // 작업 유형 기반 삭제
  work_type?: 'memory' | 'todo';
  worked?: '완료' | '미완료';
  
  // 생성자 기반 삭제
  created_by?: string;
  exclude_creators?: string[]; // 특정 생성자 제외
  
  // 검색 인덱스 삭제
  rebuild_search_index?: boolean; // 검색 인덱스 재구성
  clean_orphaned_keywords?: boolean; // 고아 키워드 정리
  
  // 프로젝트 인덱스 삭제
  clean_project_index?: boolean;
  
  // 복합 조건 삭제
  combined_criteria?: {
    session_id?: string;
    project?: string;
    importance_range?: { min?: number; max?: number };
    work_type?: 'memory' | 'todo';
    worked?: '완료' | '미완료';
    older_than_days?: number;
    exclude_ids?: string[]; // 특정 ID 제외
    creators_whitelist?: string[]; // 특정 생성자만 유지
  };
  
}

export const deleteWorkMemoryTool: Tool = {
  name: 'delete_work_memory',
  description: '종합 데이터 삭제 도구 - 작업기억, 세션, 히스토리, 검색인덱스 등 카테고리별 세분화된 삭제 지원. 단일/복수/조건부/전체 삭제 가능',
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
      // 카테고리별 삭제
      category: {
        type: 'string',
        enum: ['work_memories', 'sessions', 'history', 'search_index', 'project_index', 'all_data'],
        description: '삭제할 데이터 카테고리'
      },
      session_id: {
        type: 'string',
        description: '특정 세션의 모든 메모리 삭제',
        minLength: 1
      },
      delete_sessions: {
        type: 'boolean',
        description: '세션 데이터 자체를 삭제',
        default: false
      },
      sessions_older_than_days: {
        type: 'number',
        description: '지정된 일수보다 오래된 세션 삭제',
        minimum: 1
      },
      delete_history: {
        type: 'boolean',
        description: '변경 히스토리 삭제',
        default: false
      },
      history_older_than_days: {
        type: 'number',
        description: '지정된 일수보다 오래된 히스토리 삭제',
        minimum: 1
      },
      history_actions: {
        type: 'array',
        items: { type: 'string' },
        description: '삭제할 특정 히스토리 액션 (예: ["created", "updated"])'
      },
      clean_orphaned_history: {
        type: 'boolean',
        description: '고아 히스토리 정리 (메모리가 없는 히스토리)',
        default: false
      },
      history_memory_ids: {
        type: 'array',
        items: { type: 'string' },
        description: '특정 메모리 ID의 히스토리만 삭제'
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
      exclude_creators: {
        type: 'array',
        items: { type: 'string' },
        description: '삭제에서 제외할 생성자 목록'
      },
      rebuild_search_index: {
        type: 'boolean',
        description: '검색 인덱스 완전 재구성',
        default: false
      },
      clean_orphaned_keywords: {
        type: 'boolean',
        description: '고아된 검색 키워드 정리',
        default: false
      },
      clean_project_index: {
        type: 'boolean',
        description: '프로젝트 인덱스 정리',
        default: false
      },
      archive_only: {
        type: 'boolean',
        description: '완전 삭제 대신 아카이브로 이동 (기본값: false)',
        default: false
      },
      delete_all: {
        type: 'boolean',
        description: '모든 메모리 삭제',
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
          older_than_days: { type: 'number', minimum: 1 },
          exclude_ids: { 
            type: 'array', 
            items: { type: 'string' },
            description: '삭제에서 제외할 메모리 ID 목록'
          },
          creators_whitelist: {
            type: 'array',
            items: { type: 'string' },
            description: '유지할 생성자 목록 (나머지는 삭제)'
          }
        }
      }
    }
  }
};

/**
 * 종합 데이터 삭제 도구 핸들러 (SQLite 기반)
 */
export async function handleDeleteWorkMemory(args: DeleteWorkMemoryArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    // 카테고리별 삭제 처리
    if (args.category) {
      return await handleCategoryDelete(connection, args);
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
      
      // 제외 조건 추가
      if (criteria.exclude_ids && criteria.exclude_ids.length > 0) {
        const excludePlaceholders = criteria.exclude_ids.map(() => '?').join(',');
        conditions.push(`id NOT IN (${excludePlaceholders})`);
        conditionParams.push(...criteria.exclude_ids);
      }
      
      // 생성자 화이트리스트 (특정 생성자만 유지, 나머지 삭제)
      if (criteria.creators_whitelist && criteria.creators_whitelist.length > 0) {
        const whitelistPlaceholders = criteria.creators_whitelist.map(() => '?').join(',');
        conditions.push(`created_by NOT IN (${whitelistPlaceholders})`);
        conditionParams.push(...criteria.creators_whitelist);
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
      const conditions = ['created_by = ?'];
      const creatorParams: any[] = [args.created_by];
      
      // 제외할 생성자가 있는 경우 추가 조건
      if (args.exclude_creators && args.exclude_creators.length > 0) {
        const excludePlaceholders = args.exclude_creators.map(() => '?').join(',');
        conditions.push(`created_by NOT IN (${excludePlaceholders})`);
        creatorParams.push(...args.exclude_creators);
      }
      
      whereClause = `WHERE ${conditions.join(' AND ')}`;
      params = creatorParams;
    } else if (args.older_than_days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - args.older_than_days);
      const conditions = ['created_at < ?'];
      const dateParams: any[] = [cutoffDate.toISOString()];
      
      // 제외할 생성자가 있는 경우 추가 조건
      if (args.exclude_creators && args.exclude_creators.length > 0) {
        const excludePlaceholders = args.exclude_creators.map(() => '?').join(',');
        conditions.push(`created_by NOT IN (${excludePlaceholders})`);
        dateParams.push(...args.exclude_creators);
      }
      
      whereClause = `WHERE ${conditions.join(' AND ')}`;
      params = dateParams;
    } else if (args.exclude_creators && args.exclude_creators.length > 0) {
      // 특정 생성자 제외하고 나머지 모두 삭제
      const excludePlaceholders = args.exclude_creators.map(() => '?').join(',');
      whereClause = `WHERE created_by NOT IN (${excludePlaceholders})`;
      params = args.exclude_creators;
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



    // 삭제 실행
    try {
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

// ======== 헬퍼 함수들 ========

/**
 * 카테고리별 삭제 처리
 */
async function handleCategoryDelete(connection: any, args: DeleteWorkMemoryArgs): Promise<string> {
  const { category } = args;
  let result = '';
  
  switch (category) {
    case 'work_memories':
      return await handleWorkMemoryDeletion(connection, args);
      
    case 'sessions':
      return await handleSessionDeletion(connection, args);
      
    case 'history':
      return await handleHistoryDeletion(connection, args);
      
    case 'search_index':
      return await handleSearchIndexDeletion(connection, args);
      
    case 'project_index':
      return await handleProjectIndexDeletion(connection, args);
      
    case 'all_data':
      return await handleAllDataDeletion(connection, args);
      
    default:
      return `❌ 알 수 없는 카테고리: ${category}`;
  }
}

/**
 * 작업 메모리 삭제
 */
async function handleWorkMemoryDeletion(connection: any, args: DeleteWorkMemoryArgs): Promise<string> {
  // 기존 로직을 여기로 이동
  return '📝 작업 메모리 삭제 처리 중...';
}

/**
 * 세션 데이터 삭제
 */
async function handleSessionDeletion(connection: any, args: DeleteWorkMemoryArgs): Promise<string> {
  let result = '📋 **세션 데이터 삭제**\n\n';
  let deletedCount = 0;
  
  try {
    // 세션 테이블 존재 여부 확인
    const sessionTableExists = await connection.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='work_sessions'"
    );
    
    if (!sessionTableExists) {
      return result + 'ℹ️ 세션 테이블이 존재하지 않습니다.';
    }
    
    // 전체 세션 삭제
    if (args.delete_sessions) {
      const countResult = await connection.get('SELECT COUNT(*) as count FROM work_sessions');
      await connection.run('DELETE FROM work_sessions');
      deletedCount = countResult.count;
      result += `✅ 모든 세션 삭제: ${deletedCount}개\n`;
    }
    
    // 오래된 세션 삭제
    if (args.sessions_older_than_days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - args.sessions_older_than_days);
      
      const countResult = await connection.get(
        'SELECT COUNT(*) as count FROM work_sessions WHERE created_at < ?',
        [cutoffDate.toISOString()]
      );
      
      if (countResult.count > 0) {
        await connection.run(
          'DELETE FROM work_sessions WHERE created_at < ?',
          [cutoffDate.toISOString()]
        );
        result += `✅ ${args.sessions_older_than_days}일 이상 오래된 세션 삭제: ${countResult.count}개\n`;
        deletedCount += countResult.count;
      }
    }
    
    // 특정 세션 삭제
    if (args.session_id) {
      const deleteResult = await connection.run(
        'DELETE FROM work_sessions WHERE id = ?',
        [args.session_id]
      );
      
      if (deleteResult.changes > 0) {
        result += `✅ 세션 삭제: ${args.session_id}\n`;
        deletedCount += deleteResult.changes;
      } else {
        result += `❌ 세션을 찾을 수 없음: ${args.session_id}\n`;
      }
    }
    
    if (deletedCount === 0) {
      result += 'ℹ️ 삭제된 세션이 없습니다.';
    } else {
      result += `\n📈 **총 ${deletedCount}개 세션이 삭제되었습니다.**`;
    }
    
  } catch (error) {
    result += `❌ 세션 삭제 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
  
  return result;
}

/**
 * 히스토리 데이터 삭제
 */
async function handleHistoryDeletion(connection: any, args: DeleteWorkMemoryArgs): Promise<string> {
  let result = '📋 **변경 히스토리 삭제**\n\n';
  let deletedCount = 0;
  
  try {
    // 전체 히스토리 삭제
    if (args.delete_history) {
      // change_history 테이블 삭제
      const changeHistoryResult = await connection.get('SELECT COUNT(*) as count FROM change_history');
      await connection.run('DELETE FROM change_history');
      
      // memory_versions 테이블 삭제
      const versionsResult = await connection.get('SELECT COUNT(*) as count FROM memory_versions');
      await connection.run('DELETE FROM memory_versions');
      
      deletedCount = changeHistoryResult.count + versionsResult.count;
      result += `✅ 모든 히스토리 삭제: 변경이력 ${changeHistoryResult.count}개 + 버전 ${versionsResult.count}개 = 총 ${deletedCount}개\n`;
    }
    
    // 오래된 히스토리 삭제
    if (args.history_older_than_days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - args.history_older_than_days);
      
      // change_history 테이블에서 오래된 데이터 삭제
      const changeHistoryResult = await connection.get(
        'SELECT COUNT(*) as count FROM change_history WHERE timestamp < ?',
        [cutoffDate.toISOString()]
      );
      
      if (changeHistoryResult.count > 0) {
        await connection.run(
          'DELETE FROM change_history WHERE timestamp < ?',
          [cutoffDate.toISOString()]
        );
      }
      
      // memory_versions 테이블에서 오래된 데이터 삭제
      const versionsResult = await connection.get(
        'SELECT COUNT(*) as count FROM memory_versions WHERE timestamp < ?',
        [cutoffDate.toISOString()]
      );
      
      if (versionsResult.count > 0) {
        await connection.run(
          'DELETE FROM memory_versions WHERE timestamp < ?',
          [cutoffDate.toISOString()]
        );
      }
      
      const totalOldDeleted = changeHistoryResult.count + versionsResult.count;
      if (totalOldDeleted > 0) {
        result += `✅ ${args.history_older_than_days}일 이상 오래된 히스토리 삭제: 변경이력 ${changeHistoryResult.count}개 + 버전 ${versionsResult.count}개 = 총 ${totalOldDeleted}개\n`;
        deletedCount += totalOldDeleted;
      }
    }
    
    // 특정 액션 히스토리 삭제
    if (args.history_actions && args.history_actions.length > 0) {
      const placeholders = args.history_actions.map(() => '?').join(',');
      const countResult = await connection.get(
        `SELECT COUNT(*) as count FROM change_history WHERE action IN (${placeholders})`,
        args.history_actions
      );
      
      if (countResult.count > 0) {
        await connection.run(
          `DELETE FROM change_history WHERE action IN (${placeholders})`,
          args.history_actions
        );
        result += `✅ 특정 액션 히스토리 삭제 [${args.history_actions.join(', ')}]: ${countResult.count}개\n`;
        deletedCount += countResult.count;
      }
    }
    
    // 특정 메모리 ID 히스토리 삭제
    if (args.history_memory_ids && args.history_memory_ids.length > 0) {
      const placeholders = args.history_memory_ids.map(() => '?').join(',');
      
      // change_history 테이블에서 삭제
      const changeHistoryResult = await connection.get(
        `SELECT COUNT(*) as count FROM change_history WHERE memory_id IN (${placeholders})`,
        args.history_memory_ids
      );
      
      if (changeHistoryResult.count > 0) {
        await connection.run(
          `DELETE FROM change_history WHERE memory_id IN (${placeholders})`,
          args.history_memory_ids
        );
      }
      
      // memory_versions 테이블에서 삭제
      const versionsResult = await connection.get(
        `SELECT COUNT(*) as count FROM memory_versions WHERE memory_id IN (${placeholders})`,
        args.history_memory_ids
      );
      
      if (versionsResult.count > 0) {
        await connection.run(
          `DELETE FROM memory_versions WHERE memory_id IN (${placeholders})`,
          args.history_memory_ids
        );
      }
      
      const totalSpecificDeleted = changeHistoryResult.count + versionsResult.count;
      if (totalSpecificDeleted > 0) {
        result += `✅ 특정 메모리 히스토리 삭제 [${args.history_memory_ids.length}개 ID]: 변경이력 ${changeHistoryResult.count}개 + 버전 ${versionsResult.count}개 = 총 ${totalSpecificDeleted}개\n`;
        deletedCount += totalSpecificDeleted;
      }
    }
    
    // 고아 히스토리 정리
    if (args.clean_orphaned_history) {
      // change_history 테이블의 고아 레코드 정리
      const orphanedChangeResult = await connection.get(`
        SELECT COUNT(*) as count FROM change_history ch
        LEFT JOIN work_memories wm ON ch.memory_id = wm.id
        WHERE wm.id IS NULL
      `);
      
      if (orphanedChangeResult.count > 0) {
        await connection.run(`
          DELETE FROM change_history 
          WHERE memory_id NOT IN (SELECT id FROM work_memories)
        `);
      }
      
      // memory_versions 테이블의 고아 레코드 정리
      const orphanedVersionsResult = await connection.get(`
        SELECT COUNT(*) as count FROM memory_versions mv
        LEFT JOIN work_memories wm ON mv.memory_id = wm.id
        WHERE wm.id IS NULL
      `);
      
      if (orphanedVersionsResult.count > 0) {
        await connection.run(`
          DELETE FROM memory_versions 
          WHERE memory_id NOT IN (SELECT id FROM work_memories)
        `);
      }
      
      const totalOrphanedDeleted = orphanedChangeResult.count + orphanedVersionsResult.count;
      if (totalOrphanedDeleted > 0) {
        result += `✅ 고아 히스토리 정리: 변경이력 ${orphanedChangeResult.count}개 + 버전 ${orphanedVersionsResult.count}개 = 총 ${totalOrphanedDeleted}개\n`;
        deletedCount += totalOrphanedDeleted;
      } else {
        result += 'ℹ️ 고아 히스토리가 없습니다.\n';
      }
    }
    
    if (deletedCount === 0) {
      result += 'ℹ️ 삭제된 히스토리가 없습니다.';
    } else {
      result += `\n📈 **총 ${deletedCount}개 히스토리 레코드가 삭제되었습니다.**`;
    }
    
  } catch (error) {
    result += `❌ 히스토리 삭제 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
  
  return result;
}

/**
 * 검색 인덱스 삭제
 */
async function handleSearchIndexDeletion(connection: any, args: DeleteWorkMemoryArgs): Promise<string> {
  let result = '🔍 **검색 인덱스 삭제**\n\n';
  let deletedCount = 0;
  
  try {
    // 전체 검색 인덱스 재구성
    if (args.rebuild_search_index) {
      const countResult = await connection.get('SELECT COUNT(*) as count FROM search_keywords');
      await connection.run('DELETE FROM search_keywords');
      
      // SearchManager를 사용하여 재구성
      try {
        const { SearchManager } = await import('../utils/search-manager.js');
        const searchManager = new SearchManager();
        await searchManager.rebuildIndex();
        result += `✅ 검색 인덱스 재구성 완료: ${countResult.count}개 삭제 후 재생성\n`;
      } catch (rebuildError) {
        result += `⚠️ 검색 인덱스 삭제는 성공했으나 재구성 실패: ${rebuildError}\n`;
      }
      deletedCount = countResult.count;
    }
    
    // 고아된 키워드 정리
    if (args.clean_orphaned_keywords) {
      const orphanedResult = await connection.get(`
        SELECT COUNT(*) as count FROM search_keywords sk
        LEFT JOIN work_memories wm ON sk.memory_id = wm.id
        WHERE wm.id IS NULL
      `);
      
      if (orphanedResult.count > 0) {
        await connection.run(`
          DELETE FROM search_keywords 
          WHERE memory_id NOT IN (SELECT id FROM work_memories)
        `);
        result += `✅ 고아된 검색 키워드 정리: ${orphanedResult.count}개\n`;
        deletedCount += orphanedResult.count;
      } else {
        result += 'ℹ️ 고아된 검색 키워드가 없습니다.\n';
      }
    }
    
    if (deletedCount === 0 && !args.rebuild_search_index) {
      result += 'ℹ️ 삭제된 검색 인덱스가 없습니다.';
    } else {
      result += `\n📈 **검색 인덱스 작업 완료.**`;
    }
    
  } catch (error) {
    result += `❌ 검색 인덱스 삭제 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
  
  return result;
}

/**
 * 프로젝트 인덱스 삭제
 */
async function handleProjectIndexDeletion(connection: any, args: DeleteWorkMemoryArgs): Promise<string> {
  let result = '📋 **프로젝트 인덱스 삭제**\n\n';
  
  try {
    if (args.clean_project_index) {
      const countResult = await connection.get('SELECT COUNT(*) as count FROM project_index');
      
      if (countResult.count > 0) {
        await connection.run('DELETE FROM project_index');
        result += `✅ 프로젝트 인덱스 삭제: ${countResult.count}개\n`;
        
        // 프로젝트 인덱스 재구성
        await connection.run(`
          INSERT INTO project_index (project, memory_count, total_importance_score, most_recent_memory_date, most_active_creator, last_updated)
          SELECT 
            project,
            COUNT(*) as memory_count,
            SUM(COALESCE(importance_score, 50)) as total_importance_score,
            MAX(created_at) as most_recent_memory_date,
            created_by as most_active_creator,
            datetime('now') as last_updated
          FROM work_memories 
          WHERE project IS NOT NULL AND project != '' AND is_archived = 0
          GROUP BY project, created_by
        `);
        
        const newCountResult = await connection.get('SELECT COUNT(*) as count FROM project_index');
        result += `✅ 프로젝트 인덱스 재구성: ${newCountResult.count}개 \n`;
      } else {
        result += 'ℹ️ 프로젝트 인덱스가 비어있습니다.';
      }
    } else {
      result += 'ℹ️ clean_project_index=true로 설정하여 삭제를 수행하세요.';
    }
    
  } catch (error) {
    result += `❌ 프로젝트 인덱스 삭제 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
  
  return result;
}

/**
 * 전체 데이터 삭제
 */
async function handleAllDataDeletion(connection: any, args: DeleteWorkMemoryArgs): Promise<string> {
  let result = '🚨 **전체 데이터 삭제**\n\n';
  
  try {
    const tables = [
      'work_memories',
      'search_keywords', 
      'change_history',
      'project_index'
    ];
    
    // 세션 테이블이 있는 경우 추가
    const sessionTableExists = await connection.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='work_sessions'"
    );
    if (sessionTableExists) {
      tables.push('work_sessions');
    }
    
    let totalDeleted = 0;
    
    for (const table of tables) {
      try {
        const countResult = await connection.get(`SELECT COUNT(*) as count FROM ${table}`);
        await connection.run(`DELETE FROM ${table}`);
        result += `✅ ${table}: ${countResult.count}개 삭제\n`;
        totalDeleted += countResult.count;
      } catch (tableError) {
        result += `⚠️ ${table}: 삭제 실패 (${tableError})\n`;
      }
    }
    
    // VACUUM 수행
    await connection.run('VACUUM');
    result += `\n📈 **전체 ${totalDeleted}개 레코드 삭제 완료**`;
    result += '\n📋 데이터베이스 최적화 완료 (VACUUM)';
    
  } catch (error) {
    result += `❌ 전체 데이터 삭제 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
  
  return result;
}

