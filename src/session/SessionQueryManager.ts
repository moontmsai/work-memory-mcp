/**
 * SessionQueryManager - 세션 조회, 필터링, 검색 관리 클래스
 */

import { DatabaseConnection } from '../database/connection.js';
import { 
  WorkSession, 
  SessionQueryOptions,
  SessionStatus,
  SessionSummary,
  SessionWithMemories,
  SessionStats
} from '../types/session.js';

export interface QueryResult<T> {
  data: T[];
  total_count: number;
  has_more: boolean;
  next_offset?: number;
}

export interface SessionSearchOptions extends SessionQueryOptions {
  search_query?: string;
  search_fields?: ('project_name' | 'description' | 'tags')[];
  include_memories?: boolean;
  include_stats?: boolean;
}

export interface SessionFilter {
  status?: SessionStatus | SessionStatus[];
  project_name?: string | string[];
  created_by?: string | string[];
  date_range?: {
    start?: string;
    end?: string;
    field?: 'started_at' | 'created_at' | 'last_activity_at';
  };
  memory_count_range?: {
    min?: number;
    max?: number;
  };
  activity_count_range?: {
    min?: number;
    max?: number;
  };
  tags?: string | string[];
  auto_created?: boolean;
}

export class SessionQueryManager {
  private connection: DatabaseConnection;

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
  }

  /**
   * 세션 ID로 단일 세션 조회
   */
  async getSessionById(sessionId: string, includeMemories: boolean = false): Promise<WorkSession | SessionWithMemories | null> {
    try {
      const session = await this.connection.get(
        'SELECT * FROM work_sessions WHERE session_id = ?',
        [sessionId]
      );

      if (!session) {
        return null;
      }

      if (includeMemories) {
        const memories = await this.connection.all(
          'SELECT * FROM work_memories WHERE session_id = ?  ORDER BY created_at DESC',
          [sessionId]
        );

        const memoryStats = this.calculateMemoryStats(memories);

        return {
          ...session,
          memories,
          memory_stats: memoryStats
        } as SessionWithMemories;
      }

      return session as WorkSession;
    } catch (error) {
      throw new Error(`Failed to get session by ID: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 복수 세션 조회 (기본 필터링)
   */
  async getSessions(options: SessionQueryOptions = {}): Promise<QueryResult<WorkSession>> {
    try {
      const { whereClause, params } = this.buildWhereClause(options);
      const { orderClause } = this.buildOrderClause(options);
      const { limitClause, offsetClause } = this.buildPaginationClause(options);

      // 총 개수 조회
      const countQuery = `SELECT COUNT(*) as count FROM work_sessions ${whereClause}`;
      const countResult = await this.connection.get(countQuery, params);
      const totalCount = countResult?.count || 0;

      // 데이터 조회
      const dataQuery = `
        SELECT * FROM work_sessions 
        ${whereClause} 
        ${orderClause} 
        ${limitClause} 
        ${offsetClause}
      `;
      
      const sessions = await this.connection.all(dataQuery, params);

      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const hasMore = offset + sessions.length < totalCount;
      const nextOffset = hasMore ? offset + sessions.length : undefined;

      return {
        data: sessions as WorkSession[],
        total_count: totalCount,
        has_more: hasMore,
        next_offset: nextOffset
      };
    } catch (error) {
      throw new Error(`Failed to get sessions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 고급 세션 검색
   */
  async searchSessions(options: SessionSearchOptions = {}): Promise<QueryResult<WorkSession | SessionWithMemories>> {
    try {
      const { whereClause, params } = this.buildAdvancedWhereClause(options);
      const { orderClause } = this.buildOrderClause(options);
      const { limitClause, offsetClause } = this.buildPaginationClause(options);

      // 총 개수 조회
      const countQuery = `SELECT COUNT(*) as count FROM work_sessions ${whereClause}`;
      const countResult = await this.connection.get(countQuery, params);
      const totalCount = countResult?.count || 0;

      // 데이터 조회
      const dataQuery = `
        SELECT * FROM work_sessions 
        ${whereClause} 
        ${orderClause} 
        ${limitClause} 
        ${offsetClause}
      `;
      
      const sessions = await this.connection.all(dataQuery, params);

      // 메모리 포함 여부에 따른 추가 처리
      let resultSessions;
      if (options.include_memories) {
        resultSessions = await Promise.all(
          sessions.map(async (session) => {
            const memories = await this.connection.all(
              'SELECT * FROM work_memories WHERE session_id = ?  ORDER BY created_at DESC',
              [session.session_id]
            );
            
            const memoryStats = this.calculateMemoryStats(memories);
            
            return {
              ...session,
              memories,
              memory_stats: memoryStats
            } as SessionWithMemories;
          })
        );
      } else {
        resultSessions = sessions as WorkSession[];
      }

      const limit = options.limit || 20;
      const offset = options.offset || 0;
      const hasMore = offset + sessions.length < totalCount;
      const nextOffset = hasMore ? offset + sessions.length : undefined;

      return {
        data: resultSessions,
        total_count: totalCount,
        has_more: hasMore,
        next_offset: nextOffset
      };
    } catch (error) {
      throw new Error(`Failed to search sessions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 세션 요약 정보 조회
   */
  async getSessionSummaries(filter?: SessionFilter): Promise<SessionSummary[]> {
    try {
      const { whereClause, params } = this.buildFilterWhereClause(filter);
      
      const query = `
        SELECT 
          session_id,
          project_name,
          status,
          memory_count,
          total_work_time as duration,
          last_activity_at as last_activity
        FROM work_sessions 
        ${whereClause}
        ORDER BY last_activity_at DESC
      `;

      const summaries = await this.connection.all(query, params);
      return summaries as SessionSummary[];
    } catch (error) {
      throw new Error(`Failed to get session summaries: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 활성 세션 조회
   */
  async getActiveSessions(): Promise<WorkSession[]> {
    try {
      const sessions = await this.connection.all(
        'SELECT * FROM work_sessions WHERE status IN (?, ?) ORDER BY last_activity_at DESC',
        [SessionStatus.ACTIVE, SessionStatus.PAUSED]
      );

      return sessions as WorkSession[];
    } catch (error) {
      throw new Error(`Failed to get active sessions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 프로젝트별 세션 조회
   */
  async getSessionsByProject(projectName: string, options: SessionQueryOptions = {}): Promise<QueryResult<WorkSession>> {
    const projectOptions = {
      ...options,
      project_name: projectName
    };

    return this.getSessions(projectOptions);
  }

  /**
   * 세션 통계 조회
   */
  async getSessionStats(filter?: SessionFilter): Promise<SessionStats> {
    try {
      const { whereClause, params } = this.buildFilterWhereClause(filter);

      // 기본 통계
      const statsQuery = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
          SUM(total_work_time) as total_work_time,
          AVG(total_work_time) as average_session_duration
        FROM work_sessions 
        ${whereClause}
      `;

      const stats = await this.connection.get(statsQuery, params);

      // 상태별 분포
      const statusQuery = `
        SELECT status, COUNT(*) as count 
        FROM work_sessions 
        ${whereClause}
        GROUP BY status
      `;

      const statusCounts = await this.connection.all(statusQuery, params);

      // 가장 활성 프로젝트
      const projectQuery = `
        SELECT project_name, COUNT(*) as session_count
        FROM work_sessions 
        ${whereClause}
        GROUP BY project_name 
        ORDER BY session_count DESC 
        LIMIT 1
      `;

      const topProject = await this.connection.get(projectQuery, params);

      // 상태별 카운트 객체 생성
      const sessionByStatus = {
        [SessionStatus.ACTIVE]: 0,
        [SessionStatus.PAUSED]: 0,
        [SessionStatus.COMPLETED]: 0,
        [SessionStatus.CANCELLED]: 0
      };

      statusCounts.forEach((item: any) => {
        sessionByStatus[item.status as SessionStatus] = item.count;
      });

      return {
        total_sessions: stats?.total_sessions || 0,
        active_sessions: stats?.active_sessions || 0,
        completed_sessions: stats?.completed_sessions || 0,
        total_work_time: stats?.total_work_time || 0,
        average_session_duration: stats?.average_session_duration || 0,
        most_active_project: topProject?.project_name || null,
        session_by_status: sessionByStatus
      };
    } catch (error) {
      throw new Error(`Failed to get session stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 최근 활동 세션 조회
   */
  async getRecentSessions(limit: number = 10): Promise<WorkSession[]> {
    try {
      const sessions = await this.connection.all(
        'SELECT * FROM work_sessions ORDER BY last_activity_at DESC LIMIT ?',
        [limit]
      );

      return sessions as WorkSession[];
    } catch (error) {
      throw new Error(`Failed to get recent sessions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * WHERE 절 생성 (기본)
   */
  private buildWhereClause(options: SessionQueryOptions): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.status) {
      if (Array.isArray(options.status)) {
        const placeholders = options.status.map(() => '?').join(',');
        conditions.push(`status IN (${placeholders})`);
        params.push(...options.status);
      } else {
        conditions.push('status = ?');
        params.push(options.status);
      }
    }

    if (options.project_name) {
      conditions.push('project_name = ?');
      params.push(options.project_name);
    }

    if (options.created_by) {
      conditions.push('created_by = ?');
      params.push(options.created_by);
    }

    if (options.date_range) {
      const field = options.date_range.start ? 'started_at' : 'created_at';
      if (options.date_range.start) {
        conditions.push(`${field} >= ?`);
        params.push(options.date_range.start);
      }
      if (options.date_range.end) {
        conditions.push(`${field} <= ?`);
        params.push(options.date_range.end);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * WHERE 절 생성 (고급 검색)
   */
  private buildAdvancedWhereClause(options: SessionSearchOptions): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    // 기본 필터 적용
    const basic = this.buildWhereClause(options);
    if (basic.whereClause) {
      conditions.push(basic.whereClause.replace('WHERE ', ''));
      params.push(...basic.params);
    }

    // 검색 쿼리
    if (options.search_query) {
      const searchFields = options.search_fields || ['project_name', 'description'];
      const searchConditions = searchFields.map(field => `${field} LIKE ?`);
      
      if (searchConditions.length > 0) {
        conditions.push(`(${searchConditions.join(' OR ')})`);
        searchFields.forEach(() => {
          params.push(`%${options.search_query}%`);
        });
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * WHERE 절 생성 (필터)
   */
  private buildFilterWhereClause(filter?: SessionFilter): { whereClause: string; params: any[] } {
    if (!filter) {
      return { whereClause: '', params: [] };
    }

    const conditions: string[] = [];
    const params: any[] = [];

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        const placeholders = filter.status.map(() => '?').join(',');
        conditions.push(`status IN (${placeholders})`);
        params.push(...filter.status);
      } else {
        conditions.push('status = ?');
        params.push(filter.status);
      }
    }

    if (filter.project_name) {
      if (Array.isArray(filter.project_name)) {
        const placeholders = filter.project_name.map(() => '?').join(',');
        conditions.push(`project_name IN (${placeholders})`);
        params.push(...filter.project_name);
      } else {
        conditions.push('project_name = ?');
        params.push(filter.project_name);
      }
    }

    if (filter.created_by) {
      if (Array.isArray(filter.created_by)) {
        const placeholders = filter.created_by.map(() => '?').join(',');
        conditions.push(`created_by IN (${placeholders})`);
        params.push(...filter.created_by);
      } else {
        conditions.push('created_by = ?');
        params.push(filter.created_by);
      }
    }

    if (filter.date_range) {
      const field = filter.date_range.field || 'started_at';
      if (filter.date_range.start) {
        conditions.push(`${field} >= ?`);
        params.push(filter.date_range.start);
      }
      if (filter.date_range.end) {
        conditions.push(`${field} <= ?`);
        params.push(filter.date_range.end);
      }
    }

    if (filter.memory_count_range) {
      if (filter.memory_count_range.min !== undefined) {
        conditions.push('memory_count >= ?');
        params.push(filter.memory_count_range.min);
      }
      if (filter.memory_count_range.max !== undefined) {
        conditions.push('memory_count <= ?');
        params.push(filter.memory_count_range.max);
      }
    }

    if (filter.activity_count_range) {
      if (filter.activity_count_range.min !== undefined) {
        conditions.push('activity_count >= ?');
        params.push(filter.activity_count_range.min);
      }
      if (filter.activity_count_range.max !== undefined) {
        conditions.push('activity_count <= ?');
        params.push(filter.activity_count_range.max);
      }
    }

    if (filter.tags) {
      if (Array.isArray(filter.tags)) {
        const tagConditions = filter.tags.map(() => 'tags LIKE ?');
        conditions.push(`(${tagConditions.join(' OR ')})`);
        filter.tags.forEach(tag => {
          const safeTag = tag.replace(/"/g, '""'); // SQLite 이스케이핑
          params.push(`%"${safeTag}"%`);
        });
      } else {
        const safeTag = filter.tags.replace(/"/g, '""'); // SQLite 이스케이핑
        conditions.push('tags LIKE ?');
        params.push(`%"${safeTag}"%`);
      }
    }

    if (filter.auto_created !== undefined) {
      conditions.push('auto_created = ?');
      params.push(filter.auto_created);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * ORDER BY 절 생성
   */
  private buildOrderClause(options: SessionQueryOptions): { orderClause: string } {
    const sortBy = options.sort_by || 'last_activity_at';
    const sortOrder = options.sort_order || 'DESC';
    
    const orderClause = `ORDER BY ${sortBy} ${sortOrder}`;
    return { orderClause };
  }

  /**
   * LIMIT/OFFSET 절 생성
   */
  private buildPaginationClause(options: SessionQueryOptions): { limitClause: string; offsetClause: string } {
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    const limitClause = `LIMIT ${limit}`;
    const offsetClause = offset > 0 ? `OFFSET ${offset}` : '';

    return { limitClause, offsetClause };
  }

  /**
   * 메모리 통계 계산
   */
  private calculateMemoryStats(memories: any[]): {
    total_count: number;
    by_importance: Record<string, number>;
    recent_count: number;
  } {
    const byImportance = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      minimal: 0
    };

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const oneDayAgoISO = oneDayAgo.toISOString();

    let recentCount = 0;

    memories.forEach(memory => {
      // 중요도별 분류
      const score = memory.importance_score || 50;
      if (score >= 90) byImportance.critical++;
      else if (score >= 70) byImportance.high++;
      else if (score >= 30) byImportance.medium++;
      else if (score >= 10) byImportance.low++;
      else byImportance.minimal++;

      // 최근 메모리 카운트
      if (memory.created_at > oneDayAgoISO) {
        recentCount++;
      }
    });

    return {
      total_count: memories.length,
      by_importance: byImportance,
      recent_count: recentCount
    };
  }

  /**
   * 필터 기반 세션 조회 (SessionSwitchManager용)
   */
  async findSessions(options: {
    filter?: any;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
    limit?: number;
    offset?: number;
  } = {}): Promise<QueryResult<WorkSession>> {
    try {
      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      // 필터 조건 구성
      if (options.filter) {
        if (options.filter.status) {
          if (Array.isArray(options.filter.status)) {
            const placeholders = options.filter.status.map(() => '?').join(',');
            whereClause += ` AND status IN (${placeholders})`;
            params.push(...options.filter.status);
          } else {
            whereClause += ' AND status = ?';
            params.push(options.filter.status);
          }
        }

        if (options.filter.project_name) {
          if (Array.isArray(options.filter.project_name)) {
            const placeholders = options.filter.project_name.map(() => '?').join(',');
            whereClause += ` AND project_name IN (${placeholders})`;
            params.push(...options.filter.project_name);
          } else {
            whereClause += ' AND project_name = ?';
            params.push(options.filter.project_name);
          }
        }

        if (options.filter.project_path) {
          whereClause += ' AND project_path = ?';
          params.push(options.filter.project_path);
        }

        if (options.filter.git_repository) {
          whereClause += ' AND git_repository = ?';
          params.push(options.filter.git_repository);
        }

        if (options.filter.tags) {
          if (Array.isArray(options.filter.tags)) {
            for (const tag of options.filter.tags) {
              whereClause += ' AND tags LIKE ?';
              params.push(`%"${tag}"%`);
            }
          } else {
            whereClause += ' AND tags LIKE ?';
            params.push(`%"${options.filter.tags}"%`);
          }
        }

        if (options.filter.date_range) {
          const field = options.filter.date_range.field || 'created_at';
          if (options.filter.date_range.start) {
            whereClause += ` AND ${field} >= ?`;
            params.push(options.filter.date_range.start);
          }
          if (options.filter.date_range.end) {
            whereClause += ` AND ${field} <= ?`;
            params.push(options.filter.date_range.end);
          }
        }

        if (options.filter.auto_created !== undefined) {
          whereClause += ' AND auto_created = ?';
          params.push(options.filter.auto_created ? 1 : 0);
        }
      }

      // 정렬 구성
      const orderBy = options.order_by || 'created_at';
      const orderDirection = options.order_direction || 'DESC';
      const orderClause = `ORDER BY ${orderBy} ${orderDirection}`;

      // 페이지네이션
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const limitClause = `LIMIT ${limit}`;
      const offsetClause = offset > 0 ? `OFFSET ${offset}` : '';

      // 총 개수 조회
      const countQuery = `SELECT COUNT(*) as count FROM work_sessions ${whereClause}`;
      const countResult = await this.connection.get(countQuery, params);
      const totalCount = countResult?.count || 0;

      // 데이터 조회
      const dataQuery = `
        SELECT * FROM work_sessions 
        ${whereClause} 
        ${orderClause} 
        ${limitClause} 
        ${offsetClause}
      `;
      
      const sessions = await this.connection.all(dataQuery, params);

      return {
        data: sessions as WorkSession[],
        total_count: totalCount,
        has_more: offset + sessions.length < totalCount,
        next_offset: offset + sessions.length < totalCount ? offset + sessions.length : undefined
      };
    } catch (error) {
      throw new Error(`Failed to find sessions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 필터 기반 세션 개수 조회
   */
  async countSessions(filter: any = {}): Promise<number> {
    try {
      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      if (filter.status) {
        if (Array.isArray(filter.status)) {
          const placeholders = filter.status.map(() => '?').join(',');
          whereClause += ` AND status IN (${placeholders})`;
          params.push(...filter.status);
        } else {
          whereClause += ' AND status = ?';
          params.push(filter.status);
        }
      }

      if (filter.project_name) {
        whereClause += ' AND project_name = ?';
        params.push(filter.project_name);
      }

      const countQuery = `SELECT COUNT(*) as count FROM work_sessions ${whereClause}`;
      const result = await this.connection.get(countQuery, params);
      
      return result?.count || 0;
    } catch (error) {
      throw new Error(`Failed to count sessions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
