/**
 * SessionStatsManager - 세션 통계 및 분석 관리 클래스
 * Session Statistics & Analytics 기능 제공
 */

import { DatabaseConnection } from '../database/connection.js';
import { 
  WorkSession, 
  SessionStatus,
  SessionStats,
  SessionMemoryStats
} from '../types/session.js';

// 세션 메트릭 인터페이스
export interface SessionMetrics {
  session_id: string;
  duration_seconds: number;
  activity_count: number;
  memory_count: number;
  average_memory_importance: number;
  work_intensity: number; // 분당 활동 수
  productivity_score: number; // 0-100 점수
  last_activity_gap: number; // 마지막 활동으로부터 경과 시간(초)
}

// 프로젝트별 통계
export interface ProjectStats {
  project_name: string;
  total_sessions: number;
  active_sessions: number;
  completed_sessions: number;
  total_work_time: number;
  average_session_duration: number;
  total_memories: number;
  average_productivity: number;
  last_activity: string;
}

// 시간대별 활동 통계
export interface TimeBasedStats {
  hour_of_day: number; // 0-23
  day_of_week: number; // 0-6 (0=Sunday)
  session_count: number;
  total_work_time: number;
  average_productivity: number;
}

// 상세 세션 분석
export interface SessionAnalysis {
  session_id: string;
  basic_metrics: SessionMetrics;
  activity_timeline: ActivityPoint[];
  productivity_trend: ProductivityPoint[];
  recommendations: string[];
}

// 활동 포인트 (시간대별 활동)
export interface ActivityPoint {
  timestamp: string;
  activity_type: string;
  memory_count_delta: number;
  cumulative_memories: number;
}

// 생산성 포인트
export interface ProductivityPoint {
  timestamp: string;
  productivity_score: number;
  work_intensity: number;
  memory_quality_avg: number;
}

// 통계 집계 옵션
export interface StatsAggregationOptions {
  date_range?: {
    start: string;
    end: string;
  };
  project_filter?: string[];
  status_filter?: SessionStatus[];
  created_by_filter?: string[];
  include_inactive?: boolean;
  group_by?: 'project' | 'day' | 'week' | 'month' | 'user';
}

export class SessionStatsManager {
  constructor(private db: DatabaseConnection) {}

  /**
   * 전체 세션 통계 계산
   */
  async calculateOverallStats(options?: StatsAggregationOptions): Promise<SessionStats> {
    const whereClause = this.buildWhereClause(options);
    
    const query = `
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
        COUNT(CASE WHEN status = 'paused' THEN 1 END) as paused_sessions,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_sessions,
        COALESCE(SUM(total_work_time), 0) as total_work_time,
        COALESCE(AVG(total_work_time), 0) as average_session_duration,
        (
          SELECT project_name 
          FROM work_sessions 
          ${whereClause}
          GROUP BY project_name 
          ORDER BY COUNT(*) DESC 
          LIMIT 1
        ) as most_active_project
      FROM work_sessions 
      ${whereClause}
    `;

    const result = await this.db.get(query);
    
    return {
      total_sessions: result.total_sessions || 0,
      active_sessions: result.active_sessions || 0,
      completed_sessions: result.completed_sessions || 0,
      total_work_time: result.total_work_time || 0,
      average_session_duration: result.average_session_duration || 0,
      most_active_project: result.most_active_project || null,
      session_by_status: {
        [SessionStatus.ACTIVE]: result.active_sessions || 0,
        [SessionStatus.PAUSED]: result.paused_sessions || 0,
        [SessionStatus.COMPLETED]: result.completed_sessions || 0,
        [SessionStatus.CANCELLED]: result.cancelled_sessions || 0
      }
    };
  }


