/**
 * SessionQueryManager 유닛 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionQueryManager } from '../../../src/session/SessionQueryManager.js';
import { SessionStatus, WorkSession } from '../../../src/types/session.js';

// 모의 데이터베이스 연결
const mockConnection = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
  prepare: vi.fn()
};

describe('SessionQueryManager', () => {
  let queryManager: SessionQueryManager;
  let mockSessions: WorkSession[];

  beforeEach(() => {
    vi.clearAllMocks();
    queryManager = new SessionQueryManager(mockConnection as any);

    // 테스트용 모의 세션 데이터
    mockSessions = [
      {
        session_id: 'session-1',
        project_name: 'Project A',
        project_path: '/path/a',
        git_repository: undefined,
        started_at: '2025-06-11T10:00:00.000Z',
        ended_at: undefined,
        last_activity_at: '2025-06-11T12:00:00.000Z',
        status: SessionStatus.ACTIVE,
        description: 'Active project session',
        auto_created: false,
        tags: ['frontend', 'react'],
        created_by: 'user-1',
        created_at: '2025-06-11T10:00:00.000Z',
        updated_at: '2025-06-11T12:00:00.000Z',
        activity_count: 5,
        memory_count: 10,
        total_work_time: 7200,
        project_normalized: 'project a'
      },
      {
        session_id: 'session-2',
        project_name: 'Project B',
        project_path: '/path/b',
        git_repository: 'https://github.com/user/project-b.git',
        started_at: '2025-06-10T09:00:00.000Z',
        ended_at: '2025-06-10T17:00:00.000Z',
        last_activity_at: '2025-06-10T17:00:00.000Z',
        status: SessionStatus.COMPLETED,
        description: 'Completed backend session',
        auto_created: false,
        tags: ['backend', 'api'],
        created_by: 'user-2',
        created_at: '2025-06-10T09:00:00.000Z',
        updated_at: '2025-06-10T17:00:00.000Z',
        activity_count: 12,
        memory_count: 25,
        total_work_time: 28800,
        project_normalized: 'project b'
      },
      {
        session_id: 'session-3',
        project_name: 'Project A',
        project_path: '/path/a',
        git_repository: undefined,
        started_at: '2025-06-09T14:00:00.000Z',
        ended_at: undefined,
        last_activity_at: '2025-06-09T16:00:00.000Z',
        status: SessionStatus.PAUSED,
        description: 'Paused session for Project A',
        auto_created: true,
        tags: ['frontend'],
        created_by: 'system',
        created_at: '2025-06-09T14:00:00.000Z',
        updated_at: '2025-06-09T16:00:00.000Z',
        activity_count: 3,
        memory_count: 7,
        total_work_time: 7200,
        project_normalized: 'project a'
      }
    ];
  });

  describe('getSessionById', () => {
    it('ID로 세션을 조회할 수 있다', async () => {
      mockConnection.get.mockResolvedValueOnce(mockSessions[0]);

      const result = await queryManager.getSessionById('session-1');

      expect(mockConnection.get).toHaveBeenCalledWith(
        'SELECT * FROM work_sessions WHERE session_id = ?',
        ['session-1']
      );
      expect(result).toEqual(mockSessions[0]);
    });

    it('존재하지 않는 ID에 대해 null을 반환한다', async () => {
      mockConnection.get.mockResolvedValueOnce(null);

      const result = await queryManager.getSessionById('nonexistent');

      expect(result).toBeNull();
    });

    it('메모리 포함 조회가 가능하다', async () => {
      const mockMemories = [
        { id: 'mem-1', session_id: 'session-1', content: 'Memory 1', importance_score: 80, created_at: '2025-06-11T11:00:00.000Z' },
        { id: 'mem-2', session_id: 'session-1', content: 'Memory 2', importance_score: 60, created_at: '2025-06-11T11:30:00.000Z' }
      ];

      mockConnection.get.mockResolvedValueOnce(mockSessions[0]);
      mockConnection.all.mockResolvedValueOnce(mockMemories);

      const result = await queryManager.getSessionById('session-1', true);

      expect(mockConnection.all).toHaveBeenCalledWith(
        'SELECT * FROM work_memories WHERE session_id = ? ORDER BY created_at DESC',
        ['session-1']
      );
      expect(result).toHaveProperty('memories');
      expect(result).toHaveProperty('memory_stats');
      expect((result as any).memories).toEqual(mockMemories);
    });
  });

  describe('getSessions', () => {
    it('모든 세션을 조회할 수 있다', async () => {
      mockConnection.get.mockResolvedValueOnce({ count: 3 });
      mockConnection.all.mockResolvedValueOnce(mockSessions);

      const result = await queryManager.getSessions();

      expect(result.data).toEqual(mockSessions);
      expect(result.total_count).toBe(3);
      expect(result.has_more).toBe(false);
    });

    it('상태별 필터링이 가능하다', async () => {
      const activeSessions = mockSessions.filter(s => s.status === SessionStatus.ACTIVE);
      
      mockConnection.get.mockResolvedValueOnce({ count: 1 });
      mockConnection.all.mockResolvedValueOnce(activeSessions);

      const result = await queryManager.getSessions({
        status: SessionStatus.ACTIVE
      });

      expect(mockConnection.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ?'),
        expect.arrayContaining([SessionStatus.ACTIVE])
      );
      expect(result.data).toEqual(activeSessions);
    });

    it('복수 상태 필터링이 가능하다', async () => {
      const activeOrPausedSessions = mockSessions.filter(
        s => s.status === SessionStatus.ACTIVE || s.status === SessionStatus.PAUSED
      );
      
      mockConnection.get.mockResolvedValueOnce({ count: 2 });
      mockConnection.all.mockResolvedValueOnce(activeOrPausedSessions);

      const result = await queryManager.getSessions({
        status: [SessionStatus.ACTIVE, SessionStatus.PAUSED]
      });

      expect(mockConnection.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status IN (?,?)'),
        expect.arrayContaining([SessionStatus.ACTIVE, SessionStatus.PAUSED])
      );
    });

    it('프로젝트명 필터링이 가능하다', async () => {
      const projectASessions = mockSessions.filter(s => s.project_name === 'Project A');
      
      mockConnection.get.mockResolvedValueOnce({ count: 2 });
      mockConnection.all.mockResolvedValueOnce(projectASessions);

      const result = await queryManager.getSessions({
        project_name: 'Project A'
      });

      expect(mockConnection.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE project_name = ?'),
        expect.arrayContaining(['Project A'])
      );
    });

    it('페이지네이션이 작동한다', async () => {
      mockConnection.get.mockResolvedValueOnce({ count: 10 });
      mockConnection.all.mockResolvedValueOnce(mockSessions.slice(0, 2));

      const result = await queryManager.getSessions({
        limit: 2,
        offset: 0
      });

      expect(result.has_more).toBe(true);
      expect(result.next_offset).toBe(2);
    });

    it('정렬이 작동한다', async () => {
      mockConnection.get.mockResolvedValueOnce({ count: 3 });
      mockConnection.all.mockResolvedValueOnce(mockSessions);

      await queryManager.getSessions({
        sort_by: 'created_at',
        sort_order: 'ASC'
      });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at ASC'),
        expect.any(Array)
      );
    });
  });

  describe('searchSessions', () => {
    it('검색 쿼리로 세션을 찾을 수 있다', async () => {
      const searchResults = mockSessions.filter(s => 
        s.project_name.includes('Project') || 
        s.description?.includes('Active')
      );

      mockConnection.get.mockResolvedValueOnce({ count: searchResults.length });
      mockConnection.all.mockResolvedValueOnce(searchResults);

      const result = await queryManager.searchSessions({
        search_query: 'Active',
        search_fields: ['project_name', 'description']
      });

      expect(mockConnection.get).toHaveBeenCalledWith(
        expect.stringContaining('project_name LIKE ? OR description LIKE ?'),
        expect.arrayContaining(['%Active%', '%Active%'])
      );
    });

    it('메모리 포함 검색이 가능하다', async () => {
      mockConnection.get.mockResolvedValueOnce({ count: 1 });
      mockConnection.all
        .mockResolvedValueOnce([mockSessions[0]])
        .mockResolvedValueOnce([]); // 메모리 목록

      const result = await queryManager.searchSessions({
        search_query: 'Project A',
        include_memories: true
      });

      expect(result.data[0]).toHaveProperty('memories');
      expect(result.data[0]).toHaveProperty('memory_stats');
    });
  });

  describe('getActiveSessions', () => {
    it('활성 세션들을 조회할 수 있다', async () => {
      const activeSessions = mockSessions.filter(
        s => s.status === SessionStatus.ACTIVE || s.status === SessionStatus.PAUSED
      );

      mockConnection.all.mockResolvedValueOnce(activeSessions);

      const result = await queryManager.getActiveSessions();

      expect(mockConnection.all).toHaveBeenCalledWith(
        'SELECT * FROM work_sessions WHERE status IN (?, ?) ORDER BY last_activity_at DESC',
        [SessionStatus.ACTIVE, SessionStatus.PAUSED]
      );
      expect(result).toEqual(activeSessions);
    });
  });

  describe('getSessionsByProject', () => {
    it('프로젝트별 세션을 조회할 수 있다', async () => {
      const projectASessions = mockSessions.filter(s => s.project_name === 'Project A');
      
      mockConnection.get.mockResolvedValueOnce({ count: 2 });
      mockConnection.all.mockResolvedValueOnce(projectASessions);

      const result = await queryManager.getSessionsByProject('Project A');

      expect(result.data).toEqual(projectASessions);
    });
  });

  describe('getSessionStats', () => {
    it('세션 통계를 조회할 수 있다', async () => {
      const mockStats = {
        total_sessions: 3,
        active_sessions: 1,
        completed_sessions: 1,
        total_work_time: 43200,
        average_session_duration: 14400
      };

      const mockStatusCounts = [
        { status: SessionStatus.ACTIVE, count: 1 },
        { status: SessionStatus.PAUSED, count: 1 },
        { status: SessionStatus.COMPLETED, count: 1 }
      ];

      const mockTopProject = { project_name: 'Project A', session_count: 2 };

      mockConnection.get
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockTopProject);
      mockConnection.all.mockResolvedValueOnce(mockStatusCounts);

      const result = await queryManager.getSessionStats();

      expect(result.total_sessions).toBe(3);
      expect(result.active_sessions).toBe(1);
      expect(result.completed_sessions).toBe(1);
      expect(result.most_active_project).toBe('Project A');
      expect(result.session_by_status[SessionStatus.ACTIVE]).toBe(1);
    });

    it('필터를 적용한 통계 조회가 가능하다', async () => {
      mockConnection.get.mockResolvedValue({ total_sessions: 1 });
      mockConnection.all.mockResolvedValue([]);

      await queryManager.getSessionStats({
        status: SessionStatus.ACTIVE,
        project_name: 'Project A'
      });

      expect(mockConnection.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ? AND project_name = ?'),
        expect.arrayContaining([SessionStatus.ACTIVE, 'Project A'])
      );
    });
  });

  describe('getRecentSessions', () => {
    it('최근 세션들을 조회할 수 있다', async () => {
      const recentSessions = mockSessions.slice(0, 2);
      
      mockConnection.all.mockResolvedValueOnce(recentSessions);

      const result = await queryManager.getRecentSessions(2);

      expect(mockConnection.all).toHaveBeenCalledWith(
        'SELECT * FROM work_sessions ORDER BY last_activity_at DESC LIMIT ?',
        [2]
      );
      expect(result).toEqual(recentSessions);
    });
  });

  describe('getSessionSummaries', () => {
    it('세션 요약 정보를 조회할 수 있다', async () => {
      const mockSummaries = mockSessions.map(s => ({
        session_id: s.session_id,
        project_name: s.project_name,
        status: s.status,
        memory_count: s.memory_count,
        duration: s.total_work_time,
        last_activity: s.last_activity_at
      }));

      mockConnection.all.mockResolvedValueOnce(mockSummaries);

      const result = await queryManager.getSessionSummaries();

      expect(result).toEqual(mockSummaries);
    });

    it('필터를 적용한 요약 조회가 가능하다', async () => {
      mockConnection.all.mockResolvedValueOnce([]);

      await queryManager.getSessionSummaries({
        status: SessionStatus.ACTIVE,
        memory_count_range: { min: 5, max: 20 }
      });

      expect(mockConnection.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = ? AND memory_count >= ? AND memory_count <= ?'),
        expect.arrayContaining([SessionStatus.ACTIVE, 5, 20])
      );
    });
  });

  describe('error handling', () => {
    it('데이터베이스 오류를 적절히 처리한다', async () => {
      mockConnection.get.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(queryManager.getSessionById('session-1')).rejects.toThrow('Failed to get session by ID');
    });

    it('검색 오류를 적절히 처리한다', async () => {
      mockConnection.get.mockRejectedValueOnce(new Error('Search failed'));

      await expect(queryManager.searchSessions({ search_query: 'test' })).rejects.toThrow('Failed to search sessions');
    });

    it('통계 조회 오류를 적절히 처리한다', async () => {
      mockConnection.get.mockRejectedValueOnce(new Error('Stats query failed'));

      await expect(queryManager.getSessionStats()).rejects.toThrow('Failed to get session stats');
    });
  });
});
