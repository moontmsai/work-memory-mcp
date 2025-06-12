/**
 * SessionContextManager - 현재 활성 세션 컨텍스트 관리
 * 워크 메모리 작업 시 자동으로 세션 ID를 연결하기 위한 컨텍스트 관리자
 */

import { DatabaseConnection } from '../database/connection.js';
import { WorkSession, SessionStatus } from '../types/session.js';

export interface SessionContext {
  current_session_id: string | null;
  project_name: string | null;
  project_path: string | null;
  auto_link_enabled: boolean;
  last_updated: string;
}

export class SessionContextManager {
  private static instance: SessionContextManager;
  private connection: DatabaseConnection;
  private context: SessionContext;

  private constructor(connection: DatabaseConnection) {
    this.connection = connection;
    this.context = {
      current_session_id: null,
      project_name: null,
      project_path: null,
      auto_link_enabled: true,
      last_updated: new Date().toISOString()
    };
  }

  /**
   * 싱글톤 인스턴스 얻기
   */
  static getInstance(connection?: DatabaseConnection): SessionContextManager {
    if (!SessionContextManager.instance) {
      if (!connection) {
        throw new Error('Database connection is required for first initialization');
      }
      SessionContextManager.instance = new SessionContextManager(connection);
    }
    return SessionContextManager.instance;
  }

  /**
   * 현재 활성 세션 설정
   */
  async setActiveSession(sessionId: string): Promise<void> {
    try {
      // 세션이 실제로 존재하고 활성 상태인지 확인
      const session = await this.connection.get(
        'SELECT * FROM work_sessions WHERE session_id = ? AND (status = ? OR status = ?)',
        [sessionId, SessionStatus.ACTIVE, SessionStatus.PAUSED]
      );

      if (!session) {
        throw new Error(`Session ${sessionId} not found or not active`);
      }

      this.context.current_session_id = sessionId;
      this.context.project_name = session.project_name;
      this.context.project_path = session.project_path;
      this.context.last_updated = new Date().toISOString();

      // 세션 활동 시간 업데이트
      await this.updateSessionActivity(sessionId);

    } catch (error) {
      throw new Error(`Failed to set active session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 현재 활성 세션 자동 감지 및 설정
   */
  async detectAndSetActiveSession(projectPath?: string): Promise<string | null> {
    try {
      let activeSession: any = null;

      // 1. 먼저 현재 활성 세션 확인
      const currentActive = await this.connection.get(
        'SELECT * FROM work_sessions WHERE status = ? ORDER BY last_activity_at DESC LIMIT 1',
        [SessionStatus.ACTIVE]
      );

      if (currentActive) {
        // 프로젝트 경로가 주어진 경우 일치하는지 확인
        if (projectPath && currentActive.project_path !== projectPath) {
          // 경로가 다르면 해당 경로의 세션 찾기
          const pathSession = await this.connection.get(
            'SELECT * FROM work_sessions WHERE project_path = ? AND (status = ? OR status = ?) ORDER BY last_activity_at DESC LIMIT 1',
            [projectPath, SessionStatus.ACTIVE, SessionStatus.PAUSED]
          );
          
          if (pathSession) {
            activeSession = pathSession;
          } else {
            activeSession = currentActive; // 기존 활성 세션 유지
          }
        } else {
          activeSession = currentActive;
        }
      } else if (projectPath) {
        // 활성 세션이 없고 경로가 주어진 경우 해당 경로의 최근 세션 찾기
        activeSession = await this.connection.get(
          'SELECT * FROM work_sessions WHERE project_path = ? AND (status = ? OR status = ?) ORDER BY last_activity_at DESC LIMIT 1',
          [projectPath, SessionStatus.ACTIVE, SessionStatus.PAUSED]
        );
      }

      if (activeSession) {
        await this.setActiveSession(activeSession.session_id);
        return activeSession.session_id;
      }

      return null;
    } catch (error) {
      console.warn(`Failed to detect active session: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * 현재 활성 세션 ID 얻기
   */
  getCurrentSessionId(): string | null {
    return this.context.current_session_id;
  }

  /**
   * 현재 세션 컨텍스트 얻기
   */
  getCurrentContext(): SessionContext {
    return { ...this.context };
  }

  /**
   * 활성 세션 해제
   */
  clearActiveSession(): void {
    this.context.current_session_id = null;
    this.context.project_name = null;
    this.context.project_path = null;
    this.context.last_updated = new Date().toISOString();
  }

  /**
   * 자동 링크 활성화/비활성화
   */
  setAutoLinkEnabled(enabled: boolean): void {
    this.context.auto_link_enabled = enabled;
    this.context.last_updated = new Date().toISOString();
  }

  /**
   * 자동 링크 활성화 상태 확인
   */
  isAutoLinkEnabled(): boolean {
    return this.context.auto_link_enabled;
  }

  /**
   * 세션 활동 시간 업데이트
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const now = new Date().toISOString();
      await this.connection.query(
        'UPDATE work_sessions SET last_activity_at = ?, updated_at = ? WHERE session_id = ?',
        [now, now, sessionId]
      );
    } catch (error) {
      // 활동 시간 업데이트 실패는 치명적이지 않음
      console.warn(`Failed to update session activity: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 세션 컨텍스트 상태 조회
   */
  getStatus(): {
    has_active_session: boolean;
    session_id: string | null;
    project_name: string | null;
    auto_link_enabled: boolean;
    last_updated: string;
  } {
    return {
      has_active_session: this.context.current_session_id !== null,
      session_id: this.context.current_session_id,
      project_name: this.context.project_name,
      auto_link_enabled: this.context.auto_link_enabled,
      last_updated: this.context.last_updated
    };
  }
}

// 편의 함수들
export function getSessionContext(connection?: DatabaseConnection): SessionContextManager {
  return SessionContextManager.getInstance(connection);
}

export async function getCurrentSessionId(connection?: DatabaseConnection): Promise<string | null> {
  try {
    const manager = SessionContextManager.getInstance(connection);
    return manager.getCurrentSessionId();
  } catch {
    return null;
  }
}

export async function setCurrentSession(sessionId: string, connection: DatabaseConnection): Promise<void> {
  const manager = SessionContextManager.getInstance(connection);
  await manager.setActiveSession(sessionId);
}
