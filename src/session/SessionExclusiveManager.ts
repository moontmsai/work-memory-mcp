/**
 * 세션 독점 유지 관리자
 * 30분 시간 기반 독점, 활동 시 갱신, 다른 세션 활성화 시 교체하는 기능
 */

import { DatabaseConnection } from '../database/connection.js';
import { logger } from '../utils/logger.js';

export interface SessionState {
  activeSessionId: string | null;
  lastActivity: Date;
  exclusiveUntil: Date;
  sessionTimeout: number; // 30분 = 1800000ms
}

export interface ExclusiveSessionInfo {
  sessionId: string;
  projectName: string;
  exclusiveUntil: Date;
  isActive: boolean;
  timeRemaining: number; // 남은 시간 (초)
}

export class SessionExclusiveManager {
  private state: SessionState;
  private readonly DEFAULT_TIMEOUT = 30 * 60 * 1000; // 30분

  constructor(private connection: DatabaseConnection, timeout?: number) {
    this.state = {
      activeSessionId: null,
      lastActivity: new Date(),
      exclusiveUntil: new Date(),
      sessionTimeout: timeout || this.DEFAULT_TIMEOUT
    };
    
    logger.info('SessionExclusiveManager', '초기화됨', { 
      timeout: this.state.sessionTimeout / 1000 / 60 + '분' 
    });
  }

  /**
   * 세션 활성화 - 새로운 세션이면 교체, 같은 세션이면 연장
   */
  async activateSession(sessionId: string, reason: string = 'manual'): Promise<ExclusiveSessionInfo> {
    const now = new Date();
    const exclusiveUntil = new Date(now.getTime() + this.state.sessionTimeout);
    
    // 기존과 다른 세션이면 교체
    const isSessionChange = this.state.activeSessionId !== sessionId;
    
    this.state.activeSessionId = sessionId;
    this.state.lastActivity = now;
    this.state.exclusiveUntil = exclusiveUntil;

    // 데이터베이스에 활성 세션 상태 업데이트
    await this.updateSessionInDatabase(sessionId, now);
    
    // 세션 정보 조회
    const sessionInfo = await this.getSessionInfo(sessionId);
    
    logger.info('SessionExclusiveManager', '세션 활성화', {
      sessionId,
      projectName: sessionInfo?.project_name || 'unknown',
      reason,
      isSessionChange,
      exclusiveUntil: exclusiveUntil.toISOString(),
      timeoutMinutes: this.state.sessionTimeout / 1000 / 60
    });

    return {
      sessionId,
      projectName: sessionInfo?.project_name || 'unknown',
      exclusiveUntil,
      isActive: true,
      timeRemaining: Math.floor(this.state.sessionTimeout / 1000)
    };
  }

  /**
   * 같은 세션 활동 시 시간 연장
   */
  async extendSession(sessionId: string, reason: string = 'activity'): Promise<ExclusiveSessionInfo | null> {
    // 현재 활성 세션과 같은 경우에만 연장
    if (this.state.activeSessionId === sessionId) {
      const now = new Date();
      const exclusiveUntil = new Date(now.getTime() + this.state.sessionTimeout);
      
      this.state.lastActivity = now;
      this.state.exclusiveUntil = exclusiveUntil;

      // 데이터베이스 업데이트
      await this.updateSessionInDatabase(sessionId, now);
      
      const sessionInfo = await this.getSessionInfo(sessionId);
      
      logger.debug('SessionExclusiveManager', '세션 연장', {
        sessionId,
        projectName: sessionInfo?.project_name || 'unknown',
        reason,
        exclusiveUntil: exclusiveUntil.toISOString(),
        timeoutMinutes: this.state.sessionTimeout / 1000 / 60
      });

      return {
        sessionId,
        projectName: sessionInfo?.project_name || 'unknown',
        exclusiveUntil,
        isActive: true,
        timeRemaining: Math.floor(this.state.sessionTimeout / 1000)
      };
    }
    
    // 다른 세션이면 교체로 처리
    return await this.activateSession(sessionId, `switch_from_${reason}`);
  }