  /**
   * 특정 세션의 메트릭 계산
   */
  async calculateSessionMetrics(sessionId: string): Promise<SessionMetrics> {
    const session = await this.db.get(
      'SELECT * FROM work_sessions WHERE session_id = ?',
      [sessionId]
    );

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // 메모리 통계 계산
    const memoryStats = await this.db.get(`
      SELECT 
        COUNT(*) as memory_count,
        COALESCE(AVG(importance_score), 0) as avg_importance
      FROM work_memories 
      WHERE session_id = ?
    `, [sessionId]);

    // 활동 강도 계산 (분당 활동 수)
    const durationMinutes = session.total_work_time / 60;
    const workIntensity = durationMinutes > 0 ? session.activity_count / durationMinutes : 0;

    // 생산성 점수 계산 (메모리 수 + 평균 중요도 + 활동 강도 기반)
    const productivityScore = this.calculateProductivityScore(
      memoryStats.memory_count,
      memoryStats.avg_importance,
      workIntensity
    );

    // 마지막 활동으로부터 경과 시간
    const lastActivityGap = session.last_activity_at 
      ? (Date.now() - new Date(session.last_activity_at).getTime()) / 1000
      : 0;

    return {
      session_id: sessionId,
      duration_seconds: session.total_work_time,
      activity_count: session.activity_count,
      memory_count: memoryStats.memory_count,
      average_memory_importance: memoryStats.avg_importance,
      work_intensity: workIntensity,
      productivity_score: productivityScore,
      last_activity_gap: lastActivityGap
    };
  }

  /**
   * 프로젝트별 통계 계산
   */
  async calculateProjectStats(options?: StatsAggregationOptions): Promise<ProjectStats[]> {
    const whereClause = this.buildWhereClause(options);
    
    const query = `
      SELECT 
        project_name,
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
        COALESCE(SUM(total_work_time), 0) as total_work_time,
        COALESCE(AVG(total_work_time), 0) as average_session_duration,
        COALESCE(SUM(memory_count), 0) as total_memories,
        MAX(last_activity_at) as last_activity
      FROM work_sessions 
      ${whereClause}
      GROUP BY project_name
      ORDER BY total_sessions DESC
    `;

    const results = await this.db.all(query);
    
    return Promise.all(results.map(async (row: any) => {
      // 각 프로젝트의 평균 생산성 계산
      const productivityQuery = `
        SELECT AVG(
          CASE 
            WHEN total_work_time > 0 
            THEN (memory_count * 10 + activity_count) / (total_work_time / 3600.0)
            ELSE 0 
          END
        ) as avg_productivity
        FROM work_sessions 
        WHERE project_name = ? AND status != 'cancelled'
      `;
      
      const productivityResult = await this.db.get(productivityQuery, [row.project_name]);
      
      return {
        project_name: row.project_name,
        total_sessions: row.total_sessions,
        active_sessions: row.active_sessions,
        completed_sessions: row.completed_sessions,
        total_work_time: row.total_work_time,
        average_session_duration: row.average_session_duration,
        total_memories: row.total_memories,
        average_productivity: productivityResult?.avg_productivity || 0,
        last_activity: row.last_activity || ''
      };
    }));
  }


  /**
   * 시간대별 활동 통계 계산
   */
  async calculateTimeBasedStats(options?: StatsAggregationOptions): Promise<TimeBasedStats[]> {
    const whereClause = this.buildWhereClause(options);
    
    const query = `
      SELECT 
        CAST(strftime('%H', started_at) AS INTEGER) as hour_of_day,
        CAST(strftime('%w', started_at) AS INTEGER) as day_of_week,
        COUNT(*) as session_count,
        COALESCE(SUM(total_work_time), 0) as total_work_time,
        COALESCE(AVG(
          CASE 
            WHEN total_work_time > 0 
            THEN (memory_count * 10 + activity_count) / (total_work_time / 3600.0)
            ELSE 0 
          END
        ), 0) as average_productivity
      FROM work_sessions 
      ${whereClause}
      GROUP BY hour_of_day, day_of_week
      ORDER BY day_of_week, hour_of_day
    `;

    const results = await this.db.all(query);
    
    return results.map((row: any) => ({
      hour_of_day: row.hour_of_day,
      day_of_week: row.day_of_week,
      session_count: row.session_count,
      total_work_time: row.total_work_time,
      average_productivity: row.average_productivity
    }));
  }

