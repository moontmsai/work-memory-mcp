/**
 * SessionStateManager 유닛 테스트
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStateManager, StateManagerBuilder } from '../../../src/session/SessionStateManager.js';
import { SessionStatus, WorkSession } from '../../../src/types/session.js';

describe('SessionStateManager', () => {
  let stateManager: SessionStateManager;
  let mockSession: WorkSession;

  beforeEach(() => {
    stateManager = new SessionStateManager();
    
    // 테스트용 모의 세션
    mockSession = {
      session_id: 'test-session-123',
      project_name: 'test-project',
      project_path: '/test/path',
      git_repository: undefined,
      started_at: '2025-06-11T10:00:00.000Z',
      ended_at: undefined,
      last_activity_at: '2025-06-11T10:00:00.000Z',
      status: SessionStatus.ACTIVE,
      description: 'Test session',
      auto_created: false,
      tags: ['test'],
      created_by: 'test-user',
      created_at: '2025-06-11T10:00:00.000Z',
      updated_at: '2025-06-11T10:00:00.000Z',
      activity_count: 0,
      memory_count: 0,
      total_work_time: 0,
      project_normalized: 'test-project'
    };
  });

  describe('기본 상태 전환', () => {
    it('ACTIVE에서 PAUSED로 전환할 수 있다', () => {
      const result = stateManager.pauseSession(mockSession);

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe(SessionStatus.ACTIVE);
      expect(result.new_status).toBe(SessionStatus.PAUSED);
      expect(mockSession.status).toBe(SessionStatus.PAUSED);
      expect(mockSession.updated_at).not.toBe('2025-06-11T10:00:00.000Z');
    });

    it('ACTIVE에서 COMPLETED로 전환할 수 있다', () => {
      const result = stateManager.completeSession(mockSession);

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe(SessionStatus.ACTIVE);
      expect(result.new_status).toBe(SessionStatus.COMPLETED);
      expect(mockSession.status).toBe(SessionStatus.COMPLETED);
      expect(mockSession.ended_at).toBeDefined();
    });

    it('ACTIVE에서 CANCELLED로 전환할 수 있다', () => {
      const result = stateManager.cancelSession(mockSession);

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe(SessionStatus.ACTIVE);
      expect(result.new_status).toBe(SessionStatus.CANCELLED);
      expect(mockSession.status).toBe(SessionStatus.CANCELLED);
      expect(mockSession.ended_at).toBeDefined();
    });

    it('PAUSED에서 ACTIVE로 전환할 수 있다', () => {
      // 먼저 PAUSED로 변경
      mockSession.status = SessionStatus.PAUSED;

      const result = stateManager.activateSession(mockSession);

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe(SessionStatus.PAUSED);
      expect(result.new_status).toBe(SessionStatus.ACTIVE);
      expect(mockSession.status).toBe(SessionStatus.ACTIVE);
    });

    it('COMPLETED에서 ACTIVE로 재개할 수 있다', () => {
      // 먼저 COMPLETED로 변경
      mockSession.status = SessionStatus.COMPLETED;
      mockSession.ended_at = '2025-06-11T11:00:00.000Z';

      const result = stateManager.activateSession(mockSession);

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe(SessionStatus.COMPLETED);
      expect(result.new_status).toBe(SessionStatus.ACTIVE);
      expect(mockSession.status).toBe(SessionStatus.ACTIVE);
      expect(mockSession.ended_at).toBeUndefined(); // 재개 시 ended_at 초기화
    });

    it('CANCELLED에서 ACTIVE로 재개할 수 있다', () => {
      // 먼저 CANCELLED로 변경
      mockSession.status = SessionStatus.CANCELLED;
      mockSession.ended_at = '2025-06-11T11:00:00.000Z';

      const result = stateManager.activateSession(mockSession);

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe(SessionStatus.CANCELLED);
      expect(result.new_status).toBe(SessionStatus.ACTIVE);
      expect(mockSession.status).toBe(SessionStatus.ACTIVE);
      expect(mockSession.ended_at).toBeUndefined(); // 재개 시 ended_at 초기화
    });
  });

  describe('금지된 상태 전환', () => {
    it('COMPLETED에서 PAUSED로 전환할 수 없다', () => {
      mockSession.status = SessionStatus.COMPLETED;

      const result = stateManager.pauseSession(mockSession);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid state transition from completed to paused');
      expect(mockSession.status).toBe(SessionStatus.COMPLETED); // 상태 변경되지 않음
    });

    it('COMPLETED에서 CANCELLED로 전환할 수 없다', () => {
      mockSession.status = SessionStatus.COMPLETED;

      const result = stateManager.cancelSession(mockSession);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid state transition from completed to cancelled');
    });

    it('CANCELLED에서 PAUSED로 전환할 수 없다', () => {
      mockSession.status = SessionStatus.CANCELLED;

      const result = stateManager.pauseSession(mockSession);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid state transition from cancelled to paused');
    });

    it('CANCELLED에서 COMPLETED로 전환할 수 없다', () => {
      mockSession.status = SessionStatus.CANCELLED;

      const result = stateManager.completeSession(mockSession);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid state transition from cancelled to completed');
    });
  });

  describe('동일 상태 전환', () => {
    it('같은 상태로의 전환은 성공하지만 경고를 준다', () => {
      const result = stateManager.activateSession(mockSession); // 이미 ACTIVE

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe(SessionStatus.ACTIVE);
      expect(result.new_status).toBe(SessionStatus.ACTIVE);
      expect(result.errors).toContain('Status is already active');
    });
  });

  describe('강제 전환', () => {
    it('force 옵션으로 금지된 전환을 수행할 수 있다', () => {
      mockSession.status = SessionStatus.COMPLETED;

      const result = stateManager.changeState(mockSession, SessionStatus.PAUSED, { force: true });

      expect(result.success).toBe(true);
      expect(result.previous_status).toBe(SessionStatus.COMPLETED);
      expect(result.new_status).toBe(SessionStatus.PAUSED);
      expect(mockSession.status).toBe(SessionStatus.PAUSED);
    });
  });

  describe('상태 전환 가능성 확인', () => {
    it('허용된 전환을 올바르게 식별한다', () => {
      expect(stateManager.canTransition(SessionStatus.ACTIVE, SessionStatus.PAUSED)).toBe(true);
      expect(stateManager.canTransition(SessionStatus.ACTIVE, SessionStatus.COMPLETED)).toBe(true);
      expect(stateManager.canTransition(SessionStatus.ACTIVE, SessionStatus.CANCELLED)).toBe(true);
      expect(stateManager.canTransition(SessionStatus.PAUSED, SessionStatus.ACTIVE)).toBe(true);
    });

    it('금지된 전환을 올바르게 식별한다', () => {
      expect(stateManager.canTransition(SessionStatus.COMPLETED, SessionStatus.PAUSED)).toBe(false);
      expect(stateManager.canTransition(SessionStatus.COMPLETED, SessionStatus.CANCELLED)).toBe(false);
      expect(stateManager.canTransition(SessionStatus.CANCELLED, SessionStatus.PAUSED)).toBe(false);
      expect(stateManager.canTransition(SessionStatus.CANCELLED, SessionStatus.COMPLETED)).toBe(false);
    });

    it('특정 세션에서 가능한 전환 목록을 반환한다', () => {
      // ACTIVE 상태에서 가능한 전환
      const activeTransitions = stateManager.getAvailableTransitions(mockSession);
      expect(activeTransitions).toContain(SessionStatus.PAUSED);
      expect(activeTransitions).toContain(SessionStatus.COMPLETED);
      expect(activeTransitions).toContain(SessionStatus.CANCELLED);
      expect(activeTransitions).not.toContain(SessionStatus.ACTIVE);

      // COMPLETED 상태에서 가능한 전환
      mockSession.status = SessionStatus.COMPLETED;
      const completedTransitions = stateManager.getAvailableTransitions(mockSession);
      expect(completedTransitions).toContain(SessionStatus.ACTIVE);
      expect(completedTransitions).not.toContain(SessionStatus.PAUSED);
      expect(completedTransitions).not.toContain(SessionStatus.CANCELLED);
    });
  });

  describe('설정 기반 동작', () => {
    it('재개 비허용 설정이 작동한다', () => {
      const restrictiveManager = new SessionStateManager({
        allow_reopen_completed: false,
        allow_reopen_cancelled: false
      });

      mockSession.status = SessionStatus.COMPLETED;
      const result = restrictiveManager.activateSession(mockSession);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid state transition from completed to active');
    });

    it('타임스탬프 자동 업데이트 설정이 작동한다', () => {
      const noTimestampManager = new SessionStateManager({
        auto_update_timestamps: false
      });

      const originalUpdatedAt = mockSession.updated_at;
      noTimestampManager.pauseSession(mockSession);

      expect(mockSession.updated_at).toBe(originalUpdatedAt); // 변경되지 않음
    });

    it('설정을 업데이트할 수 있다', () => {
      stateManager.updateConfig({
        allow_reopen_completed: false
      });

      const config = stateManager.getConfig();
      expect(config.allow_reopen_completed).toBe(false);
      expect(config.allow_reopen_cancelled).toBe(true); // 기본값 유지
    });
  });

  describe('상태 히스토리 분석', () => {
    it('세션 상태 통계를 올바르게 계산한다', () => {
      const sessions: WorkSession[] = [
        { ...mockSession, status: SessionStatus.ACTIVE },
        { ...mockSession, status: SessionStatus.ACTIVE },
        { ...mockSession, status: SessionStatus.PAUSED },
        { ...mockSession, status: SessionStatus.COMPLETED },
        { ...mockSession, status: SessionStatus.CANCELLED }
      ];

      const analysis = stateManager.analyzeStateHistory(sessions);

      expect(analysis.total_sessions).toBe(5);
      expect(analysis.by_status[SessionStatus.ACTIVE]).toBe(2);
      expect(analysis.by_status[SessionStatus.PAUSED]).toBe(1);
      expect(analysis.by_status[SessionStatus.COMPLETED]).toBe(1);
      expect(analysis.by_status[SessionStatus.CANCELLED]).toBe(1);
      expect(analysis.completed_ratio).toBe(0.2);
      expect(analysis.cancelled_ratio).toBe(0.2);
      expect(analysis.active_ratio).toBe(0.6); // ACTIVE + PAUSED
    });

    it('빈 세션 목록을 처리할 수 있다', () => {
      const analysis = stateManager.analyzeStateHistory([]);

      expect(analysis.total_sessions).toBe(0);
      expect(analysis.completed_ratio).toBe(0);
      expect(analysis.cancelled_ratio).toBe(0);
      expect(analysis.active_ratio).toBe(0);
    });
  });

  describe('StateManagerBuilder', () => {
    it('빌더 패턴으로 상태 관리자를 생성할 수 있다', () => {
      const manager = new StateManagerBuilder()
        .allowReopenCompleted(false)
        .allowReopenCancelled(false)
        .autoUpdateTimestamps(false)
        .validateConditions(false)
        .build();

      const config = manager.getConfig();
      expect(config.allow_reopen_completed).toBe(false);
      expect(config.allow_reopen_cancelled).toBe(false);
      expect(config.auto_update_timestamps).toBe(false);
      expect(config.validate_conditions).toBe(false);
    });
  });

  describe('전환 규칙 조회', () => {
    it('모든 상태 전환 규칙을 조회할 수 있다', () => {
      const rules = stateManager.getTransitionRules();

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.from === SessionStatus.ACTIVE && r.to === SessionStatus.PAUSED && r.allowed)).toBe(true);
      expect(rules.some(r => r.from === SessionStatus.COMPLETED && r.to === SessionStatus.PAUSED && !r.allowed)).toBe(true);
    });
  });
});
