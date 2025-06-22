import { z } from 'zod';
import { 
  handleGetWorkMemoryHistory, 
  GetWorkMemoryHistoryArgs 
} from './get-work-memory-history-simple.js';
import { 
  handleGetWorkMemoryVersions, 
  GetWorkMemoryVersionsArgs 
} from './get-work-memory-versions.js';
import { 
  handleRestoreMemoryVersion, 
  RestoreMemoryVersionArgs,
  handleListMemoryVersions,
  ListMemoryVersionsArgs
} from './restore-memory-version.js';

// 통합 히스토리 작업 스키마
const HistoryOperationSchema = z.object({
  operation: z.enum(['changes', 'versions', 'restore', 'list_versions']),
  
  // changes/versions/restore 작업용 필수 필드, list_versions는 선택적
  memory_id: z.string().optional(),
  
  // 공통 필드
  limit: z.number().positive().optional(),
  format: z.enum(['summary', 'detailed', 'timeline']).optional(),
  
  // versions 작업용 필드
  include_content: z.boolean().optional(),
  
  // restore 작업용 필드
  version_id: z.string().optional(),
  
  // list_versions 작업용 필드
  include_data: z.boolean().optional()
});

export type HistoryOperationArgs = z.infer<typeof HistoryOperationSchema>;

export const historyTool = {
  name: 'history',
  description: `통합 이력 및 버전 관리 도구 - 메모리의 변경 이력, 버전 관리, 복원을 수행합니다.

사용법:
1. 변경 이력: { "operation": "changes", "memory_id": "메모리ID", "limit": 10 }
2. 버전 목록: { "operation": "versions", "memory_id": "메모리ID" }
3. 버전 복원: { "operation": "restore", "version_id": "버전ID" }
4. 전체 버전: { "operation": "list_versions", "days": 7, "project": "프로젝트명" }

각 작업별 상세 옵션:
- changes: memory_id(필수), limit, format
- versions: memory_id(필수), include_content
- restore: version_id(필수)
- list_versions: days, project`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['changes', 'versions', 'restore', 'list_versions'],
        description: '수행할 작업: changes(변경이력), versions(버전목록), restore(복원), list_versions(전체버전)'
      },
      
      // 공통 필드
      memory_id: {
        type: 'string',
        description: '메모리 ID (대부분의 작업에 필수)'
      },
      
      // changes 작업 필드
      limit: {
        type: 'number',
        description: '결과 개수 제한 (기본: 50)'
      },
      format: {
        type: 'string',
        enum: ['summary', 'detailed', 'timeline'],
        description: '출력 형식 (기본: summary)'
      },
      
      // versions 작업 필드
      include_content: {
        type: 'boolean',
        description: '내용 포함 여부 (기본: false)'
      },
      
      // restore 작업 필드
      version_id: {
        type: 'string',
        description: '버전 ID (restore 작업에 필수)'
      },
      
      // list_versions 작업 필드
      include_data: {
        type: 'boolean',
        description: '각 버전의 데이터 정보도 포함할지 여부'
      }
    },
    required: ['operation']
  }
};

export async function handleHistory(args: HistoryOperationArgs): Promise<string> {
  const { operation } = args;

  // memory_id가 필요한 작업들 검증
  if (['changes', 'versions', 'restore'].includes(operation) && !args.memory_id) {
    throw new Error(`${operation} 작업에는 memory_id가 필수입니다`);
  }

  switch (operation) {
    case 'changes': {
      const historyArgs: GetWorkMemoryHistoryArgs = {
        memory_id: args.memory_id!,
        limit: args.limit,
        format: args.format
      };
      return handleGetWorkMemoryHistory(historyArgs);
    }
    
    case 'versions': {
      const versionsArgs: GetWorkMemoryVersionsArgs = {
        memory_id: args.memory_id!,
        include_data: args.include_content
      };
      return handleGetWorkMemoryVersions(versionsArgs);
    }
    
    case 'restore': {
      if (!args.version_id) throw new Error('restore 작업에는 version_id가 필수입니다');
      
      const restoreArgs: RestoreMemoryVersionArgs = {
        memory_id: args.memory_id!,
        target_version: args.version_id,
        confirm_restore: true,
        create_backup: true
      };
      return handleRestoreMemoryVersion(restoreArgs);
    }
    
    case 'list_versions': {
      const listArgs: ListMemoryVersionsArgs = {
        memory_id: args.memory_id, // 선택적 - 없으면 전체 목록
        limit: args.limit,
        include_data: args.include_data,
        format: args.format === 'timeline' ? 'detailed' : args.format
      };
      return handleListMemoryVersions(listArgs);
    }
    
    default:
      throw new Error(`알 수 없는 작업: ${operation}`);
  }
}