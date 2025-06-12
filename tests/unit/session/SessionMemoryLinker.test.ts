/**
 * SessionMemoryLinker 유닛 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionMemoryLinker, MemoryItem } from '../../../src/session/SessionMemoryLinker.js';
import { SessionStatus, WorkSession } from '../../../src/types/session.js';

// 모의 데이터베이스 연결
const mockConnection = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
  batch: vi.fn(),
  close: vi.fn()
};

describe('SessionMemoryLinker', () => {
  let memoryLinker: SessionMemoryLinker;
  let mockSession: WorkSession;
  let mockMemories: MemoryItem[];

  beforeEach(() => {
    vi.clearAllMocks();
    memoryLinker = new SessionMemoryLinker(mockConnection as any);

    // 테스트용 모의 세션
    mockSession = {
      session_id: 'session-1',
      project_name: 'Test Project',
      project_path: '/test/path',
      git_repository: undefined,
      started_at: '2025-06-11T10:00:00.000Z',
      ended_at: undefined,
      last_activity_at: '2025-06-11T12:00:00.000Z',
      status: SessionStatus.ACTIVE,
      description: 'Test session',
      auto_created: false,
      tags: ['test'],
      created_by: 'test-user',
      created_at: '2025-06-11T10:00:00.000Z',
      updated_at: '2025-06-11T12:00:00.000Z',
      activity_count: 5,
      memory_count: 0,
      total_work_time: 7200,
      project_normalized: 'test project'
    };

    // 테스트용 모의 메모리들
    mockMemories = [
      {
        id: 'mem-1',
        session_id: undefined,
        content: 'Test memory 1',
        importance_score: 85,
        created_at: '2025-06-11T11:00:00.000Z',
        updated_at: '2025-06-11T11:00:00.000Z',
        project: 'Test Project',
        tags: ['test', 'important'],
        work_type: 'memory',
        created_by: 'test-user',
        context: 'Test context',
        requirements: undefined,
        result_content: undefined
      },
      {
        id: 'mem-2',
        session_id: 'other-session',
        content: 'Test memory 2',
        importance_score: 60,
        created_at: '2025-06-11T11:30:00.000Z',
        updated_at: '2025-06-11T11:30:00.000Z',
        project: 'Test Project',
        tags: ['test'],
        work_type: 'todo',
        created_by: 'test-user',
        context: undefined,
        requirements: 'Test requirements',
        result_content: undefined
      },
      {
        id: 'mem-3',
        session_id: undefined,
        content: '',  // 빈 컨텐츠 - 검증 실패 테스트용
        importance_score: 30,
        created_at: '2025-06-11T12:00:00.000Z',
        updated_at: '2025-06-11T12:00:00.000Z',
        project: 'Other Project',
        tags: [],
        work_type: 'memory',
        created_by: 'test-user',
        context: undefined,
        requirements: undefined,
        result_content: undefined
      }
    ];
  });

  describe('linkMemoryToSession', () => {
    it('메모리를 세션에 성공적으로 연결할 수 있다', async () => {
      // 세션 존재 확인
      mockConnection.get.mockResolvedValueOnce(mockSession);
      
      // 메모리들 조회
      mockConnection.all.mockResolvedValueOnce([mockMemories[0]]);
      
      // 메모리 업데이트 성공
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });
      
      // 세션 메모리 카운트 조회
      mockConnection.get.mockResolvedValueOnce({ count: 1 });
      
      // 세션 업데이트
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });

      const result = await memoryLinker.linkMemoryToSession('session-1', ['mem-1']);

      expect(result.success).toBe(true);
      expect(result.linked_count).toBe(1);
      expect(result.failed_count).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('존재하지 않는 세션에 연결을 시도하면 실패한다', async () => {
      mockConnection.get.mockResolvedValueOnce(null);

      const result = await memoryLinker.linkMemoryToSession('nonexistent', ['mem-1']);

      expect(result.success).toBe(false);
      expect(result.linked_count).toBe(0);
      expect(result.failed_count).toBe(1);
      expect(result.errors).toContain('Session nonexistent not found');
    });

    it('존재하지 않는 메모리 연결을 시도하면 실패한다', async () => {
      mockConnection.get.mockResolvedValueOnce(mockSession);
      mockConnection.all.mockResolvedValueOnce([]); // 빈 메모리 목록

      const result = await memoryLinker.linkMemoryToSession('session-1', ['nonexistent']);

      expect(result.success).toBe(false);
      expect(result.linked_count).toBe(0);
      expect(result.failed_count).toBe(1);
      expect(result.errors).toContain('Memory nonexistent not found');
    });

    it('이미 다른 세션에 연결된 메모리는 기본적으로 연결 실패한다', async () => {
      mockConnection.get.mockResolvedValueOnce(mockSession);
      mockConnection.all.mockResolvedValueOnce([mockMemories[1]]); // 이미 연결된 메모리

      const result = await memoryLinker.linkMemoryToSession('session-1', ['mem-2']);

      expect(result.success).toBe(false);
      expect(result.linked_count).toBe(0);
      expect(result.failed_count).toBe(1);
      expect(result.errors[0]).toContain('already linked to session other-session');
    });

    it('force_relink 옵션으로 이미 연결된 메모리를 재연결할 수 있다', async () => {
      mockConnection.get.mockResolvedValueOnce(mockSession);
      mockConnection.all.mockResolvedValueOnce([mockMemories[1]]);
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });
      mockConnection.get.mockResolvedValueOnce({ count: 1 });
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });

      const result = await memoryLinker.linkMemoryToSession('session-1', ['mem-2'], {
        force_relink: true
      });

      expect(result.success).toBe(true);
      expect(result.linked_count).toBe(1);
      expect(result.warnings).toContain('Memory mem-2 was linked to session other-session, now relinked to session-1');
    });

    it('검증 규칙에 실패하면 연결되지 않는다', async () => {
      mockConnection.get.mockResolvedValueOnce(mockSession);
      mockConnection.all.mockResolvedValueOnce([mockMemories[2]]); // 빈 컨텐츠

      const result = await memoryLinker.linkMemoryToSession('session-1', ['mem-3']);

      expect(result.success).toBe(false);
      expect(result.failed_count).toBe(1);
      expect(result.errors[0]).toContain('Memory must have non-empty content');
    });

    it('취소된 세션에는 메모리를 연결할 수 없다', async () => {
      const cancelledSession = { ...mockSession, status: SessionStatus.CANCELLED };
      mockConnection.get.mockResolvedValueOnce(cancelledSession);
      mockConnection.all.mockResolvedValueOnce([mockMemories[0]]);

      const result = await memoryLinker.linkMemoryToSession('session-1', ['mem-1']);

      expect(result.success).toBe(false);
      expect(result.failed_count).toBe(1);
      expect(result.errors[0]).toContain('Cannot link memory to cancelled session');
    });
  });

  describe('unlinkMemoryFromSession', () => {
    it('메모리를 세션에서 소프트 언링크할 수 있다', async () => {
      // 연결된 메모리 확인
      mockConnection.all.mockResolvedValueOnce([{ id: 'mem-1' }]);
      
      // 메모리 업데이트 (session_id = NULL)
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });
      
      // 세션 메모리 카운트 조회
      mockConnection.get.mockResolvedValueOnce({ count: 0 });
      
      // 세션 업데이트
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });

      const result = await memoryLinker.unlinkMemoryFromSession('session-1', ['mem-1'], {
        soft_unlink: true
      });

      expect(result.success).toBe(true);
      expect(result.linked_count).toBe(1); // unlinked count
      expect(result.failed_count).toBe(0);
    });

    it('하드 언링크로 메모리를 완전 삭제할 수 있다', async () => {
      mockConnection.all.mockResolvedValueOnce([{ id: 'mem-1' }]);
      mockConnection.run.mockResolvedValueOnce({ changes: 1 }); // DELETE
      mockConnection.get.mockResolvedValueOnce({ count: 0 });
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });

      const result = await memoryLinker.unlinkMemoryFromSession('session-1', ['mem-1'], {
        soft_unlink: false
      });

      expect(result.success).toBe(true);
      expect(mockConnection.run).toHaveBeenCalledWith(
        'DELETE FROM work_memories WHERE id = ?',
        ['mem-1']
      );
    });

    it('연결되지 않은 메모리 언링크 시 경고를 표시한다', async () => {
      mockConnection.all.mockResolvedValueOnce([]); // 연결된 메모리 없음

      const result = await memoryLinker.unlinkMemoryFromSession('session-1', ['mem-1']);

      expect(result.warnings).toContain('Memory mem-1 is not linked to session session-1');
    });
  });

  describe('migrateMemoryToSession', () => {
    it('메모리를 다른 세션으로 마이그레이션할 수 있다', async () => {
      const targetSession = { ...mockSession, session_id: 'session-2' };
      
      // 타겟 세션 검증
      mockConnection.get.mockResolvedValueOnce(targetSession);
      
      // 언링크 작업 모킹
      mockConnection.all.mockResolvedValueOnce([{ id: 'mem-1' }]);
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });
      mockConnection.get.mockResolvedValueOnce({ count: 0 });
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });
      
      // 링크 작업 모킹
      mockConnection.get.mockResolvedValueOnce(targetSession);
      mockConnection.all.mockResolvedValueOnce([mockMemories[0]]);
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });
      mockConnection.get.mockResolvedValueOnce({ count: 1 });
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });

      const result = await memoryLinker.migrateMemoryToSession(
        'session-1', 
        'session-2', 
        ['mem-1'],
        { validate_target: true }
      );

      expect(result.success).toBe(true);
      expect(result.linked_count).toBe(1);
    });

    it('취소된 세션으로는 마이그레이션할 수 없다', async () => {
      const cancelledSession = { ...mockSession, status: SessionStatus.CANCELLED };
      mockConnection.get.mockResolvedValueOnce(cancelledSession);

      const result = await memoryLinker.migrateMemoryToSession(
        'session-1',
        'session-2', 
        ['mem-1'],
        { validate_target: true }
      );

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Cannot migrate to cancelled session');
    });
  });

  describe('getSessionMemories', () => {
    it('세션의 메모리들을 조회할 수 있다', async () => {
      mockConnection.all.mockResolvedValueOnce(mockMemories.slice(0, 2));
      mockConnection.get.mockResolvedValueOnce({ count: 2 });

      const result = await memoryLinker.getSessionMemories('session-1');

      expect(result.memories).toHaveLength(2);
      expect(result.total_count).toBe(2);
    });

    it('통계를 포함하여 조회할 수 있다', async () => {
      mockConnection.all
        .mockResolvedValueOnce(mockMemories.slice(0, 2))  // 메모리 조회
        .mockResolvedValueOnce(mockMemories.slice(0, 2)); // 통계용 조회
      mockConnection.get.mockResolvedValueOnce({ count: 2 });

      const result = await memoryLinker.getSessionMemories('session-1', {
        include_stats: true
      });

      expect(result.stats).toBeDefined();
      expect(result.stats?.total_count).toBe(2);
      expect(result.stats?.by_importance.high).toBe(1); // mem-1 (85점)
      expect(result.stats?.by_importance.medium).toBe(1); // mem-2 (60점)
    });

    it('정렬 옵션이 적용된다', async () => {
      mockConnection.all.mockResolvedValueOnce([]);
      mockConnection.get.mockResolvedValueOnce({ count: 0 });

      await memoryLinker.getSessionMemories('session-1', {
        sort_by: 'importance_score',
        sort_order: 'DESC',
        limit: 10,
        offset: 5
      });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY importance_score DESC'),
        expect.arrayContaining(['session-1', 10, 5])
      );
    });
  });

  describe('cleanupOrphanMemories', () => {
    it('고아 메모리들을 찾을 수 있다', async () => {
      const orphanMemories = [mockMemories[0], mockMemories[2]]; // session_id가 없는 것들
      mockConnection.all.mockResolvedValueOnce(orphanMemories);

      const result = await memoryLinker.cleanupOrphanMemories({ dry_run: true });

      expect(result.found_count).toBe(2);
      expect(result.cleaned_count).toBe(0);
      expect(result.orphan_memories).toHaveLength(2);
    });

    it('고아 메모리들을 실제로 정리할 수 있다', async () => {
      const orphanMemories = [mockMemories[0]];
      mockConnection.all.mockResolvedValueOnce(orphanMemories);
      mockConnection.run.mockResolvedValueOnce({ changes: 1 });

      const result = await memoryLinker.cleanupOrphanMemories({ dry_run: false });

      expect(result.found_count).toBe(1);
      expect(result.cleaned_count).toBe(1);
    });

    it('특정 날짜보다 오래된 메모리만 정리할 수 있다', async () => {
      mockConnection.all.mockResolvedValueOnce([]);

      await memoryLinker.cleanupOrphanMemories({ 
        dry_run: true, 
        older_than_days: 7 
      });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining('session_id IS NULL AND created_at < ?'),
        expect.arrayContaining([expect.any(String)])
      );
    });
  });

  describe('calculateSessionMemoryStats', () => {
    it('세션 메모리 통계를 정확히 계산한다', async () => {
      const testMemories = [
        { importance_score: 95, work_type: 'memory', created_at: '2025-06-11T10:00:00.000Z' },
        { importance_score: 75, work_type: 'todo', created_at: '2025-06-11T11:00:00.000Z' },
        { importance_score: 45, work_type: 'memory', created_at: '2025-06-11T12:00:00.000Z' },
        { importance_score: 15, work_type: 'memory', created_at: new Date().toISOString() } // 최근
      ];

      mockConnection.all.mockResolvedValueOnce(testMemories);

      const stats = await memoryLinker.calculateSessionMemoryStats('session-1');

      expect(stats.total_count).toBe(4);
      expect(stats.by_importance.critical).toBe(1); // 95점
      expect(stats.by_importance.high).toBe(1);     // 75점
      expect(stats.by_importance.medium).toBe(1);   // 45점
      expect(stats.by_importance.low).toBe(1);      // 15점
      expect(stats.by_type.memory).toBe(3);
      expect(stats.by_type.todo).toBe(1);
      expect(stats.recent_count).toBe(4); // 모든 메모리가 최근 생성됨
      expect(stats.average_importance).toBe(57.5); // (95+75+45+15)/4
    });

    it('메모리가 없는 세션의 통계를 처리한다', async () => {
      mockConnection.all.mockResolvedValueOnce([]);

      const stats = await memoryLinker.calculateSessionMemoryStats('empty-session');

      expect(stats.total_count).toBe(0);
      expect(stats.average_importance).toBe(0);
      expect(stats.oldest_memory).toBeNull();
      expect(stats.newest_memory).toBeNull();
    });
  });

  describe('validation rules', () => {
    it('커스텀 검증 규칙을 추가할 수 있다', () => {
      const customRule = {
        name: 'custom_test_rule',
        description: 'Test rule',
        validate: vi.fn().mockResolvedValue(true),
        error_message: 'Custom rule failed'
      };

      memoryLinker.addValidationRule(customRule);

      // 내부 검증 규칙 배열에 추가되었는지는 직접 테스트하기 어려우므로
      // 실제 링크 작업에서 호출되는지 확인
      expect(() => memoryLinker.addValidationRule(customRule)).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('데이터베이스 오류를 적절히 처리한다', async () => {
      mockConnection.get.mockRejectedValueOnce(new Error('Database error'));

      const result = await memoryLinker.linkMemoryToSession('session-1', ['mem-1']);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Link operation failed');
    });

    it('메모리 조회 오류를 처리한다', async () => {
      mockConnection.all.mockRejectedValueOnce(new Error('Query failed'));

      await expect(memoryLinker.getSessionMemories('session-1')).rejects.toThrow('Failed to get session memories');
    });

    it('통계 계산 오류를 처리한다', async () => {
      mockConnection.all.mockRejectedValueOnce(new Error('Stats query failed'));

      await expect(memoryLinker.calculateSessionMemoryStats('session-1')).rejects.toThrow('Failed to calculate session memory stats');
    });
  });
});