  /**
   * 상세 세션 분석
   */
  async analyzeSession(sessionId: string): Promise<SessionAnalysis> {
    const metrics = await this.calculateSessionMetrics(sessionId);
    const activityTimeline = await this.getActivityTimeline(sessionId);
    const productivityTrend = await this.getProductivityTrend(sessionId);
    const recommendations = this.generateRecommendations(metrics, activityTimeline);

    return {
      session_id: sessionId,
      basic_metrics: metrics,
      activity_timeline: activityTimeline,
      productivity_trend: productivityTrend,
      recommendations
    };
  }

  /**
   * 세션의 활동 타임라인 조회
   */
  private async getActivityTimeline(sessionId: string): Promise<ActivityPoint[]> {
    const query = `
      SELECT 
        created_at as timestamp,
        'memory_added' as activity_type,
        1 as memory_count_delta
      FROM work_memories 
      WHERE session_id = ?
      ORDER BY created_at ASC
    `;

    const results = await this.db.all(query, [sessionId]);
    
    let cumulativeMemories = 0;
    return results.map((row: any) => {
      cumulativeMemories += row.memory_count_delta;
      return {
        timestamp: row.timestamp,
        activity_type: row.activity_type,
        memory_count_delta: row.memory_count_delta,
        cumulative_memories: cumulativeMemories
      };
    });
  }


  /**
   * 세션의 생산성 트렌드 계산
   */
  private async getProductivityTrend(sessionId: string): Promise<ProductivityPoint[]> {
    // 시간대별 메모리 생성 패턴 분석
    const query = `
      SELECT 
        datetime(created_at) as timestamp,
        importance_score
      FROM work_memories 
      WHERE session_id = ?
      ORDER BY created_at ASC
    `;

    const results = await this.db.all(query, [sessionId]);
    
    // 30분 단위로 그룹화하여 생산성 점수 계산
    const grouped = this.groupByTimeWindow(results, 30); // 30분 윈도우
    
    return grouped.map(group => {
      const memoryCount = group.items.length;
      const avgImportance = group.items.reduce((sum, item) => sum + item.importance_score, 0) / memoryCount;
      const workIntensity = memoryCount / 0.5; // 30분 = 0.5시간
      const productivityScore = this.calculateProductivityScore(memoryCount, avgImportance, workIntensity);
      
      return {
        timestamp: group.timestamp,
        productivity_score: productivityScore,
        work_intensity: workIntensity,
        memory_quality_avg: avgImportance
      };
    });
  }

  /**
   * 생산성 점수 계산 로직
   */
  private calculateProductivityScore(memoryCount: number, avgImportance: number, workIntensity: number): number {
    // 메모리 수 (0-40점)
    const memoryScore = Math.min(memoryCount * 2, 40);
    
    // 평균 중요도 (0-30점)
    const importanceScore = (avgImportance / 100) * 30;
    
    // 작업 강도 (0-30점)
    const intensityScore = Math.min(workIntensity * 5, 30);
    
    return Math.round(memoryScore + importanceScore + intensityScore);
  }

  /**
   * 추천사항 생성
   */
  private generateRecommendations(metrics: SessionMetrics, timeline: ActivityPoint[]): string[] {
    const recommendations: string[] = [];
    
    // 생산성 기반 추천
    if (metrics.productivity_score < 30) {
      recommendations.push("생산성이 낮습니다. 더 자주 메모리를 기록하거나 중요도를 높여보세요.");
    }
    
    // 활동 패턴 기반 추천
    if (metrics.work_intensity < 1) {
      recommendations.push("작업 강도가 낮습니다. 더 집중적으로 작업해보세요.");
    }
    
    // 세션 길이 기반 추천
    if (metrics.duration_seconds > 4 * 3600) { // 4시간 이상
      recommendations.push("긴 세션입니다. 중간에 휴식을 취하는 것을 고려해보세요.");
    }
    
    // 메모리 품질 기반 추천
    if (metrics.average_memory_importance < 50) {
      recommendations.push("메모리의 중요도가 낮습니다. 더 중요한 내용을 기록해보세요.");
    }
    
    return recommendations;
  }


