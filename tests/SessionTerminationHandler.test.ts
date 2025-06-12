/**
 * SessionTerminationHandler 테스트 파일
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionTerminationHandler } from '../src/session/SessionTerminationHandler.js';
import { SessionStatus, TerminationReason } from '../src/types/session.js';

// 모킹된 데이터베이스 연결
const mockConnection = {
  query: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
  close: vi.fn()
};

describe('SessionTerminationHandler', () => {
  let handler: SessionTerminationHandler;
  let mockSession: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    handler = new SessionTerminationHandler(mockConnection as any, {
      auto_finalize_incomplete_work: true,
      backup_session_data: true,
      cleanup_orphaned_memories: false,
      force_cleanup_timeout_ms: 30000,
      preserve_session_history: true,
      generate_termination_report: true
    });

    mockSession = {
      session_id: 'test_session_123',
      project_name: 'test-project',
      status: SessionStatus.ACTIVE,
      started_at: new Date(Date.now() - 60000).toISOString(), // 1분 전
      last_activity_at: new Date(Date.now() - 10000).toISOString(), // 10초 전
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  describe('정상 세션 종료', () => {
    it('활성 세션을 정상적으로 종료할 수 있어야 함', async () => {
      // 세션 조회 모킹
      mockConnection.get
        .mockResolvedValueOnce(mockSession) // getSession
        .mockResolvedValueOnce({ count: 0 }) // 미완료 메모리 확인
        .mockResolvedValueOnce({ total_memories: 5, todo_count: 0, memory_count: 5 }); // 메모리 통계

      // 다른 쿼리들 모킹
      mockConnection.query.mockResolvedValue({ changes: 1 });
      mockConnection.all.mockResolvedValue([]);

      const result = await handler.terminateSession(
        'test_session_123',
        TerminationReason.NORMAL
      );

      expect(result.success).toBe(true);
      expect(result.session_id).toBe('test_session_123');
      expect(result.final_status).toBe(SessionStatus.COMPLETED);
      expect(result.cleanup_result).toBeDefined();
      expect(result.termination_report).toBeDefined();
      expect(result.backup_id).toBeDefined();
    });

    it('존재하지 않는 세션 종료 시 에러를 반환해야 함', async () => {
      mockConnection.get.mockResolvedValue(null);

      const result = await handler.terminateSession('nonexistent_session');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Session not found');
    });

    it('이미 종료된 세션에 대해 적절한 에러를 반환해야 함', async () => {
      const completedSession = {
        ...mockSession,
        status: SessionStatus.COMPLETED
      };

      mockConnection.get
        .mockResolvedValueOnce(completedSession)
        .mockResolvedValueOnce({ count: 0 });

      const result = await handler.terminateSession('test_session_123');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('already terminated');
    });
  });

  describe('강제 세션 종료', () => {
    it('강제 종료가 정상적으로 작동해야 함', async () => {
      const completedSession = {
        ...mockSession,
        status: SessionStatus.COMPLETED
      };

      mockConnection.get
        .mockResolvedValueOnce(completedSession)
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ total_memories: 3, todo_count: 1, memory_count: 2 });

      mockConnection.query.mockResolvedValue({ changes: 1 });
      mockConnection.all.mockResolvedValue([]);

      const result = await handler.forceTerminateSession('test_session_123');

      expect(result.success).toBe(true);
      expect(result.final_status).toBe(SessionStatus.CANCELLED);
    });
  });

  describe('일괄 세션 종료', () => {
    it('여러 세션을 순차적으로 종료할 수 있어야 함', async () => {
      const sessionIds = ['session1', 'session2', 'session3'];
      
      // 각 세션에 대한 모킹
      mockConnection.get
        .mockResolvedValue(mockSession)
        .mockResolvedValue({ count: 0 })
        .mockResolvedValue({ total_memories: 2, todo_count: 0, memory_count: 2 });

      mockConnection.query.mockResolvedValue({ changes: 1 });
      mockConnection.all.mockResolvedValue([]);

      const result = await handler.terminateMultipleSessions(
        sessionIds,
        TerminationReason.USER_REQUESTED,
        { parallel: false }
      );

      expect(result.summary.total).toBe(3);
      expect(result.summary.successful).toBeGreaterThan(0);
      expect(result.results).toHaveLength(3);
    });

    it('병렬 처리로 여러 세션을 종료할 수 있어야 함', async () => {
      const sessionIds = ['session1', 'session2'];
      
      mockConnection.get
        .mockResolvedValue(mockSession)
        .mockResolvedValue({ count: 0 })
        .mockResolvedValue({ total_memories: 1, todo_count: 0, memory_count: 1 });

      mockConnection.query.mockResolvedValue({ changes: 1 });
      mockConnection.all.mockResolvedValue([]);

      const result = await handler.terminateMultipleSessions(
        sessionIds,
        TerminationReason.NORMAL,
        { parallel: true, max_concurrent: 2 }
      );

      expect(result.summary.total).toBe(2);
      expect(result.results).toHaveLength(2);
    });
  });

  describe('미완료 작업 처리', () => {
    it('TODO 타입 메모리를 일반 메모리로 전환해야 함', async () => {
      const todoMemories = [
        { id: 1, content: 'Incomplete task 1', work_type: 'todo' },
        { id: 2, content: 'Incomplete task 2', work_type: 'todo' }
      ];

      // 최근 활동이 아닌 세션으로 설정 (warnings 방지)
      const oldSession = {
        ...mockSession,
        last_activity_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10분 전
      };

      // 세션 조회 및 검증
      mockConnection.get
        .mockResolvedValueOnce(oldSession)          // getSession
        .mockResolvedValueOnce({ count: 0 })        // validateTermination - 미완료 메모리 확인
        .mockResolvedValueOnce({ total_memories: 5, todo_count: 2, memory_count: 3 }); // 보고서용 메모리 통계

      // finalizeIncompleteWork에서 TODO 메모리 조회
      mockConnection.all
        .mockImplementation((sql: string) => {
          if (sql.includes('work_type = "todo"')) {
            return Promise.resolve(todoMemories);
          }
          return Promise.resolve([]); // 기타 조회
        });

      mockConnection.query.mockResolvedValue({ changes: 1 });

      const result = await handler.terminateSession('test_session_123');
      
      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Converted 2 incomplete TODO items to regular memories');
    });
  });

  describe('백업 및 복원', () => {
    it('세션 데이터를 백업해야 함', async () => {
      mockConnection.get
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ total_memories: 1, todo_count: 0, memory_count: 1 });

      mockConnection.all.mockResolvedValue([]); // 메모리 데이터
      mockConnection.query.mockResolvedValue({ changes: 1 });

      const result = await handler.terminateSession('test_session_123');

      expect(result.success).toBe(true);
      expect(result.backup_id).toBeDefined();
      expect(result.backup_id).toMatch(/^backup_test_session_123_\d+$/);
    });
  });

  describe('설정 관리', () => {
    it('설정을 업데이트할 수 있어야 함', () => {
      const newConfig = {
        auto_finalize_incomplete_work: false,
        backup_session_data: false
      };

      handler.updateConfig(newConfig);
      const config = handler.getConfig();

      expect(config.auto_finalize_incomplete_work).toBe(false);
      expect(config.backup_session_data).toBe(false);
    });

    it('현재 설정을 조회할 수 있어야 함', () => {
      const config = handler.getConfig();

      expect(config).toBeDefined();
      expect(typeof config.auto_finalize_incomplete_work).toBe('boolean');
      expect(typeof config.backup_session_data).toBe('boolean');
      expect(typeof config.force_cleanup_timeout_ms).toBe('number');
    });
  });

  describe('종료 통계', () => {
    it('종료 통계를 조회할 수 있어야 함', async () => {
      const mockStats = [
        {
          termination_reason: 'normal',
          count: 10,
          avg_execution_time: 1500,
          success_rate: 1.0
        },
        {
          termination_reason: 'error',
          count: 2,
          avg_execution_time: 2000,
          success_rate: 0.5
        }
      ];

      mockConnection.all.mockResolvedValue(mockStats);

      const stats = await handler.getTerminationStats();

      expect(stats.total_terminations).toBe(12);
      expect(stats.by_reason.normal).toBe(10);
      expect(stats.by_reason.error).toBe(2);
      expect(stats.success_rate).toBeCloseTo(0.917, 2); // (10*1.0 + 2*0.5) / 12
      expect(stats.avg_cleanup_time_ms).toBeCloseTo(1583.33, 2); // (10*1500 + 2*2000) / 12
    });
  });

  describe('에러 처리', () => {
    it('데이터베이스 오류 시 적절한 에러를 반환해야 함', async () => {
      mockConnection.get.mockRejectedValue(new Error('Database connection failed'));

      const result = await handler.terminateSession('test_session_123');

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Termination failed');
    });

    it('백업 실패 시에도 종료가 계속 진행되어야 함', async () => {
      mockConnection.get
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ total_memories: 1, todo_count: 0, memory_count: 1 });

      mockConnection.all.mockResolvedValue([]);
      
      // 백업 쿼리만 실패
      mockConnection.query
        .mockRejectedValueOnce(new Error('Backup failed'))
        .mockResolvedValue({ changes: 1 });

      const result = await handler.terminateSession('test_session_123');

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Backup failed: Backup failed');
    });
  });
});
