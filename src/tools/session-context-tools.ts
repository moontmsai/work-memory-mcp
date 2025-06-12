/**
 * 세션 컨텍스트 관리 도구들
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';
import { getSessionContext } from '../session/SessionContextManager.js';

export interface SetActiveSessionArgs {
  session_id: string;
}

export interface DetectActiveSessionArgs {
  project_path?: string;
}

export interface SetAutoLinkArgs {
  enabled: boolean;
}

// 현재 활성 세션 설정
export const setActiveSessionTool: Tool = {
  name: 'set_active_session',
  description: '현재 활성 세션을 설정합니다. 이후 저장되는 모든 메모리가 이 세션에 자동으로 연결됩니다.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: '활성화할 세션 ID',
        minLength: 1
      }
    },
    required: ['session_id']
  }
};

export async function handleSetActiveSession(args: SetActiveSessionArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    const sessionContext = getSessionContext(connection);
    await sessionContext.setActiveSession(args.session_id);

    const context = sessionContext.getCurrentContext();
    
    return `✅ 활성 세션이 설정되었습니다.\n` +
           `🆔 세션 ID: ${args.session_id}\n` +
           `📁 프로젝트: ${context.project_name || 'Unknown'}\n` +
           `🔗 자동 연결: ${context.auto_link_enabled ? '활성화' : '비활성화'}\n` +
           `📅 설정 시간: ${context.last_updated}`;

  } catch (error) {
    if (error instanceof Error) {
      return `❌ 활성 세션 설정 실패: ${error.message}`;
    }
    return '❌ 알 수 없는 오류가 발생했습니다.';
  }
}

// 활성 세션 자동 감지
export const detectActiveSessionTool: Tool = {
  name: 'detect_active_session',
  description: '현재 활성 세션을 자동으로 감지하거나 프로젝트 경로를 기반으로 적합한 세션을 찾습니다.',
  inputSchema: {
    type: 'object',
    properties: {
      project_path: {
        type: 'string',
        description: '프로젝트 경로 (선택사항)'
      }
    }
  }
};

export async function handleDetectActiveSession(args: DetectActiveSessionArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    const sessionContext = getSessionContext(connection);
    const detectedSessionId = await sessionContext.detectAndSetActiveSession(args.project_path);

    if (detectedSessionId) {
      const context = sessionContext.getCurrentContext();
      
      return `✅ 활성 세션이 감지되어 설정되었습니다.\n` +
             `🆔 세션 ID: ${detectedSessionId}\n` +
             `📁 프로젝트: ${context.project_name || 'Unknown'}\n` +
             `📂 경로: ${context.project_path || 'Unknown'}\n` +
             `🔗 자동 연결: ${context.auto_link_enabled ? '활성화' : '비활성화'}`;
    } else {
      return `ℹ️ 활성 세션을 찾을 수 없습니다.\n` +
             `💡 새로운 세션을 생성하거나 기존 세션을 활성화하세요.\n` +
             `📂 검색 경로: ${args.project_path || '현재 디렉토리'}`;
    }

  } catch (error) {
    if (error instanceof Error) {
      return `❌ 활성 세션 감지 실패: ${error.message}`;
    }
    return '❌ 알 수 없는 오류가 발생했습니다.';
  }
}

// 세션 컨텍스트 상태 조회
export const getSessionContextTool: Tool = {
  name: 'get_session_context',
  description: '현재 세션 컨텍스트 상태를 조회합니다.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function handleGetSessionContext(): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    const sessionContext = getSessionContext(connection);
    const status = sessionContext.getStatus();

    if (status.has_active_session) {
      return `📋 현재 세션 컨텍스트\n` +
             `🆔 세션 ID: ${status.session_id}\n` +
             `📁 프로젝트: ${status.project_name || 'Unknown'}\n` +
             `🔗 자동 연결: ${status.auto_link_enabled ? '✅ 활성화' : '❌ 비활성화'}\n` +
             `📅 마지막 업데이트: ${status.last_updated}`;
    } else {
      return `📋 현재 세션 컨텍스트\n` +
             `❌ 활성 세션이 없습니다.\n` +
             `🔗 자동 연결: ${status.auto_link_enabled ? '✅ 활성화' : '❌ 비활성화'}\n` +
             `💡 'detect_active_session' 또는 'set_active_session'을 사용하여 세션을 설정하세요.`;
    }

  } catch (error) {
    if (error instanceof Error) {
      return `❌ 세션 컨텍스트 조회 실패: ${error.message}`;
    }
    return '❌ 알 수 없는 오류가 발생했습니다.';
  }
}

// 자동 링크 설정
export const setAutoLinkTool: Tool = {
  name: 'set_auto_link',
  description: '메모리 저장 시 현재 활성 세션에 자동으로 연결하는 기능을 활성화/비활성화합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        description: '자동 연결 활성화 여부'
      }
    },
    required: ['enabled']
  }
};

export async function handleSetAutoLink(args: SetAutoLinkArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    const sessionContext = getSessionContext(connection);
    sessionContext.setAutoLinkEnabled(args.enabled);

    const status = args.enabled ? '✅ 활성화' : '❌ 비활성화';
    const description = args.enabled 
      ? '이제 새로 저장되는 모든 메모리가 현재 활성 세션에 자동으로 연결됩니다.'
      : '메모리와 세션 간의 자동 연결이 비활성화되었습니다.';

    return `🔗 자동 연결 설정이 변경되었습니다.\n` +
           `상태: ${status}\n` +
           `📝 ${description}`;

  } catch (error) {
    if (error instanceof Error) {
      return `❌ 자동 연결 설정 실패: ${error.message}`;
    }
    return '❌ 알 수 없는 오류가 발생했습니다.';
  }
}

// 활성 세션 해제
export const clearActiveSessionTool: Tool = {
  name: 'clear_active_session',
  description: '현재 활성 세션을 해제합니다. 이후 저장되는 메모리는 세션에 자동으로 연결되지 않습니다.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function handleClearActiveSession(): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    const sessionContext = getSessionContext(connection);
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

  } catch (error) {
    if (error instanceof Error) {
      return `❌ 활성 세션 해제 실패: ${error.message}`;
    }
    return '❌ 알 수 없는 오류가 발생했습니다.';
  }
}
