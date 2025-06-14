/**
 * 세션 관리 도구들 - 5개를 2개로 통합
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';
import { getSessionContext } from '../session/SessionContextManager.js';

// 통합 도구 1: 세션 관리 (설정, 활성화, 해제)
export interface SessionManagerArgs {
  action: 'set_active' | 'clear' | 'enable_auto_link' | 'disable_auto_link';
  session_id?: string;
  project_path?: string;
}

export const sessionManagerTool: Tool = {
  name: 'session_manager',
  description: '세션을 관리합니다. 활성 세션 설정/해제, 자동 링크 활성화/비활성화를 처리합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['set_active', 'clear', 'enable_auto_link', 'disable_auto_link'],
        description: '실행할 작업: set_active(세션 활성화), clear(세션 해제), enable_auto_link(자동링크 활성화), disable_auto_link(자동링크 비활성화)'
      },
      session_id: {
        type: 'string',
        description: '세션 ID (set_active 작업 시 필수)',
        minLength: 1
      },
      project_path: {
        type: 'string',
        description: '프로젝트 경로 (선택사항)'
      }
    },
    required: ['action']
  }
};

export async function handleSessionManager(args: SessionManagerArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    const sessionContext = getSessionContext(connection);

    switch (args.action) {
      case 'set_active': {
        if (!args.session_id) {
          throw new Error('session_id is required for set_active action');
        }
        
        await sessionContext.setActiveSession(args.session_id);
        const context = sessionContext.getCurrentContext();
        
        // 🚀 독점 관리자에게 세션 활성화 알림
        let exclusiveInfo = '';
        try {
          const { getExclusiveManager } = await import('../session/SessionExclusiveManager.js');
          const exclusiveManager = getExclusiveManager();
          if (exclusiveManager) {
            const exclusiveSession = await exclusiveManager.activateSession(args.session_id, 'manual_set_active');
            exclusiveInfo = `\n🔒 독점 세션: ${Math.floor(exclusiveSession.timeRemaining / 60)}분 동안 유지`;
          }
        } catch (exclusiveError) {
          console.warn('Failed to activate exclusive session:', exclusiveError);
        }
        
        return `✅ 활성 세션이 설정되었습니다.\n` +
               `🆔 세션 ID: ${args.session_id}\n` +
               `📁 프로젝트: ${context.project_name || 'Unknown'}\n` +
               `🔗 자동 연결: ${context.auto_link_enabled ? '활성화' : '비활성화'}\n` +
               `📅 설정 시간: ${context.last_updated}${exclusiveInfo}`;
      }

      case 'clear': {
        const previousSessionId = sessionContext.getCurrentSessionId();
        sessionContext.clearActiveSession();

        if (previousSessionId) {
          return `✅ 활성 세션이 해제되었습니다.\n` +
                 `🆔 이전 세션: ${previousSessionId}\n` +
                 `📝 이후 저장되는 메모리는 세션에 자동으로 연결되지 않습니다.`;
        } else {
          return `ℹ️ 현재 활성 세션이 없습니다.\n` +
                 `📝 메모리와 세션은 이미 분리된 상태입니다.`;
        }
      }

      case 'enable_auto_link': {
        sessionContext.setAutoLinkEnabled(true);
        return `🔗 자동 연결이 활성화되었습니다.\n` +
               `📝 이제 새로 저장되는 모든 메모리가 현재 활성 세션에 자동으로 연결됩니다.`;
      }

      case 'disable_auto_link': {
        sessionContext.setAutoLinkEnabled(false);
        return `🔗 자동 연결이 비활성화되었습니다.\n` +
               `📝 메모리와 세션 간의 자동 연결이 중단되었습니다.`;
      }

      default:
        throw new Error(`Unknown action: ${args.action}`);
    }

  } catch (error) {
    if (error instanceof Error) {
      return `❌ 세션 관리 실패: ${error.message}`;
    }
    return '❌ 알 수 없는 오류가 발생했습니다.';
  }
}

// 통합 도구 2: 세션 상태 조회 및 자동 감지
export interface SessionStatusArgs {
  action: 'get_context' | 'detect_active';
  project_path?: string;
}

export const sessionStatusTool: Tool = {
  name: 'session_status',
  description: '세션 상태를 조회하거나 활성 세션을 자동으로 감지합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get_context', 'detect_active'],
        description: '실행할 작업: get_context(현재 상태 조회), detect_active(활성 세션 자동 감지)'
      },
      project_path: {
        type: 'string',
        description: '프로젝트 경로 (detect_active 시 선택사항)'
      }
    },
    required: ['action']
  }
};

export async function handleSessionStatus(args: SessionStatusArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    const sessionContext = getSessionContext(connection);

    switch (args.action) {
      case 'get_context': {
        const status = sessionContext.getStatus();

        // 🚀 독점 세션 상태 확인
        let exclusiveInfo = '';
        try {
          const { getExclusiveManager } = await import('../session/SessionExclusiveManager.js');
          const exclusiveManager = getExclusiveManager();
          if (exclusiveManager) {
            const exclusiveStatus = await exclusiveManager.getExclusiveStatus();
            if (exclusiveStatus.hasExclusiveSession) {
              const remainingMinutes = Math.floor(exclusiveStatus.timeRemaining / 60);
              exclusiveInfo = `\n🔒 독점 세션: ${remainingMinutes}분 남음`;
            }
          }
        } catch (exclusiveError) {
          console.warn('Failed to get exclusive session status:', exclusiveError);
        }

        if (status.has_active_session) {
          return `📋 현재 세션 상태\n` +
                 `🆔 세션 ID: ${status.session_id}\n` +
                 `📁 프로젝트: ${status.project_name || 'Unknown'}\n` +
                 `🔗 자동 연결: ${status.auto_link_enabled ? '✅ 활성화' : '❌ 비활성화'}\n` +
                 `📅 마지막 업데이트: ${status.last_updated}${exclusiveInfo}`;
        } else {
          return `📋 현재 세션 상태\n` +
                 `❌ 활성 세션이 없습니다.\n` +
                 `🔗 자동 연결: ${status.auto_link_enabled ? '✅ 활성화' : '❌ 비활성화'}\n` +
                 `💡 'session_status detect_active' 또는 'session_manager set_active'를 사용하여 세션을 설정하세요.`;
        }
      }

      case 'detect_active': {
        const detectedSessionId = await sessionContext.detectAndSetActiveSession(args.project_path);

        if (detectedSessionId) {
          const context = sessionContext.getCurrentContext();
          
          // 🚀 독점 관리자에게 세션 활성화 알림
          let exclusiveInfo = '';
          try {
            const { getExclusiveManager } = await import('../session/SessionExclusiveManager.js');
            const exclusiveManager = getExclusiveManager();
            if (exclusiveManager) {
              const exclusiveSession = await exclusiveManager.activateSession(detectedSessionId, 'auto_detect_active');
              exclusiveInfo = `\n🔒 독점 세션: ${Math.floor(exclusiveSession.timeRemaining / 60)}분 동안 유지`;
            }
          } catch (exclusiveError) {
            console.warn('Failed to activate exclusive session on detect:', exclusiveError);
          }
          
          return `✅ 활성 세션이 감지되어 설정되었습니다.\n` +
                 `🆔 세션 ID: ${detectedSessionId}\n` +
                 `📁 프로젝트: ${context.project_name || 'Unknown'}\n` +
                 `📂 경로: ${context.project_path || 'Unknown'}\n` +
                 `🔗 자동 연결: ${context.auto_link_enabled ? '활성화' : '비활성화'}${exclusiveInfo}`;
        } else {
          return `ℹ️ 활성 세션을 찾을 수 없습니다.\n` +
                 `💡 새로운 세션을 생성하거나 기존 세션을 활성화하세요.\n` +
                 `📂 검색 경로: ${args.project_path || '현재 디렉토리'}`;
        }
      }

      default:
        throw new Error(`Unknown action: ${args.action}`);
    }

  } catch (error) {
    if (error instanceof Error) {
      return `❌ 세션 상태 조회 실패: ${error.message}`;
    }
    return '❌ 알 수 없는 오류가 발생했습니다.';
  }
}

// 기존 개별 함수들을 통합 함수로 매핑 (호환성 유지)
export async function handleSetActiveSession(args: { session_id: string }): Promise<string> {
  return handleSessionManager({ action: 'set_active', session_id: args.session_id });
}

export async function handleDetectActiveSession(args: { project_path?: string }): Promise<string> {
  return handleSessionStatus({ action: 'detect_active', project_path: args.project_path });
}

export async function handleGetSessionContext(): Promise<string> {
  return handleSessionStatus({ action: 'get_context' });
}

export async function handleSetAutoLink(args: { enabled: boolean }): Promise<string> {
  const action = args.enabled ? 'enable_auto_link' : 'disable_auto_link';
  return handleSessionManager({ action });
}

export async function handleClearActiveSession(): Promise<string> {
  return handleSessionManager({ action: 'clear' });
}

// 사용 예시 및 타입 정의 export
export type SetActiveSessionArgs = { session_id: string };
export type DetectActiveSessionArgs = { project_path?: string };
export type SetAutoLinkArgs = { enabled: boolean };