import { z } from 'zod';
import { 
  handleGetServerStatus, 
  GetServerStatusArgs 
} from './server-status.js';
import { 
  handleConnectionMonitor, 
  ConnectionMonitorArgs 
} from './connection-monitor.js';
import { 
  handleOptimizeDatabase 
} from './optimize-database.js';
import { 
  handleBatchOperations, 
  BatchOperationArgs 
} from './batch-operations.js';
import { 
  handleDeleteWorkMemory, 
  DeleteWorkMemoryArgs 
} from './delete-work-memory.js';
import { databaseManager } from '../database/index.js';

// 통합 시스템 작업 스키마
const SystemOperationSchema = z.object({
  operation: z.enum(['status', 'monitor', 'optimize', 'batch', 'delete']),
  
  // status 작업용 필드
  include_logs: z.boolean().optional(),
  
  // monitor 작업용 필드
  include_performance: z.boolean().optional(),
  include_stats: z.boolean().optional(),
  
  // optimize 작업용 필드
  vacuum_type: z.enum(['full', 'incremental']).optional(),
  analyze: z.boolean().optional(),
  
  // batch 작업용 필드
  operations: z.array(z.object({
    type: z.enum(['add', 'update', 'delete']),
    data: z.any()
  })).optional(),
  atomic: z.boolean().optional(),
  enable_progress: z.boolean().optional(),
  
  // delete 작업용 필드 (일괄삭제)
  delete_criteria: z.object({
    id: z.string().optional(),
    ids: z.array(z.string()).optional(),
    project: z.string().optional(),
    session_id: z.string().optional(),
    min_importance_score: z.number().optional(),
    max_importance_score: z.number().optional(),
    work_type: z.enum(['memory', 'todo']).optional(),
    worked: z.enum(['완료', '미완료']).optional(),
    created_by: z.string().optional(),
    older_than_days: z.number().optional(),
    combined_criteria: z.object({
      session_id: z.string().optional(),
      project: z.string().optional(),
      importance_range: z.object({
        min: z.number().optional(),
        max: z.number().optional()
      }).optional(),
      work_type: z.enum(['memory', 'todo']).optional(),
      worked: z.enum(['완료', '미완료']).optional(),
      older_than_days: z.number().optional()
    }).optional()
  }).optional(),
  archive_only: z.boolean().optional(),
  confirm: z.boolean().optional(),
  delete_all: z.boolean().optional()
});

export type SystemOperationArgs = z.infer<typeof SystemOperationSchema>;

