/**
 * SessionStateManager - 세션 상태 전환 관리 클래스
 */

import { 
  SessionStatus, 
  StateTransition, 
  StateChangeResult,
  WorkSession 
} from '../types/session.js';

// 허용된 상태 전환 규칙
const STATE_TRANSITIONS: StateTransition[] = [
  // ACTIVE에서 가능한 전환
  { from: SessionStatus.ACTIVE, to: SessionStatus.PAUSED, allowed: true },
  { from: SessionStatus.ACTIVE, to: SessionStatus.COMPLETED, allowed: true },
  { from: SessionStatus.ACTIVE, to: SessionStatus.CANCELLED, allowed: true },
  
  // PAUSED에서 가능한 전환
  { from: SessionStatus.PAUSED, to: SessionStatus.ACTIVE, allowed: true },
  { from: SessionStatus.PAUSED, to: SessionStatus.COMPLETED, allowed: true },
  { from: SessionStatus.PAUSED, to: SessionStatus.CANCELLED, allowed: true },
  
  // COMPLETED에서 가능한 전환 (재개 가능)
  { from: SessionStatus.COMPLETED, to: SessionStatus.ACTIVE, allowed: true, conditions: ['can_reopen'] },
  
  // CANCELLED에서 가능한 전환 (재개 가능)
  { from: SessionStatus.CANCELLED, to: SessionStatus.ACTIVE, allowed: true, conditions: ['can_reopen'] },
  
  // 금지된 전환들
  { from: SessionStatus.COMPLETED, to: SessionStatus.PAUSED, allowed: false },
  { from: SessionStatus.COMPLETED, to: SessionStatus.CANCELLED, allowed: false },
  { from: SessionStatus.CANCELLED, to: SessionStatus.PAUSED, allowed: false },
  { from: SessionStatus.CANCELLED, to: SessionStatus.COMPLETED, allowed: false }
];

export interface StateManagerConfig {
  allow_reopen_completed: boolean;
  allow_reopen_cancelled: boolean;
  auto_update_timestamps: boolean;
  validate_conditions: boolean;
}

export interface StateChangeOptions {
  force?: boolean;
  reason?: string;
  updated_by?: string;
  metadata?: Record<string, any>;
}

export class SessionStateManager {
  private config: StateManagerConfig;

  constructor(config?: Partial<StateManagerConfig>) {
    this.config = {
      allow_reopen_completed: true,
      allow_reopen_cancelled: true,
      auto_update_timestamps: true,
      validate_conditions: true,
      ...config
    };
  }

