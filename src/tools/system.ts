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
  handleSimpleConnectionMonitor, 
  SimpleConnectionMonitorArgs 
} from './connection-monitor-simple.js';
import { 
  handleOptimizeDatabase,
  OptimizeOptions
} from './optimize-database.js';
import { 
  handleBatchOperations, 
  BatchOperationArgs 
} from './batch-operations.js';
import { 
  handleDeleteWorkMemory, 
  DeleteWorkMemoryArgs 
} from './delete-work-memory.js';
import { 
  handleIndexDiagnosis, 
  IndexDiagnosisArgs 
} from './index-diagnosis.js';
import { 
  handleDetailedIndexAnalysis, 
  DetailedIndexAnalysisArgs 
} from './detailed-index-analysis.js';
import { 
  handleIndexRepair, 
  IndexRepairArgs 
} from './index-repair.js';
import { databaseManager } from '../database/index.js';

// 통합 시스템 작업 스키마
const SystemOperationSchema = z.object({
  operation: z.enum(['status', 'monitor', 'optimize', 'batch', 'delete', 'diagnose', 'analyze', 'repair']),
  
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
  delete_all: z.boolean().optional(),
  
  // 카테고리별 삭제 옵션
  category: z.enum(['work_memories', 'sessions', 'history', 'search_index', 'project_index', 'all_data']).optional(),
  
  // 세션 삭제 옵션
  delete_sessions: z.boolean().optional(),
  sessions_older_than_days: z.number().optional(),
  
  // 히스토리 삭제 옵션
  delete_history: z.boolean().optional(),
  history_older_than_days: z.number().optional(),
  history_actions: z.array(z.string()).optional(),
  clean_orphaned_history: z.boolean().optional(),
  history_memory_ids: z.array(z.string()).optional(),
  
  // 검색 인덱스 삭제 옵션
  rebuild_search_index: z.boolean().optional(),
  clean_orphaned_keywords: z.boolean().optional(),
  
  // 프로젝트 인덱스 삭제 옵션
  clean_project_index: z.boolean().optional(),
  
  // diagnose 작업용 필드
  fix_issues: z.boolean().optional(),
  rebuild_index: z.boolean().optional(),
  verbose: z.boolean().optional(),
  
  // analyze 작업용 필드
  show_missing: z.boolean().optional(),
  show_indexed: z.boolean().optional(),
  analyze_patterns: z.boolean().optional(),
  
  // repair 작업용 필드
  repair_missing: z.boolean().optional(),
  force_rebuild: z.boolean().optional()
});

export type SystemOperationArgs = z.infer<typeof SystemOperationSchema>;

