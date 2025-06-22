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
import { databaseManager } from '../database/index.js';

// 통합 시스템 작업 스키마
const SystemOperationSchema = z.object({
  operation: z.enum(['status', 'monitor', 'optimize', 'batch']),
  
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
  enable_progress: z.boolean().optional()
});

export type SystemOperationArgs = z.infer<typeof SystemOperationSchema>;

export const systemTool = {
  name: 'system',
  description: `통합 시스템 관리 도구 - 서버 상태, 연결 모니터링, 데이터베이스 최적화, 일괄 작업을 수행합니다.

사용법:
1. 상태: { "operation": "status", "include_logs": false }
2. 모니터: { "operation": "monitor", "include_performance": true, "include_stats": true }
3. 최적화: { "operation": "optimize", "vacuum_type": "incremental", "analyze": true }
4. 일괄작업: { "operation": "batch", "operations": [...], "atomic": true }

각 작업별 상세 옵션:
- status: include_logs
- monitor: include_performance, include_stats
- optimize: vacuum_type(full/incremental), analyze
- batch: operations(필수), atomic, enable_progress`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['status', 'monitor', 'optimize', 'batch'],
        description: '수행할 작업: status(상태), monitor(모니터링), optimize(최적화), batch(일괄작업)'
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
    
    default:
      throw new Error(`알 수 없는 작업: ${operation}`);
  }
}