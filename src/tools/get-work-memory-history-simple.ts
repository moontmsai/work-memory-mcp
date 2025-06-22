import { Tool } from '@modelcontextprotocol/sdk/types.js';
import databaseManager from '../database/connection.js';

export interface GetWorkMemoryHistoryArgs {
  memory_id?: string;
  project?: string;
  limit?: number;
  format?: 'summary' | 'detailed' | 'timeline';
}

export const getWorkMemoryHistoryTool: Tool = {
  name: 'get_work_memory_history',
  description: '메모리의 변경 이력을 조회합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      memory_id: { 
        type: 'string', 
        description: '조회할 메모리의 ID (필수)' 
      },
      limit: {
        type: 'number',
        description: '결과 개수 제한 (기본: 50)',
        minimum: 1,
        maximum: 200
      },
      format: {
        type: 'string',
        enum: ['summary', 'detailed', 'timeline'],
        description: '출력 형식 (기본: summary)'
      }
    },
    required: ['memory_id'],
  }
};

export async function handleGetWorkMemoryHistory(args: GetWorkMemoryHistoryArgs): Promise<string> {
  try {
    const connection = databaseManager.getConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    // SQLite에서 직접 이력 조회
    let sql = 'SELECT * FROM change_history WHERE memory_id = ? ORDER BY timestamp DESC';
    const params: any[] = [args.memory_id];
    
    // 제한
    const limit = args.limit || 50;
    sql += ' LIMIT ?';
    params.push(limit);

    // 이력 조회 실행
    const entries = await connection.all(sql, params);
    
    if (entries.length === 0) {
      return `📄 메모리 ID ${args.memory_id}에 대한 이력이 없습니다.`;
    }

    // 결과 형식화
    const format = args.format || 'summary';
    let result = `📅 메모리 이력 (ID: ${args.memory_id})\n`;
    result += `총 ${entries.length}개 이력\n\n`;

    for (const entry of entries) {
      const timestamp = new Date(entry.timestamp).toLocaleString('ko-KR');
      const action = getActionDisplay(entry.action);
      
      if (format === 'detailed') {
        result += `● ${timestamp} - ${action}\n`;
        if (entry.details) {
          result += `  세부: ${entry.details}\n`;
        }
        if (entry.changed_fields) {
          try {
            const fields = JSON.parse(entry.changed_fields);
            result += `  변경된 필드: ${fields.join(', ')}\n`;
          } catch {
            // JSON 파싱 실패 시 무시
          }
        }
        result += '\n';
      } else {
        result += `● ${timestamp} - ${action}\n`;
      }
    }

    return result;

  } catch (error) {
    return `❌ 히스토리 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}

/**
 * 액션 표시명 변환
 */
function getActionDisplay(action: string): string {
  switch (action) {
    case 'created': return '생성';
    case 'updated': return '수정';
    case 'deleted': return '삭제';
    case 'archived': return '아카이브';
    case 'accessed': return '접근';
    case 'restored': return '복원';
    default: return action;
  }
}