export const systemTool = {
  name: 'system',
  description: `통합 시스템 관리 도구 - 서버 상태, 연결 모니터링, 데이터베이스 최적화, 일괄 작업, 일괄 삭제, 인덱스 진단, 상세 분석, 인덱스 복구를 수행합니다.

사용법:
1. 상태: { "operation": "status", "include_logs": false }
2. 모니터: { "operation": "monitor", "include_performance": true, "include_stats": true }
3. 최적화: { "operation": "optimize", "vacuum_type": "incremental", "analyze": true }
4. 일괄작업: { "operation": "batch", "operations": [...], "atomic": true }
5. 일괄삭제: { "operation": "delete", "delete_criteria": {...}, "archive_only": true }
6. 인덱스진단: { "operation": "diagnose", "fix_issues": true, "rebuild_index": false }
7. 상세분석: { "operation": "analyze", "show_missing": true, "analyze_patterns": true }
8. 인덱스복구: { "operation": "repair", "repair_missing": true, "force_rebuild": false }

각 작업별 상세 옵션:
- status: include_logs
- monitor: include_performance, include_stats
- optimize: vacuum_type(full/incremental), analyze
- batch: operations(필수), atomic, enable_progress
- delete: delete_criteria OR category, archive_only (카테고리별 세분화된 삭제 지원)
- diagnose: fix_issues, rebuild_index, verbose
- analyze: show_missing, show_indexed, analyze_patterns
- repair: repair_missing, force_rebuild

카테고리별 삭제 예시:
- 고아 히스토리 정리: { "operation": "delete", "category": "history", "clean_orphaned_history": true }
- 세션 정리: { "operation": "delete", "category": "sessions", "sessions_older_than_days": 30 }
- 검색 인덱스 재구성: { "operation": "delete", "category": "search_index", "rebuild_search_index": true }`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['status', 'monitor', 'optimize', 'batch', 'delete', 'diagnose', 'analyze', 'repair'],
        description: '수행할 작업: status(상태), monitor(모니터링), optimize(최적화), batch(일괄작업), delete(일괄삭제), diagnose(인덱스진단), analyze(상세분석), repair(인덱스복구)'
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
      delete_all: {
        type: 'boolean',
        description: '전체 삭제'
      },
      
      // diagnose 작업 필드
      fix_issues: {
        type: 'boolean',
        description: '발견된 인덱싱 문제를 자동으로 수정 (기본: false)',
        default: false
      },
      rebuild_index: {
        type: 'boolean',
        description: '인덱스를 완전히 재구성 (기본: false)',
        default: false
      },
      verbose: {
        type: 'boolean',
        description: '상세 정보 출력 (기본: true)',
        default: true
      },
      
      // analyze 작업 필드
      show_missing: {
        type: 'boolean',
        description: '누락된 메모리 상세 표시 (기본: true)',
        default: true
      },
      show_indexed: {
        type: 'boolean',
        description: '인덱싱된 메모리 표시 (기본: false)',
        default: false
      },
      analyze_patterns: {
        type: 'boolean',
        description: '패턴 분석 수행 (기본: true)',
        default: true
      },
      
      // repair 작업 필드
      repair_missing: {
        type: 'boolean',
        description: '누락된 인덱스를 실제로 복구 (기본: true)',
        default: true
      },
      force_rebuild: {
        type: 'boolean',
        description: '모든 인덱스를 강제로 재구성 (기본: false)',
        default: false
      },
      
      // 카테고리별 삭제 옵션
      category: {
        type: 'string',
        enum: ['work_memories', 'sessions', 'history', 'search_index', 'project_index', 'all_data'],
        description: '삭제할 데이터 카테고리'
      },
      
      // 세션 삭제 옵션
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
      
      // 히스토리 삭제 옵션
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
      
      // 검색 인덱스 삭제 옵션
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
      
      // 프로젝트 인덱스 삭제 옵션
      clean_project_index: {
        type: 'boolean',
        description: '프로젝트 인덱스 정리',
        default: false
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
      // 먼저 간단한 모니터를 시도하고, 실패하면 기본 모니터 사용
      try {
        const simpleMonitorArgs: SimpleConnectionMonitorArgs = {
          include_performance: args.include_performance,
          include_stats: args.include_stats
        };
        return await handleSimpleConnectionMonitor(simpleMonitorArgs);
      } catch (simpleError) {
        // 간단한 모니터도 실패하면 기본 모니터 시도
        const monitorArgs: ConnectionMonitorArgs = {
          include_performance: args.include_performance,
          include_stats: args.include_stats
        };
        return handleConnectionMonitor(monitorArgs);
      }
    }
    
    case 'optimize': {
      // 데이터베이스 경로 가져오기
      const dbPath = databaseManager.getDbPath();
      
      // 최적화 옵션 준비
      const optimizeOptions: OptimizeOptions = {
        vacuum_type: args.vacuum_type || 'incremental',
        analyze: args.analyze !== false,
        index_analysis: true,
        performance_report: true
      };
      
      return handleOptimizeDatabase(dbPath, optimizeOptions);
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
      // 카테고리별 삭제인 경우 delete_criteria 없이도 허용
      if (!args.delete_criteria && !args.category) {
        throw new Error('delete 작업에는 delete_criteria 또는 category가 필요합니다');
      }
      
      // DeleteWorkMemoryArgs 형식으로 변환 (모든 새로운 필드 포함)
      const deleteArgs: DeleteWorkMemoryArgs = {
        // 기존 delete_criteria 필드들
        id: args.delete_criteria?.id,
        ids: args.delete_criteria?.ids,
        project: args.delete_criteria?.project,
        session_id: args.delete_criteria?.session_id,
        min_importance_score: args.delete_criteria?.min_importance_score,
        max_importance_score: args.delete_criteria?.max_importance_score,
        work_type: args.delete_criteria?.work_type,
        worked: args.delete_criteria?.worked,
        created_by: args.delete_criteria?.created_by,
        older_than_days: args.delete_criteria?.older_than_days,
        combined_criteria: args.delete_criteria?.combined_criteria,
        archive_only: args.archive_only,
        delete_all: args.delete_all,
        
        // 새로운 카테고리별 삭제 필드들
        category: args.category,
        delete_sessions: args.delete_sessions,
        sessions_older_than_days: args.sessions_older_than_days,
        delete_history: args.delete_history,
        history_older_than_days: args.history_older_than_days,
        history_actions: args.history_actions,
        clean_orphaned_history: args.clean_orphaned_history,
        history_memory_ids: args.history_memory_ids,
        rebuild_search_index: args.rebuild_search_index,
        clean_orphaned_keywords: args.clean_orphaned_keywords,
        clean_project_index: args.clean_project_index
      };
      
      return handleDeleteWorkMemory(deleteArgs);
    }
    
    case 'diagnose': {
      const diagnoseArgs: IndexDiagnosisArgs = {
        fix_issues: args.fix_issues || false,
        rebuild_index: args.rebuild_index || false,
        verbose: args.verbose !== false
      };
      return handleIndexDiagnosis(diagnoseArgs);
    }
    
    case 'analyze': {
      const analyzeArgs: DetailedIndexAnalysisArgs = {
        show_missing: args.show_missing !== false,
        show_indexed: args.show_indexed || false,
        analyze_patterns: args.analyze_patterns !== false
      };
      return handleDetailedIndexAnalysis(analyzeArgs);
    }
    
    case 'repair': {
      const repairArgs: IndexRepairArgs = {
        repair_missing: args.repair_missing !== false,
        force_rebuild: args.force_rebuild || false
      };
      return handleIndexRepair(repairArgs);
    }
    
    default:
      throw new Error(`알 수 없는 작업: ${operation}`);
  }
}