  /**
   * 세션 독점 여부 확인
   */
  isSessionExclusive(): boolean {
    const now = new Date();
    const isExclusive = now < this.state.exclusiveUntil && this.state.activeSessionId !== null;
    
    if (!isExclusive && this.state.activeSessionId) {
      logger.debug('SessionExclusiveManager', '세션 독점 만료', {
        sessionId: this.state.activeSessionId,
        exclusiveUntil: this.state.exclusiveUntil.toISOString(),
        now: now.toISOString()
      });
    }
    
    return isExclusive;
  }

  /**
   * 현재 독점 세션 정보 조회
   */
  async getCurrentExclusiveSession(): Promise<ExclusiveSessionInfo | null> {
    if (!this.isSessionExclusive() || !this.state.activeSessionId) {
      return null;
    }

    const sessionInfo = await this.getSessionInfo(this.state.activeSessionId);
    const now = new Date();
    const timeRemaining = Math.max(0, Math.floor((this.state.exclusiveUntil.getTime() - now.getTime()) / 1000));

    return {
      sessionId: this.state.activeSessionId,
      projectName: sessionInfo?.project_name || 'unknown',
      exclusiveUntil: this.state.exclusiveUntil,
      isActive: true,
      timeRemaining
    };
  }

  /**
   * 세션 독점 해제 (수동)
   */
  async releaseSession(reason: string = 'manual'): Promise<void> {
    const previousSessionId = this.state.activeSessionId;
    
    this.state.activeSessionId = null;
    this.state.exclusiveUntil = new Date(); // 즉시 만료
    
    logger.info('SessionExclusiveManager', '세션 독점 해제', {
      previousSessionId,
      reason
    });
  }

  /**
   * 세션 독점 시간 설정 (분 단위)
   */
  setExclusiveTimeout(minutes: number): void {
    this.state.sessionTimeout = minutes * 60 * 1000;
    logger.info('SessionExclusiveManager', '독점 시간 변경', { 
      timeoutMinutes: minutes 
    });
  }

  /**
   * 세션 독점 상태 요약
   */
  async getExclusiveStatus(): Promise<{
    hasExclusiveSession: boolean;
    sessionId: string | null;
    projectName: string | null;
    timeRemaining: number;
    exclusiveUntil: string | null;
  }> {
    const current = await this.getCurrentExclusiveSession();
    
    return {
      hasExclusiveSession: !!current,
      sessionId: current?.sessionId || null,
      projectName: current?.projectName || null,
      timeRemaining: current?.timeRemaining || 0,
      exclusiveUntil: current?.exclusiveUntil?.toISOString() || null
    };
  }

  /**
   * 데이터베이스에서 세션 정보 조회
   */
  private async getSessionInfo(sessionId: string): Promise<any> {
    try {
      return await this.connection.get(
        'SELECT * FROM work_sessions WHERE session_id = ?',
        [sessionId]
      );
    } catch (error) {
      logger.warn('SessionExclusiveManager', '세션 정보 조회 실패', { sessionId, error });
      return null;
    }
  }

  /**
   * 데이터베이스의 세션 상태 업데이트
   */
  private async updateSessionInDatabase(sessionId: string, activityTime: Date): Promise<void> {
    try {
      const now = activityTime.toISOString();
      
      // 다른 모든 세션을 paused로 변경
      await this.connection.run(`
        UPDATE work_sessions 
        SET status = 'paused', updated_at = ? 
        WHERE status = 'active' AND session_id != ?
      `, [now, sessionId]);

      // 현재 세션을 active로 설정하고 활동 시간 업데이트
      await this.connection.run(`
        UPDATE work_sessions 
        SET status = 'active', last_activity_at = ?, updated_at = ?, activity_count = activity_count + 1
        WHERE session_id = ?
      `, [now, now, sessionId]);
      
    } catch (error) {
      logger.error('SessionExclusiveManager', '데이터베이스 업데이트 실패', {
        sessionId, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
}

/**
 * 글로벌 SessionExclusiveManager 인스턴스 (싱글톤)
 */
let globalExclusiveManager: SessionExclusiveManager | null = null;

export function initializeExclusiveManager(connection: DatabaseConnection, timeout?: number): SessionExclusiveManager {
  if (!globalExclusiveManager) {
    globalExclusiveManager = new SessionExclusiveManager(connection, timeout);
  }
  return globalExclusiveManager;
}

export function getExclusiveManager(): SessionExclusiveManager | null {
  return globalExclusiveManager;
}