  /**
   * 세션 상태 변경
   */
  changeState(
    session: WorkSession, 
    newStatus: SessionStatus, 
    options?: StateChangeOptions
  ): StateChangeResult {
    const previousStatus = session.status;
    const timestamp = new Date().toISOString();

    try {
      // 같은 상태로의 전환 체크
      if (previousStatus === newStatus) {
        return {
          success: true,
          previous_status: previousStatus,
          new_status: newStatus,
          timestamp,
          errors: ['Status is already ' + newStatus]
        };
      }

      // 강제 전환이 아닌 경우 규칙 검증
      if (!options?.force) {
        const validation = this.validateTransition(previousStatus, newStatus);
        if (!validation.allowed) {
          return {
            success: false,
            previous_status: previousStatus,
            new_status: newStatus,
            timestamp,
            errors: [`Invalid state transition from ${previousStatus} to ${newStatus}`]
          };
        }

        // 조건 검증
        if (this.config.validate_conditions && validation.conditions) {
          const conditionCheck = this.checkConditions(session, validation.conditions);
          if (!conditionCheck.valid) {
            return {
              success: false,
              previous_status: previousStatus,
              new_status: newStatus,
              timestamp,
              errors: conditionCheck.errors
            };
          }
        }
      }

      // 상태 변경 실행
      session.status = newStatus;

      // 타임스탬프 자동 업데이트
      if (this.config.auto_update_timestamps) {
        session.updated_at = timestamp;
        session.last_activity_at = timestamp;

        // 특정 상태별 타임스탬프 처리
        if (newStatus === SessionStatus.COMPLETED || newStatus === SessionStatus.CANCELLED) {
          session.ended_at = timestamp;
        } else if (newStatus === SessionStatus.ACTIVE && 
                  (previousStatus === SessionStatus.COMPLETED || previousStatus === SessionStatus.CANCELLED)) {
          // 재개 시 ended_at 초기화
          session.ended_at = undefined;
        }
      }

      return {
        success: true,
        previous_status: previousStatus,
        new_status: newStatus,
        timestamp
      };

    } catch (error) {
      return {
        success: false,
        previous_status: previousStatus,
        new_status: newStatus,
        timestamp,
        errors: [`State change failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * 세션 활성화
   */
  activateSession(session: WorkSession, options?: StateChangeOptions): StateChangeResult {
    return this.changeState(session, SessionStatus.ACTIVE, options);
  }

  /**
   * 세션 일시정지
   */
  pauseSession(session: WorkSession, options?: StateChangeOptions): StateChangeResult {
    return this.changeState(session, SessionStatus.PAUSED, options);
  }

  /**
   * 세션 완료
   */
  completeSession(session: WorkSession, options?: StateChangeOptions): StateChangeResult {
    return this.changeState(session, SessionStatus.COMPLETED, options);
  }

  /**
   * 세션 취소
   */
  cancelSession(session: WorkSession, options?: StateChangeOptions): StateChangeResult {
    return this.changeState(session, SessionStatus.CANCELLED, options);
  }

  /**
   * 상태 전환 가능성 확인
   */
  canTransition(fromStatus: SessionStatus, toStatus: SessionStatus): boolean {
    const transition = this.findTransition(fromStatus, toStatus);
    return transition?.allowed ?? false;
  }

  /**
   * 특정 세션에서 가능한 모든 상태 전환 조회
   */
  getAvailableTransitions(session: WorkSession): SessionStatus[] {
    const currentStatus = session.status;
    const availableTransitions: SessionStatus[] = [];

    for (const status of Object.values(SessionStatus)) {
      if (status !== currentStatus && this.canTransition(currentStatus, status)) {
        // 조건 검증
        const transition = this.findTransition(currentStatus, status);
        if (transition?.conditions) {
          const conditionCheck = this.checkConditions(session, transition.conditions);
          if (conditionCheck.valid) {
            availableTransitions.push(status);
          }
        } else {
          availableTransitions.push(status);
        }
      }
    }

    return availableTransitions;
  }

  /**
   * 세션 상태 히스토리 분석
   */
  analyzeStateHistory(sessions: WorkSession[]): {
    total_sessions: number;
    by_status: Record<SessionStatus, number>;
    completed_ratio: number;
    cancelled_ratio: number;
    active_ratio: number;
  } {
    const statusCounts = {
      [SessionStatus.ACTIVE]: 0,
      [SessionStatus.PAUSED]: 0,
      [SessionStatus.COMPLETED]: 0,
      [SessionStatus.CANCELLED]: 0
    };

    sessions.forEach(session => {
      statusCounts[session.status]++;
    });

    const total = sessions.length;

    return {
      total_sessions: total,
      by_status: statusCounts,
      completed_ratio: total > 0 ? statusCounts[SessionStatus.COMPLETED] / total : 0,
      cancelled_ratio: total > 0 ? statusCounts[SessionStatus.CANCELLED] / total : 0,
      active_ratio: total > 0 ? (statusCounts[SessionStatus.ACTIVE] + statusCounts[SessionStatus.PAUSED]) / total : 0
    };
  }

  /**
   * 상태 전환 규칙 검증
   */
  private validateTransition(from: SessionStatus, to: SessionStatus): StateTransition {
    const transition = this.findTransition(from, to);
    
    if (!transition) {
      return { from, to, allowed: false };
    }

    // 재개 설정 확인
    if (to === SessionStatus.ACTIVE) {
      if (from === SessionStatus.COMPLETED && !this.config.allow_reopen_completed) {
        return { from, to, allowed: false };
      }
      if (from === SessionStatus.CANCELLED && !this.config.allow_reopen_cancelled) {
        return { from, to, allowed: false };
      }
    }

    return transition;
  }

  /**
   * 전환 규칙 찾기
   */
  private findTransition(from: SessionStatus, to: SessionStatus): StateTransition | undefined {
    return STATE_TRANSITIONS.find(t => t.from === from && t.to === to);
  }

  /**
   * 조건 검증
   */
  private checkConditions(session: WorkSession, conditions: string[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const condition of conditions) {
      switch (condition) {
        case 'can_reopen':
          if (session.status === SessionStatus.COMPLETED && !this.config.allow_reopen_completed) {
            errors.push('Reopening completed sessions is not allowed');
          }
          if (session.status === SessionStatus.CANCELLED && !this.config.allow_reopen_cancelled) {
            errors.push('Reopening cancelled sessions is not allowed');
          }
          break;
        
        default:
          errors.push(`Unknown condition: ${condition}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig: Partial<StateManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 현재 설정 조회
   */
  getConfig(): StateManagerConfig {
    return { ...this.config };
  }

  /**
   * 모든 상태 전환 규칙 조회
   */
  getTransitionRules(): StateTransition[] {
    return [...STATE_TRANSITIONS];
  }
}

// 기본 상태 관리자 인스턴스
export const sessionStateManager = new SessionStateManager();

// 상태 관리자 빌더
export class StateManagerBuilder {
  private config: Partial<StateManagerConfig> = {};

  allowReopenCompleted(allow: boolean): this {
    this.config.allow_reopen_completed = allow;
    return this;
  }

  allowReopenCancelled(allow: boolean): this {
    this.config.allow_reopen_cancelled = allow;
    return this;
  }

  autoUpdateTimestamps(auto: boolean): this {
    this.config.auto_update_timestamps = auto;
    return this;
  }

  validateConditions(validate: boolean): this {
    this.config.validate_conditions = validate;
    return this;
  }

  build(): SessionStateManager {
    return new SessionStateManager(this.config);
  }
}
