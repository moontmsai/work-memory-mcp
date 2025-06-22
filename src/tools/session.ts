import { z } from 'zod';
import { 
  handleSessionManager, 
  SessionManagerArgs,
  handleSessionStatus,
  SessionStatusArgs
} from './session-context-tools.js';

// 통합 세션 작업 스키마
const SessionOperationSchema = z.object({
  operation: z.enum(['create', 'activate', 'deactivate', 'delete', 'list', 'status', 'detect']),
  
  // create/activate 작업용 필드
  session_name: z.string().optional(),
  description: z.string().optional(),
  
  // activate/deactivate/delete 작업용 필드
  session_id: z.string().optional(),
  
  // delete 작업용 필드
  delete_memories: z.boolean().optional(),
  
  // list 작업용 필드
  include_stats: z.boolean().optional(),
  
  // status 작업용 필드
  auto_detect: z.boolean().optional(),
  check_exclusive: z.boolean().optional()
});

export type SessionOperationArgs = z.infer<typeof SessionOperationSchema>;

export const sessionTool = {
  name: 'session',
  description: `통합 세션 관리 도구 - 작업 세션의 생성, 활성화, 관리를 수행합니다.

사용법:
1. 생성: { "operation": "create", "session_name": "새 프로젝트", "description": "설명" }
2. 활성화: { "operation": "activate", "session_id": "세션ID" }
3. 비활성화: { "operation": "deactivate" }
4. 삭제: { "operation": "delete", "session_id": "세션ID", "delete_memories": false }
5. 목록: { "operation": "list", "include_stats": true }
6. 상태: { "operation": "status", "auto_detect": true }
7. 자동감지: { "operation": "detect" }

각 작업별 상세 옵션:
- create: session_name(필수), description
- activate: session_id(필수)
- deactivate: 파라미터 없음
- delete: session_id(필수), delete_memories
- list: include_stats
- status: auto_detect, check_exclusive
- detect: 현재 작업 기반 세션 자동 감지`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['create', 'activate', 'deactivate', 'delete', 'list', 'status', 'detect'],
        description: '수행할 작업'
      },
      
      // create/activate 작업 필드
      session_name: {
        type: 'string',
        description: '세션 이름 (create 작업에 필수)'
      },
      description: {
        type: 'string',
        description: '세션 설명'
      },
      
      // activate/deactivate/delete 작업 필드
      session_id: {
        type: 'string',
        description: '세션 ID (activate, delete 작업에 필수)'
      },
      
      // delete 작업 필드
      delete_memories: {
        type: 'boolean',
        description: '연결된 메모리도 함께 삭제 (기본: false)'
      },
      
      // list 작업 필드
      include_stats: {
        type: 'boolean',
        description: '통계 정보 포함 (기본: true)'
      },
      
      // status 작업 필드
      auto_detect: {
        type: 'boolean',
        description: '작업 기반 세션 자동 감지 (기본: true)'
      },
      check_exclusive: {
        type: 'boolean',
        description: '독점 모드 확인 (기본: true)'
      }
    },
    required: ['operation']
  }
};

export async function handleSession(args: SessionOperationArgs): Promise<string> {
  const { operation } = args;

  switch (operation) {
    case 'create': {
      if (!args.session_name) throw new Error('create 작업에는 session_name이 필수입니다');
      
      // For create, we need to use the SessionFactory directly since SessionManagerArgs doesn't have create action
      const { SessionFactory } = await import('../session/SessionFactory.js');
      const connection = await import('../database/index.js').then(m => m.getDatabaseConnection());
      if (!connection) throw new Error('Database connection not available');
      
      // SessionManager를 사용하여 세션 생성 및 데이터베이스 저장
      const { SessionManager } = await import('../session/session-manager.js');
      const sessionManager = new SessionManager(connection);
      
      try {
        const newSession = await sessionManager.createSession(args.session_name, {
          projectPath: process.cwd(),
          description: args.description,
          autoCreated: false
        });
        
        // 생성된 세션을 자동으로 활성화
        const managerArgs: SessionManagerArgs = {
          action: 'set_active',
          session_id: newSession.session_id
        };
        const activateResult = await handleSessionManager(managerArgs);
        
        return `✅ 새 세션이 생성되고 활성화되었습니다.\n🆔 세션 ID: ${newSession.session_id}\n📁 프로젝트: ${newSession.project_name}\n\n활성화 결과: ${activateResult}`;
      } catch (error) {
        return `❌ 세션 생성 실패: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
    
    case 'activate': {
      if (!args.session_id) throw new Error('activate 작업에는 session_id가 필수입니다');
      
      const managerArgs: SessionManagerArgs = {
        action: 'set_active',
        session_id: args.session_id
      };
      return handleSessionManager(managerArgs);
    }
    
    case 'deactivate': {
      const managerArgs: SessionManagerArgs = {
        action: 'clear'
      };
      return handleSessionManager(managerArgs);
    }
    
    case 'delete': {
      if (!args.session_id) throw new Error('delete 작업에는 session_id가 필수입니다');
      
      const managerArgs: SessionManagerArgs = {
        action: args.delete_memories ? 'delete_session_cascade' : 'delete_session',
        session_id: args.session_id,
        confirm: true
      };
      return handleSessionManager(managerArgs);
    }
    
    case 'list': {
      const managerArgs: SessionManagerArgs = {
        action: 'list_sessions',
        limit: 20
      };
      return handleSessionManager(managerArgs);
    }
    
    case 'status': {
      const statusArgs: SessionStatusArgs = {
        action: 'get_context'
      };
      return handleSessionStatus(statusArgs);
    }
    
    case 'detect': {
      const statusArgs: SessionStatusArgs = {
        action: 'detect_active'
      };
      return handleSessionStatus(statusArgs);
    }
    
    default:
      throw new Error(`알 수 없는 작업: ${operation}`);
  }
}