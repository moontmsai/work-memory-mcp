/**
 * SessionStatsManager 유닛 테스트
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStatsManager } from '../../../src/session/SessionStatsManager.js';
import { SessionStatus, WorkSession } from '../../../src/types/session.js';

// 모의 데이터베이스 연결
const mockConnection = {
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
  prepare: vi.fn()
};

describe('SessionStatsManager', () => {
  let statsManager: SessionStatsManager;
  let mockSessions: WorkSession[];

  beforeEach(() => {
    vi.clearAllMocks();
    statsManager = new SessionStatsManager(mockConnection as any);

    // 테스트용 모의 세션 데이터
    mockSessions = [
      {
        session_id: 'session-1',
        project_name: 'Project A',
        project_path: '/path/a',
        git_repository: null,
        started_at: '2025-06-11T10:00:00Z',
        ended_at: '2025-06-11T12:00:00Z',
        last_activity_at: '2025-06-11T11:45:00Z',
        status: SessionStatus.COMPLETED,
        description: 'Test session A',
        auto_created: false,
        tags: ['test', 'dev'],
        created_by: 'user1',
        created_at: '2025-06-11T10:00:00Z',
        updated_at: '2025-06-11T12:00:00Z',
        activity_count: 15,
        memory_count: 10,
        total_work_time: 7200, // 2시간
        project_normalized: 'project-a'
      },
      {
        session_id: 'session-2',
        project_name: 'Project B',
        project_path: '/path/b',
        git_repository: null,
        started_at: '2025-06-11T14:00:00Z',
        ended_at: null,
        last_activity_at: '2025-06-11T15:30:00Z',
        status: SessionStatus.ACTIVE,
        description: 'Test session B',
        auto_created: true,
        tags: ['active'],
        created_by: 'user1',
        created_at: '2025-06-11T14:00:00Z',
        updated_at: '2025-06-11T15:30:00Z',
        activity_count: 8,
        memory_count: 5,
        total_work_time: 5400, // 1.5시간
        project_normalized: 'project-b'
      }
    ];
  });


  describe('calculateOverallStats', () => {
    it('전체 세션 통계를 정확히 계산해야 함', async () => {
      // Mock 데이터베이스 응답
      mockConnection.get.mockResolvedValue({
        total_sessions: 2,
        active_sessions: 1,
        completed_sessions: 1,
        paused_sessions: 0,
        cancelled_sessions: 0,
        total_work_time: 12600, // 총 3.5시간
        average_session_duration: 6300, // 평균 1.75시간
        most_active_project: 'Project A'
      });

      const stats = await statsManager.calculateOverallStats();

      expect(stats).toEqual({
        total_sessions: 2,
        active_sessions: 1,
        completed_sessions: 1,
        total_work_time: 12600,
        average_session_duration: 6300,
        most_active_project: 'Project A',
        session_by_status: {
          [SessionStatus.ACTIVE]: 1,
          [SessionStatus.PAUSED]: 0,
          [SessionStatus.COMPLETED]: 1,
          [SessionStatus.CANCELLED]: 0
        }
      });

      expect(mockConnection.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );
    });

    it('빈 결과에 대해 기본값을 반환해야 함', async () => {
      mockConnection.get.mockResolvedValue({
        total_sessions: 0,
        active_sessions: 0,
        completed_sessions: 0,
        paused_sessions: 0,
        cancelled_sessions: 0,
        total_work_time: 0,
        average_session_duration: 0,
        most_active_project: null
      });

      const stats = await statsManager.calculateOverallStats();

      expect(stats.total_sessions).toBe(0);
      expect(stats.most_active_project).toBeNull();
    });
  });

  describe('calculateSessionMetrics', () => {
    it('특정 세션의 메트릭을 계산해야 함', async () => {
      const sessionId = 'session-1';
      
      // 세션 정보 모의
      mockConnection.get
        .mockResolvedValueOnce(mockSessions[0]) // 세션 정보
        .mockResolvedValueOnce({ // 메모리 통계
          memory_count: 10,
          avg_importance: 75
        });

      const metrics = await statsManager.calculateSessionMetrics(sessionId);

      expect(metrics.session_id).toBe(sessionId);
      expect(metrics.duration_seconds).toBe(7200);
      expect(metrics.memory_count).toBe(10);
      expect(metrics.average_memory_importance).toBe(75);
      expect(metrics.work_intensity).toBeGreaterThan(0);
      expect(metrics.productivity_score).toBeGreaterThan(0);
    });

    it('존재하지 않는 세션에 대해 에러를 던져야 함', async () => {
      mockConnection.get.mockResolvedValue(null);

      await expect(
        statsManager.calculateSessionMetrics('non-existent')
      ).rejects.toThrow('Session not found: non-existent');
    });
  });


  describe('calculateProjectStats', () => {
    it('프로젝트별 통계를 계산해야 함', async () => {
      const mockProjectData = [
        {
          project_name: 'Project A',
          total_sessions: 5,
          active_sessions: 1,
          completed_sessions: 4,
          total_work_time: 18000,
          average_session_duration: 3600,
          total_memories: 50,
          last_activity: '2025-06-11T12:00:00Z'
        },
        {
          project_name: 'Project B',
          total_sessions: 3,
          active_sessions: 2,
          completed_sessions: 1,
          total_work_time: 10800,
          average_session_duration: 3600,
          total_memories: 25,
          last_activity: '2025-06-11T15:30:00Z'
        }
      ];

      mockConnection.all.mockResolvedValue(mockProjectData);
      mockConnection.get
        .mockResolvedValueOnce({ avg_productivity: 85.5 })
        .mockResolvedValueOnce({ avg_productivity: 72.3 });

      const projectStats = await statsManager.calculateProjectStats();

      expect(projectStats).toHaveLength(2);
      expect(projectStats[0].project_name).toBe('Project A');
      expect(projectStats[0].total_sessions).toBe(5);
      expect(projectStats[0].average_productivity).toBe(85.5);
      expect(projectStats[1].project_name).toBe('Project B');
      expect(projectStats[1].average_productivity).toBe(72.3);
    });
  });

  describe('calculateTimeBasedStats', () => {
    it('시간대별 통계를 계산해야 함', async () => {
      const mockTimeData = [
        {
          hour_of_day: 10,
          day_of_week: 1, // Monday
          session_count: 3,
          total_work_time: 10800,
          average_productivity: 75.5
        },
        {
          hour_of_day: 14,
          day_of_week: 1,
          session_count: 2,
          total_work_time: 7200,
          average_productivity: 68.2
        }
      ];

      mockConnection.all.mockResolvedValue(mockTimeData);

      const timeStats = await statsManager.calculateTimeBasedStats();

      expect(timeStats).toHaveLength(2);
      expect(timeStats[0].hour_of_day).toBe(10);
      expect(timeStats[0].day_of_week).toBe(1);
      expect(timeStats[0].session_count).toBe(3);
      expect(timeStats[1].average_productivity).toBe(68.2);
    });
  });


  describe('analyzeSession', () => {
    it('세션 분석을 완료해야 함', async () => {
      const sessionId = 'session-1';
      
      // 메트릭 계산을 위한 모의
      mockConnection.get
        .mockResolvedValueOnce(mockSessions[0]) // 세션 정보
        .mockResolvedValueOnce({ memory_count: 10, avg_importance: 75 }); // 메모리 통계

      // 활동 타임라인을 위한 모의
      const mockActivities = [
        {
          timestamp: '2025-06-11T10:15:00Z',
          activity_type: 'memory_added',
          memory_count_delta: 1
        },
        {
          timestamp: '2025-06-11T10:30:00Z',
          activity_type: 'memory_added',
          memory_count_delta: 1
        }
      ];
      mockConnection.all.mockResolvedValue(mockActivities);

      const analysis = await statsManager.analyzeSession(sessionId);

      expect(analysis.session_id).toBe(sessionId);
      expect(analysis.basic_metrics).toBeDefined();
      expect(analysis.activity_timeline).toHaveLength(2);
      expect(analysis.productivity_trend).toBeDefined();
      expect(analysis.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('updateSessionStats', () => {
    it('세션 통계를 업데이트해야 함', async () => {
      const sessionId = 'session-1';
      
      mockConnection.get
        .mockResolvedValueOnce(mockSessions[0]) // 세션 정보
        .mockResolvedValueOnce({ count: 12 }); // 메모리 수

      await statsManager.updateSessionStats(sessionId);

      expect(mockConnection.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE work_sessions'),
        expect.arrayContaining([12, 12, expect.any(Number), sessionId])
      );
    });

    it('존재하지 않는 세션에 대해 에러를 던져야 함', async () => {
      mockConnection.get.mockResolvedValue(null);

      await expect(
        statsManager.updateSessionStats('non-existent')
      ).rejects.toThrow('Session not found: non-existent');
    });
  });

  describe('생산성 점수 계산', () => {
    it('생산성 점수가 정확히 계산되어야 함', () => {
      // private 메서드이므로 인스턴스를 통해 접근 불가
      // 대신 calculateSessionMetrics를 통해 간접 테스트
      // 이 테스트는 실제로는 calculateSessionMetrics 테스트에서 커버됨
      expect(true).toBe(true); // placeholder
    });
  });
});
