/**
 * 세션과 메모리 간의 링크를 관리하는 클래스
 */

import { DatabaseConnection } from '../types/database.js';
import { SessionStatus, Session } from '../types/session.js';

export class SessionMemoryLinker {
  private connection: DatabaseConnection;

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
  }

  // 기존 메서드들은 그대로 유지
  async linkMemoryToSession(memoryId: string, sessionId: string): Promise<void> {
    // 링크 구현
  }

  /**
   * 메모리 자동 링크 (워크 메모리 저장 시 사용)
   */
  async autoLinkMemoryToSession(
    memoryId: string,
    sessionId: string,
    options?: {
      skip_validation?: boolean;
      reason?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 이미 링크되어 있는지 확인
      const existingLink = await this.connection.get(
        'SELECT * FROM work_memories WHERE id = ? AND session_id = ?',
        [memoryId, sessionId]
      );

      if (existingLink) {
        return { success: true }; // 이미 링크됨
      }

      // 메모리에 세션 ID 설정
      await this.connection.query(
        'UPDATE work_memories SET session_id = ?, updated_at = ? WHERE id = ?',
        [sessionId, new Date().toISOString(), memoryId]
      );

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: `Auto link failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 현재 활성 세션에 메모리 자동 링크
   */
  async autoLinkToActiveSession(
    memoryId: string,
    options?: {
      create_session_if_none?: boolean;
      project_name?: string;
      project_path?: string;
    }
  ): Promise<{ success: boolean; session_id?: string; error?: string; created_session?: boolean }> {
    try {
      // 현재 활성 세션 조회
      let activeSession = await this.connection.get(
        'SELECT * FROM work_sessions WHERE status = ? ORDER BY last_activity_at DESC LIMIT 1',
        [SessionStatus.ACTIVE]
      );

      let createdSession = false;

      // 활성 세션이 없고 생성 옵션이 있는 경우
      if (!activeSession && options?.create_session_if_none && options.project_name) {
        // 새 세션 생성
        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        
        // 세션을 데이터베이스에 삽입
        await this.connection.run(`
          INSERT INTO work_sessions (
            session_id, project_name, project_path, 
            started_at, last_activity_at, status, description,
            auto_created, created_by, created_at, updated_at,
            activity_count, memory_count, total_work_time
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          newSessionId,
          options.project_name,
          options.project_path || '',
          now,
          now,
          SessionStatus.ACTIVE,
          `Auto-created session for ${options.project_name}`,
          1, // auto_created
          'auto_link_system',
          now,
          now,
          0, // activity_count
          0, // memory_count
          0  // total_work_time
        ]);

        activeSession = {
          session_id: newSessionId,
          project_name: options.project_name,
          status: SessionStatus.ACTIVE
        };
        createdSession = true;
      }

      if (!activeSession) {
        return {
          success: false,
          error: 'No active session found and session creation not enabled'
        };
      }

      // 메모리를 활성 세션에 링크
      const linkResult = await this.autoLinkMemoryToSession(memoryId, activeSession.session_id, {
        reason: 'auto_link_to_active_session'
      });

      return {
        success: linkResult.success,
        session_id: activeSession.session_id,
        error: linkResult.error,
        created_session: createdSession
      };

    } catch (error) {
      return {
        success: false,
        error: `Auto link to active session failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}
