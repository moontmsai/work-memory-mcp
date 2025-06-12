/**
 * SessionSwitchManager 테스트 파일
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionSwitchManager } from '../src/session/SessionSwitchManager.js';
import { SessionFactory } from '../src/session/SessionFactory.js';
import { SessionStatus, SwitchDecision } from '../src/types/session.js';

// 모킹된 데이터베이스 연결
const mockConnection = {
  query: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
  close: vi.fn()
};

describe('SessionSwitchManager', () => {
  let switchManager: SessionSwitchManager;
  let sessionFactory: SessionFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    switchManager = new SessionSwitchManager(mockConnection as any);
    sessionFactory = new SessionFactory();
  });

  describe('세션 전환 기본 동작', () => {
    it('새 프로젝트에 대해 새 세션을 생성해야 함', async () => {
      // 빈 결과 모킹 (기존 세션 없음)
      mockConnection.all.mockResolvedValue([]);
      mockConnection.get.mockResolvedValue({ count: 0 });
      mockConnection.query.mockResolvedValue({});

      const context = {
        project_path: '/test/new-project',
        project_name: 'new-project',
        git_repository: 'https://github.com/test/new-project.git'
      };

      const result = await switchManager.switchSession(context);
      
      // 에러가 있다면 출력
      if (!result.success) {
        console.log('Switch failed:', result.errors);
      }

      expect(result.success).toBe(true);
      expect(result.switched).toBe(true);
      expect(result.decision).toBe(SwitchDecision.CREATE_NEW);
      expect(result.target_session).toBeDefined();
      expect(result.target_session?.project_name).toBe('new-project');
      expect(result.target_session?.status).toBe(SessionStatus.ACTIVE);
    });

    it('기존 활성 세션과 동일한 프로젝트면 전환하지 않아야 함', async () => {
      // 기존 활성 세션 모킹
      const existingSession = sessionFactory.createSession({
        project_name: 'existing-project',
        project_path: '/test/existing-project'
      });

      mockConnection.all.mockResolvedValue([existingSession.session]);
      mockConnection.get.mockResolvedValue({ count: 1 });

      const context = {
        project_path: '/test/existing-project',
        project_name: 'existing-project'
      };

      const result = await switchManager.switchSession(context);

      expect(result.success).toBe(true);
      expect(result.decision).toBe(SwitchDecision.NO_ACTION);
      expect(result.switched).toBe(false);
    });

    it('일시정지된 관련 세션을 재활성화해야 함', async () => {
      // 일시정지된 세션 모킹
      const pausedSession = sessionFactory.createSession({
        project_name: 'paused-project',
        project_path: '/test/paused-project'
      });

      if (pausedSession.session) {
        pausedSession.session.status = SessionStatus.PAUSED;
      }

      // findSessions 호출 순서에 따른 모킹
      mockConnection.all
        .mockResolvedValueOnce([]) // 현재 활성 세션 (없음)
        .mockResolvedValueOnce([]) // 일시정지 세션 (없음) 
        .mockResolvedValueOnce([]) // 최근 활동 세션
        .mockResolvedValueOnce([pausedSession.session]); // 관련 세션 검색

      mockConnection.get.mockResolvedValue({ count: 0 });
      mockConnection.query.mockResolvedValue({});

      const context = {
        project_path: '/test/paused-project',
        project_name: 'paused-project'
      };

      const result = await switchManager.switchSession(context);

      expect(result.success).toBe(true);
      expect(result.switched).toBe(true);
      expect(result.decision).toBe(SwitchDecision.REACTIVATE_EXISTING);
    });
  });

  describe('세션 유사도 계산', () => {
    it('프로젝트명이 정확히 일치하면 높은 점수를 줘야 함', () => {
      const session = sessionFactory.createSession({
        project_name: 'test-project',
        project_path: '/path/to/test-project'
      });

      const context = {
        project_path: '/different/path/test-project',
        project_name: 'test-project'
      };

      if (session.created && session.session) {
        const similarity = switchManager['calculateSessionSimilarity'](session.session, context);
        expect(similarity).toBeGreaterThanOrEqual(0.4);
      }
    });

    it('프로젝트 경로가 정확히 일치하면 높은 점수를 줘야 함', () => {
      const session = sessionFactory.createSession({
        project_name: 'different-name',
        project_path: '/path/to/test-project'
      });

      const context = {
        project_path: '/path/to/test-project',
        project_name: 'test-project'
      };

      if (session.created && session.session) {
        const similarity = switchManager['calculateSessionSimilarity'](session.session, context);
        expect(similarity).toBeGreaterThanOrEqual(0.4);
      }
    });
  });

  describe('전환 조건 테스트', () => {
    it('전환 조건을 올바르게 평가해야 함', async () => {
      mockConnection.all.mockResolvedValue([]);
      mockConnection.get.mockResolvedValue({ count: 0 });

      const context = {
        project_path: '/test/evaluation-project',
        project_name: 'evaluation-project'
      };

      const evaluation = await switchManager.testSwitchConditions(context);

      expect(evaluation).toBeDefined();
      expect([
        SwitchDecision.NO_ACTION,
        SwitchDecision.CREATE_NEW,
        SwitchDecision.REACTIVATE_EXISTING
      ]).toContain(evaluation.decision);
      expect(evaluation.confidence).toBeGreaterThanOrEqual(0);
      expect(evaluation.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(evaluation.reasons)).toBe(true);
    });

    it('강제 생성 플래그가 설정되면 새 세션을 생성해야 함', async () => {
      mockConnection.all.mockResolvedValue([]);
      mockConnection.get.mockResolvedValue({ count: 0 });
      mockConnection.query.mockResolvedValue({});

      const context = {
        project_path: '/test/force-project',
        project_name: 'force-project',
        force_create: true
      };

      const result = await switchManager.switchSession(context);

      expect(result.success).toBe(true);
      expect(result.decision).toBe(SwitchDecision.CREATE_NEW);
      expect(result.target_session).toBeDefined();
    });
  });

  describe('현재 상태 조회', () => {
    it('현재 활성 세션을 정확히 조회해야 함', async () => {
      const activeSession = sessionFactory.createSession({
        project_name: 'current-active',
        project_path: '/test/current-active'
      });

      mockConnection.all.mockResolvedValue([activeSession.session]);
      mockConnection.get.mockResolvedValue({ count: 1 });

      const currentSession = await switchManager.getCurrentActiveSession();

      expect(currentSession).toBeDefined();
      expect(currentSession?.project_name).toBe('current-active');
      expect(currentSession?.status).toBe(SessionStatus.ACTIVE);
    });

    it('프로젝트별 세션 히스토리를 조회해야 함', async () => {
      // 동일 프로젝트의 여러 세션 모킹
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const session = sessionFactory.createSession({
          project_name: 'history-project',
          project_path: `/test/history-project-${i}`
        });
        if (session.session) sessions.push(session.session);
      }

      mockConnection.all.mockResolvedValue(sessions);
      mockConnection.get.mockResolvedValue({ count: 3 });

      const history = await switchManager.getProjectSessionHistory('history-project');

      expect(history).toBeDefined();
      expect(history.length).toBe(3);
      expect(history.every(s => s.project_name === 'history-project')).toBe(true);
    });
  });

  describe('통계 조회', () => {
    it('세션 전환 통계를 올바르게 계산해야 함', async () => {
      // 다양한 통계 데이터 모킹
      mockConnection.get
        .mockResolvedValueOnce({ count: 2 }) // 활성 세션 수
        .mockResolvedValueOnce({ count: 2 }) // 일시정지 세션 수
        .mockResolvedValueOnce({ count: 2 }); // 완료된 세션들

      mockConnection.all
        .mockResolvedValueOnce([{ session_id: 'recent1' }, { session_id: 'recent2' }]) // 최근 전환
        .mockResolvedValueOnce([]); // 완료된 세션들 (평균 계산용)

      const stats = await switchManager.getSwitchStats();

      expect(stats).toBeDefined();
      expect(stats.total_active_sessions).toBe(2);
      expect(stats.total_paused_sessions).toBe(2);
      expect(stats.recent_switches).toBeGreaterThanOrEqual(0);
      expect(stats.avg_session_duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('설정 관리', () => {
    it('전환 정책을 업데이트할 수 있어야 함', () => {
      const newPolicy = {
        max_active_sessions: 5,
        auto_pause_previous: false
      };

      switchManager.updatePolicy(newPolicy);
      const config = switchManager.getConfig();

      expect(config.max_active_sessions).toBe(5);
      expect(config.auto_pause_previous).toBe(false);
    });

    it('현재 설정을 조회할 수 있어야 함', () => {
      const config = switchManager.getConfig();

      expect(config).toBeDefined();
      expect(typeof config.max_active_sessions).toBe('number');
      expect(typeof config.auto_pause_previous).toBe('boolean');
      expect(typeof config.similarity_threshold).toBe('number');
    });
  });
});
