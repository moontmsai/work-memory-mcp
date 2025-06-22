import { Tool } from '@modelcontextprotocol/sdk/types.js';
import databaseManager from '../database/connection.js';
import { getCurrentISOString } from '../utils/index.js';
import { globalProgressTracker } from '../progress/ProgressTracker.js';
import { v4 as uuidv4 } from 'uuid';

export interface BatchOperationArgs {
  operations: Array<{
    type: 'add' | 'update' | 'delete';
    data: any;
  }>;
  atomic?: boolean;
  // 진행률 추적 옵션
  enable_progress?: boolean;
  progress_task_id?: string;
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
      },
      // 진행률 추적 옵션
      enable_progress: {
        type: 'boolean',
        description: '진행률 추적 활성화 여부 (기본값: false)',
        default: false
      },
      progress_task_id: {
        type: 'string',
        description: '진행률 추적용 작업 ID (자동 생성 가능)',
        minLength: 1
      }
    },
    required: ['operations']
  }
};

export async function handleBatchOperations(args: BatchOperationArgs): Promise<string> {
  const startTime = Date.now();
  let taskId: string | undefined;

  // 진행률 추적 설정
  if (args.enable_progress) {
    taskId = args.progress_task_id || uuidv4();
    globalProgressTracker.startTask({
      taskId,
      totalItems: args.operations.length
    });
  }

  try {
    const connection = databaseManager.getConnection();
    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    if (args.atomic !== false) {
      // 원자적 실행 (배치 처리)
      const operations = args.operations.map((op, index) => {
        // 진행률 업데이트
        if (taskId) {
          const progress = (index / args.operations.length) * 90;
          globalProgressTracker.updateProgress(
            taskId,
            progress,
            `트랜잭션 작업 ${index + 1}/${args.operations.length}`,
            `${op.type} 작업 준비 중`,
            index + 1
          );
        }

        switch (op.type) {
          case 'add':
            const id = op.data.id || `mem_${getCurrentISOString().replace(/[:.]/g, '').replace('T', '_').substring(0, 20)}_${Math.random().toString(36).substring(2, 8)}`;
            return {
              sql: `INSERT INTO work_memories (id, content, project, tags, importance_score, created_by, created_at, updated_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              params: [
                id,
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

      // 배치 실행
      await connection.batch(operations);
      successCount = operations.length;

      // 진행률 완료
      if (taskId) {
        globalProgressTracker.completeTask(taskId, `원자적 배치 작업 완료: ${successCount}개 처리`);
      }

      const executionTime = Date.now() - startTime;
      
      return `✅ 배치 작업 완료 (원자적)
🔄 처리된 작업: ${successCount}개
⏱️ 실행 시간: ${executionTime}ms
⚡ 성능: 단일 배치로 최적화`;
      
    } else {
      // 비원자적 실행 (개별 처리)
      for (const [index, op] of args.operations.entries()) {
        // 진행률 업데이트 - 개별 작업 처리
        if (taskId) {
          const progress = (index / args.operations.length) * 90;
          globalProgressTracker.updateProgress(
            taskId,
            progress,
            `작업 ${index + 1}/${args.operations.length} 처리 중`,
            `${op.type} 작업 실행 중`,
            index + 1
          );
        }
        
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
            error: error instanceof Error ? error.message : '알 수 없는 오류'
          });
          errorCount++;
        }
      }

      // 진행률 완료
      if (taskId) {
        globalProgressTracker.completeTask(taskId, `배치 작업 완료: ${successCount}개 성공, ${errorCount}개 실패`);
      }

      const executionTime = Date.now() - startTime;
      
      return `${successCount > 0 ? '✅' : '❌'} 배치 작업 완료 (비원자적)
🔄 처리된 작업: ${successCount}개 성공, ${errorCount}개 실패
⏱️ 실행 시간: ${executionTime}ms
📊 성공률: ${Math.round((successCount / (successCount + errorCount)) * 100)}%`;
    }

  } catch (error) {
    // 진행률 실패 처리
    if (taskId) {
      globalProgressTracker.failTask(taskId, error instanceof Error ? error.message : '알 수 없는 오류');
    }
    
    const executionTime = Date.now() - startTime;
    return `❌ 배치 작업 실패 (${executionTime}ms): ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}