export const systemTool = {
  name: 'system',
  description: `통합 시스템 관리 도구 - 서버 상태, 연결 모니터링, 데이터베이스 최적화, 일괄 작업, 일괄 삭제를 수행합니다.

사용법:
1. 상태: { "operation": "status", "include_logs": false }
2. 모니터: { "operation": "monitor", "include_performance": true, "include_stats": true }
3. 최적화: { "operation": "optimize", "vacuum_type": "incremental", "analyze": true }
4. 일괄작업: { "operation": "batch", "operations": [...], "atomic": true }
5. 일괄삭제: { "operation": "delete", "delete_criteria": {...}, "archive_only": true }

각 작업별 상세 옵션:
- status: include_logs
- monitor: include_performance, include_stats
- optimize: vacuum_type(full/incremental), analyze
- batch: operations(필수), atomic, enable_progress
- delete: delete_criteria(필수), archive_only, confirm`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['status', 'monitor', 'optimize', 'batch', 'delete'],
        description: '수행할 작업: status(상태), monitor(모니터링), optimize(최적화), batch(일괄작업), delete(일괄삭제)'
      },
      
      // status 작업 필드
      include_logs: {
        type: 'boolean',
        description: '로그 정보 포함 (기본: false)'
      },
      
      // monitor 작업 필드
      include_performance: {
        type: 'boolean',
        description: '성능 정보 포함 (기본: true)'
      },
      include_stats: {
        type: 'boolean',
        description: '통계 정보 포함 (기본: true)'
      },
      
      // optimize 작업 필드
      vacuum_type: {
        type: 'string',
        enum: ['full', 'incremental'],
        description: 'VACUUM 유형 (기본: incremental)'
      },
      analyze: {
        type: 'boolean',
        description: 'ANALYZE 실행 여부 (기본: true)'
      },
      
      // batch 작업 필드
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['add', 'update', 'delete']
            },
            data: {
              type: 'object',
              description: '작업 데이터 (필수)'
            }
          },
          required: ['type', 'data']
        },
        description: '일괄 작업 목록 (batch 작업에 필수)'
      },
      atomic: {
        type: 'boolean',
        description: '원자적 실행 (기본: true)'
      },
      enable_progress: {
        type: 'boolean',
        description: '진행률 표시 (기본: false)'
      },
      
      // delete 작업 필드
      delete_criteria: {
        type: 'object',
        description: '삭제 조건 (delete 작업에 필수)',
        properties: {
          id: { type: 'string', description: '단일 메모리 ID' },
          ids: { 
            type: 'array', 
            items: { type: 'string' },
            maxItems: 50,
            description: '메모리 ID 배열 (최대 50개)' 
          },
          project: { type: 'string', description: '프로젝트명' },
          session_id: { type: 'string', description: '세션 ID' },
          min_importance_score: { 
            type: 'number', 
            minimum: 0, 
            maximum: 100,
            description: '최소 중요도 점수' 
          },
          max_importance_score: { 
            type: 'number', 
            minimum: 0, 
            maximum: 100,
            description: '최대 중요도 점수' 
          },
          work_type: { 
            type: 'string', 
            enum: ['memory', 'todo'],
            description: '작업 유형' 
          },
          worked: { 
            type: 'string', 
            enum: ['완료', '미완료'],
            description: '완료 상태' 
          },
          created_by: { type: 'string', description: '생성자' },
          older_than_days: { 
            type: 'number', 
            minimum: 1,
            description: '지정 일수보다 오래된 것' 
          },
          combined_criteria: {
            type: 'object',
            description: '복합 조건',
            properties: {
              session_id: { type: 'string' },
              project: { type: 'string' },
              importance_range: {
                type: 'object',
                properties: {
                  min: { type: 'number', minimum: 0, maximum: 100 },
                  max: { type: 'number', minimum: 0, maximum: 100 }
                }
              },
              work_type: { type: 'string', enum: ['memory', 'todo'] },
              worked: { type: 'string', enum: ['완료', '미완료'] },
              older_than_days: { type: 'number', minimum: 1 }
            }
          }
        }
      },
      archive_only: {
        type: 'boolean',
        description: '아카이브 모드 (완전 삭제 대신 아카이브)'
      },
      confirm: {
        type: 'boolean',
        description: '삭제 확인 (대량 삭제시 필수)'
      },
      delete_all: {
        type: 'boolean',
        description: '전체 삭제 (confirm=true 필수)'
      }
    },
    required: ['operation']
  }
};

export async function handleSystem(args: SystemOperationArgs): Promise<string> {
  const { operation } = args;

  switch (operation) {
    case 'status': {
      const statusArgs: GetServerStatusArgs = {
        include_logs: args.include_logs
      };
      return handleGetServerStatus(statusArgs);
    }
    
    case 'monitor': {
      const monitorArgs: ConnectionMonitorArgs = {
        include_performance: args.include_performance,
        include_stats: args.include_stats
      };
      return handleConnectionMonitor(monitorArgs);
    }
    
    case 'optimize': {
      // 데이터베이스 경로 가져오기
      const dbPath = databaseManager.getDbPath();
      
      // optimize-database 핸들러는 내부적으로 vacuum_type과 analyze를 처리
      // 현재 구현은 기본 동작만 지원하므로, 추가 옵션은 무시
      return handleOptimizeDatabase(dbPath);
    }
    
    case 'batch': {
      if (!args.operations || args.operations.length === 0) {
        throw new Error('batch 작업에는 operations가 필수입니다');
      }
      
      const batchArgs: BatchOperationArgs = {
        operations: args.operations.map(op => ({ ...op, data: op.data || {} })),
        atomic: args.atomic,
        enable_progress: args.enable_progress
      };
      return handleBatchOperations(batchArgs);
    }
    
    case 'delete': {
      if (!args.delete_criteria) {
        throw new Error('delete 작업에는 delete_criteria가 필수입니다');
      }
      
      // delete_criteria를 DeleteWorkMemoryArgs 형식으로 안전하게 변환
      const deleteArgs: DeleteWorkMemoryArgs = {
        id: args.delete_criteria.id,
        ids: args.delete_criteria.ids,
        project: args.delete_criteria.project,
        session_id: args.delete_criteria.session_id,
        min_importance_score: args.delete_criteria.min_importance_score,
        max_importance_score: args.delete_criteria.max_importance_score,
        work_type: args.delete_criteria.work_type,
        worked: args.delete_criteria.worked,
        created_by: args.delete_criteria.created_by,
        older_than_days: args.delete_criteria.older_than_days,
        combined_criteria: args.delete_criteria.combined_criteria,
        archive_only: args.archive_only,
        confirm: args.confirm,
        delete_all: args.delete_all
      };
      
      return handleDeleteWorkMemory(deleteArgs);
    }
    
    default:
      throw new Error(`알 수 없는 작업: ${operation}`);
  }
}