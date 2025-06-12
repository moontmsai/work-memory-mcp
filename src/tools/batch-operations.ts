import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { databaseManager } from '../database/connection.js';
import { getCurrentISOString } from '../utils/index.js';

export interface BatchOperationArgs {
  operations: Array<{
    type: 'add' | 'update' | 'delete';
    data: any;
  }>;
  atomic?: boolean;
}

export const batchOperationsTool: Tool = {
  name: 'batch_operations',
  description: '여러 메모리 작업을 효율적으로 일괄 처리합니다',
  inputSchema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        description: '실행할 작업 목록',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['add', 'update', 'delete'],
              description: '작업 유형'
            },
            data: {
              type: 'object',
              description: '작업에 필요한 데이터'
            }
          },
          required: ['type', 'data']
        }
      },
      atomic: {
        type: 'boolean',
        description: '원자적 실행 여부 (모두 성공 또는 모두 실패)',
        default: true
      }
    },
    required: ['operations']
  }
};

export async function handleBatchOperations(args: BatchOperationArgs): Promise<string> {
  try {
    const connection = databaseManager.getConnection();
    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    if (args.atomic !== false) {
      // 원자적 실행 (트랜잭션)
      const operations = args.operations.map(op => {
        switch (op.type) {
          case 'add':
            return {
              sql: `INSERT INTO work_memories (id, content, project, tags, importance_score, created_by, created_at, updated_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              params: [
                op.data.id || `mem_${getCurrentISOString().replace(/[:.]/g, '').replace('T', '_').substring(0, 20)}_${Math.random().toString(36).substring(2, 8)}`,
                op.data.content,
                op.data.project || '',
                JSON.stringify(op.data.tags || []),
                op.data.importance_score || 50,
                op.data.created_by || 'batch',
                getCurrentISOString(),
                getCurrentISOString()
              ]
            };
          case 'update':
            return {
              sql: `UPDATE work_memories 
                    SET content = ?, project = ?, tags = ?, importance_score = ?, updated_at = ? 
                    WHERE id = ?`,
              params: [
                op.data.content,
                op.data.project,
                JSON.stringify(op.data.tags || []),
                op.data.importance_score,
                getCurrentISOString(),
                op.data.id
              ]
            };
          case 'delete':
            return {
              sql: `UPDATE work_memories SET is_archived = 1, archived_at = ? WHERE id = ?`,
              params: [getCurrentISOString(), op.data.id]
            };
          default:
            throw new Error(`Unknown operation type: ${op.type}`);
        }
      });

      const batchResults = await connection.batch(operations);
      successCount = batchResults.length;
      
      return `✅ 배치 작업 완료 (원자적)
🔄 처리된 작업: ${successCount}개
⚡ 성능: 단일 트랜잭션으로 최적화`;
      
    } else {
      // 비원자적 실행 (개별 처리)
      for (const op of args.operations) {
        try {
          let result;
          switch (op.type) {
            case 'add':
              const id = op.data.id || `mem_${getCurrentISOString().replace(/[:.]/g, '').replace('T', '_').substring(0, 20)}_${Math.random().toString(36).substring(2, 8)}`;
              result = await connection.run(
                `INSERT INTO work_memories (id, content, project, tags, importance_score, created_by, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  id,
                  op.data.content,
                  op.data.project || '',
                  JSON.stringify(op.data.tags || []),
                  op.data.importance_score || 50,
                  op.data.created_by || 'batch',
                  getCurrentISOString(),
                  getCurrentISOString()
                ]
              );
              break;
            case 'update':
              result = await connection.run(
                `UPDATE work_memories 
                 SET content = ?, project = ?, tags = ?, importance_score = ?, updated_at = ? 
                 WHERE id = ?`,
                [
                  op.data.content,
                  op.data.project,
                  JSON.stringify(op.data.tags || []),
                  op.data.importance_score,
                  getCurrentISOString(),
                  op.data.id
                ]
              );
              break;
            case 'delete':
              result = await connection.run(
                `UPDATE work_memories SET is_archived = 1, archived_at = ? WHERE id = ?`,
                [getCurrentISOString(), op.data.id]
              );
              break;
            default:
              throw new Error(`Unknown operation type: ${op.type}`);
          }
          
          results.push({ success: true, operation: op.type, result });
          successCount++;
          
        } catch (error) {
          results.push({ 
            success: false, 
            operation: op.type, 
            error: error instanceof Error ? error.message : String(error)
          });
          errorCount++;
        }
      }
      
      return `🔄 배치 작업 완료 (비원자적)
✅ 성공: ${successCount}개
❌ 실패: ${errorCount}개
📋 상세 결과:
${results.map((r, i) => 
  `  ${i+1}. ${r.operation}: ${r.success ? '✅' : '❌' + (r.error ? ` (${r.error})` : '')}`
).join('\n')}`;
    }
    
  } catch (error) {
    throw new Error(`배치 작업 실행 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
} 