  /**
   * 실시간 통계 업데이트
   */
  async updateSessionStats(sessionId: string): Promise<void> {
    const session = await this.db.get(
      'SELECT * FROM work_sessions WHERE session_id = ?',
      [sessionId]
    );

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // 메모리 수 업데이트
    const memoryCount = await this.db.get(
      'SELECT COUNT(*) as count FROM work_memories WHERE session_id = ?',
      [sessionId]
    );

    // 활동 수 계산 (메모리 생성 이벤트 기반)
    const activityCount = memoryCount.count;

    // 총 작업 시간 계산
    const totalWorkTime = session.status === SessionStatus.ACTIVE 
      ? Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)
      : session.total_work_time;

    // 세션 통계 업데이트
    await this.db.run(`
      UPDATE work_sessions 
      SET 
        memory_count = ?,
        activity_count = ?,
        total_work_time = ?,
        last_activity_at = datetime('now'),
        updated_at = datetime('now')
      WHERE session_id = ?
    `, [memoryCount.count, activityCount, totalWorkTime, sessionId]);
  }

  /**
   * WHERE 절 구성 헬퍼
   */
  private buildWhereClause(options?: StatsAggregationOptions): string {
    if (!options) return 'WHERE 1=1';
    
    const conditions: string[] = ['1=1'];
    
    if (options.date_range) {
      if (options.date_range.start) {
        conditions.push(`started_at >= '${options.date_range.start}'`);
      }
      if (options.date_range.end) {
        conditions.push(`started_at <= '${options.date_range.end}'`);
      }
    }
    
    if (options.project_filter && options.project_filter.length > 0) {
      const projects = options.project_filter.map(p => `'${p}'`).join(',');
      conditions.push(`project_name IN (${projects})`);
    }
    
    if (options.status_filter && options.status_filter.length > 0) {
      const statuses = options.status_filter.map(s => `'${s}'`).join(',');
      conditions.push(`status IN (${statuses})`);
    }
    
    if (options.created_by_filter && options.created_by_filter.length > 0) {
      const users = options.created_by_filter.map(u => `'${u}'`).join(',');
      conditions.push(`created_by IN (${users})`);
    }
    
    if (!options.include_inactive) {
      conditions.push(`status != 'cancelled'`);
    }
    
    return `WHERE ${conditions.join(' AND ')}`;
  }

  /**
   * 시간 윈도우별 그룹화 헬퍼
   */
  private groupByTimeWindow(items: any[], windowMinutes: number): { timestamp: string; items: any[] }[] {
    if (items.length === 0) return [];
    
    const groups: { timestamp: string; items: any[] }[] = [];
    const windowMs = windowMinutes * 60 * 1000;
    
    // 첫 번째 아이템의 시간을 기준으로 윈도우 시작
    const firstTime = new Date(items[0].timestamp).getTime();
    let currentWindowStart = firstTime;
    let currentGroup: any[] = [];
    
    for (const item of items) {
      const itemTime = new Date(item.timestamp).getTime();
      
      // 현재 윈도우를 벗어나면 새 그룹 시작
      if (itemTime >= currentWindowStart + windowMs) {
        if (currentGroup.length > 0) {
          groups.push({
            timestamp: new Date(currentWindowStart).toISOString(),
            items: [...currentGroup]
          });
        }
        
        currentWindowStart = Math.floor((itemTime - firstTime) / windowMs) * windowMs + firstTime;
        currentGroup = [];
      }
      
      currentGroup.push(item);
    }
    
    // 마지막 그룹 추가
    if (currentGroup.length > 0) {
      groups.push({
        timestamp: new Date(currentWindowStart).toISOString(),
        items: currentGroup
      });
    }
    
    return groups;
  }
}
