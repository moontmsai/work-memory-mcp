import { DatabaseConnection } from '../database/connection.js';

export interface WorkSession {
  session_id: string;
  project_name: string;
  project_path?: string;
  git_repository?: string;
  started_at: string;
  ended_at?: string;
  last_activity_at: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  description?: string;
  auto_created: boolean;
  tags?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  activity_count: number;
  memory_count: number;
  total_work_time: number;
}

export class SessionManager {
  constructor(private connection: DatabaseConnection) {}

  /**
   * 새 세션 생성
   */
  async createSession(
    projectName: string,
    options: {
      projectPath?: string;
      gitRepository?: string;
      description?: string;
      tags?: string[];
      autoCreated?: boolean;
      createdBy?: string;
    } = {}
  ): Promise<WorkSession> {
    const sessionId = this.generateSessionId(projectName);
    const now = new Date().toISOString();
    
    const session: WorkSession = {
      session_id: sessionId,
      project_name: projectName,
      project_path: options.projectPath,
      git_repository: options.gitRepository,
      started_at: now,
      last_activity_at: now,
      status: 'active',
      description: options.description,
      auto_created: options.autoCreated ?? true,
      tags: options.tags || [],
      created_by: options.createdBy || 'user',
      created_at: now,
      updated_at: now,
      activity_count: 0,
      memory_count: 0,
      total_work_time: 0
    };

    await this.connection.run(`
      INSERT INTO work_sessions (
        session_id, project_name, project_path, git_repository,
        started_at, last_activity_at, status, description,
        auto_created, tags, created_by, created_at, updated_at,
        activity_count, memory_count, total_work_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      session.session_id,
      session.project_name,
      session.project_path,
      session.git_repository,
      session.started_at,
      session.last_activity_at,
      session.status,
      session.description,
      session.auto_created,
      JSON.stringify(session.tags),
      session.created_by,
      session.created_at,
      session.updated_at,
      session.activity_count,
      session.memory_count,
      session.total_work_time
    ]);

    return session;
  }

  /**
   * 활성 세션 조회
   */
  async getActiveSession(): Promise<WorkSession | null> {
    const result = await this.connection.get(`
      SELECT * FROM work_sessions 
      WHERE status = 'active' 
      ORDER BY last_activity_at DESC 
      LIMIT 1
    `);

    if (!result) return null;

    return this.mapRowToSession(result);
  }

  /**
   * 세션 ID로 조회
   */
  async getSession(sessionId: string): Promise<WorkSession | null> {
    const result = await this.connection.get(
      'SELECT * FROM work_sessions WHERE session_id = ?',
      [sessionId]
    );

    if (!result) return null;

    return this.mapRowToSession(result);
  }

  /**
   * 프로젝트명으로 활성 세션 조회
   */
  async getActiveSessionByProject(projectName: string): Promise<WorkSession | null> {
    const result = await this.connection.get(`
      SELECT * FROM work_sessions 
      WHERE project_name = ? AND status = 'active'
      ORDER BY last_activity_at DESC 
      LIMIT 1
    `, [projectName]);

    if (!result) return null;

    return this.mapRowToSession(result);
  }

  /**
   * 세션 활성화 (기존 활성 세션은 비활성화)
   */
  async activateSession(sessionId: string): Promise<WorkSession | null> {
    await this.connection.run('BEGIN TRANSACTION');
    
    try {
      // 기존 활성 세션들을 paused로 변경
      await this.connection.run(`
        UPDATE work_sessions 
        SET status = 'paused', updated_at = ? 
        WHERE status = 'active'
      `, [new Date().toISOString()]);

      // 지정된 세션을 활성화
      const now = new Date().toISOString();
      await this.connection.run(`
        UPDATE work_sessions 
        SET status = 'active', last_activity_at = ?, updated_at = ?
        WHERE session_id = ?
      `, [now, now, sessionId]);

      await this.connection.run('COMMIT');

      return await this.getSession(sessionId);
    } catch (error) {
      await this.connection.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * 세션 업데이트 (활동 기록)
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.connection.run(`
      UPDATE work_sessions 
      SET last_activity_at = ?, updated_at = ?, activity_count = activity_count + 1
      WHERE session_id = ?
    `, [now, now, sessionId]);
  }

  /**
   * 세션의 메모리 개수 업데이트
   */
  async updateSessionMemoryCount(sessionId: string): Promise<void> {
    const result = await this.connection.get(`
      SELECT COUNT(*) as count 
      FROM work_memories 
      WHERE session_id = ? AND is_archived = FALSE
    `, [sessionId]);

    const memoryCount = result?.count || 0;
    
    await this.connection.run(`
      UPDATE work_sessions 
      SET memory_count = ?, updated_at = ?
      WHERE session_id = ?
    `, [memoryCount, new Date().toISOString(), sessionId]);
  }

  /**
   * 세션 종료
   */
  async endSession(sessionId: string, status: 'completed' | 'cancelled' = 'completed'): Promise<void> {
    const now = new Date().toISOString();
    await this.connection.run(`
      UPDATE work_sessions 
      SET status = ?, ended_at = ?, updated_at = ?
      WHERE session_id = ?
    `, [status, now, now, sessionId]);
  }

  /**
   * 모든 세션 목록 (최근순)
   */
  async listSessions(options: {
    limit?: number;
    status?: string;
    projectName?: string;
  } = {}): Promise<WorkSession[]> {
    let query = 'SELECT * FROM work_sessions WHERE 1=1';
    const params: any[] = [];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    if (options.projectName) {
      query += ' AND project_name = ?';
      params.push(options.projectName);
    }

    query += ' ORDER BY last_activity_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const results = await this.connection.all(query, params);
    return results.map(row => this.mapRowToSession(row));
  }

  /**
   * 세션 삭제 (세션만)
   */
  async deleteSession(sessionId: string, confirm: boolean = false): Promise<{
    success: boolean;
    message: string;
    memoryCount?: number;
  }> {
    if (!confirm) {
      return {
        success: false,
        message: '❌ 세션 삭제시에는 confirm=true가 필요합니다.'
      };
    }

    // 세션 존재 확인
    const session = await this.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        message: '❌ 세션을 찾을 수 없습니다.'
      };
    }

    // 관련 작업기억 개수 확인
    const memoryResult = await this.connection.get(`
      SELECT COUNT(*) as count 
      FROM work_memories 
      WHERE session_id = ? AND is_archived = FALSE
    `, [sessionId]);
    const memoryCount = memoryResult?.count || 0;

    try {
      // 세션만 삭제 (작업기억은 유지, session_id를 NULL로 설정)
      await this.connection.run('BEGIN TRANSACTION');
      
      // 작업기억의 session_id를 NULL로 변경 (연결 해제)
      if (memoryCount > 0) {
        await this.connection.run(`
          UPDATE work_memories 
          SET session_id = NULL, updated_at = ?
          WHERE session_id = ?
        `, [new Date().toISOString(), sessionId]);
      }

      // 세션 삭제
      await this.connection.run(`
        DELETE FROM work_sessions 
        WHERE session_id = ?
      `, [sessionId]);

      await this.connection.run('COMMIT');

      return {
        success: true,
        message: `✅ 세션 "${session.project_name}" 삭제 완료. ${memoryCount}개 작업기억은 유지됨`,
        memoryCount
      };
    } catch (error) {
      await this.connection.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * 세션 + 관련 작업기억 일괄 삭제 (cascade)
   */
  async deleteSessionWithMemories(sessionId: string, confirm: boolean = false): Promise<{
    success: boolean;
    message: string;
    deletedMemoryCount?: number;
  }> {
    if (!confirm) {
      return {
        success: false,
        message: '❌ 세션+작업기억 일괄 삭제시에는 confirm=true가 필요합니다.'
      };
    }

    // 세션 존재 확인
    const session = await this.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        message: '❌ 세션을 찾을 수 없습니다.'
      };
    }

    // 관련 작업기억 개수 확인
    const memoryResult = await this.connection.get(`
      SELECT COUNT(*) as count 
      FROM work_memories 
      WHERE session_id = ? AND is_archived = FALSE
    `, [sessionId]);
    const memoryCount = memoryResult?.count || 0;

    try {
      await this.connection.run('BEGIN TRANSACTION');
      
      // 작업기억 삭제
      if (memoryCount > 0) {
        await this.connection.run(`
          DELETE FROM work_memories 
          WHERE session_id = ?
        `, [sessionId]);
      }

      // 세션 삭제
      await this.connection.run(`
        DELETE FROM work_sessions 
        WHERE session_id = ?
      `, [sessionId]);

      await this.connection.run('COMMIT');

      return {
        success: true,
        message: `✅ 세션 "${session.project_name}"과 관련 작업기억 ${memoryCount}개 모두 삭제 완료`,
        deletedMemoryCount: memoryCount
      };
    } catch (error) {
      await this.connection.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * 스마트 세션 감지/생성
   * 해삼씨가 원하는 간단한 방식으로!
   */
  async smartSessionManager(input: {
    projectName?: string;
    context?: string;
    autoCreate?: boolean;
  }): Promise<{
    session: WorkSession;
    isNew: boolean;
    message: string;
  }> {
    // 1. 프로젝트명이 주어진 경우 해당 프로젝트의 활성 세션 찾기
    if (input.projectName) {
      const existing = await this.getActiveSessionByProject(input.projectName);
      if (existing) {
        await this.updateSessionActivity(existing.session_id);
        return {
          session: existing,
          isNew: false,
          message: `📂 "${input.projectName}" 프로젝트 세션 계속 진행중`
        };
      }

      // 새 세션 생성
      if (input.autoCreate !== false) {
        const newSession = await this.createSession(input.projectName, {
          description: input.context,
          autoCreated: true,
          createdBy: 'smart-manager'
        });
        
        return {
          session: newSession,
          isNew: true,
          message: `🆕 "${input.projectName}" 새 프로젝트 세션 시작!`
        };
      }
    }

    // 2. 현재 활성 세션이 있으면 그것을 사용
    const activeSession = await this.getActiveSession();
    if (activeSession) {
      await this.updateSessionActivity(activeSession.session_id);
      return {
        session: activeSession,
        isNew: false,
        message: `🔄 현재 "${activeSession.project_name}" 세션 계속`
      };
    }

    // 3. 활성 세션이 없고 프로젝트명도 없으면 기본 세션 생성
    const defaultSession = await this.createSession('일반작업', {
      description: input.context || '자동 생성된 일반 작업 세션',
      autoCreated: true,
      createdBy: 'smart-manager'
    });

    return {
      session: defaultSession,
      isNew: true,
      message: `📝 일반 작업 세션 시작`
    };
  }

  /**
   * 세션 ID 생성
   */
  private generateSessionId(projectName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const projectPrefix = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .substring(0, 15);
    
    return `session_${projectPrefix}_${timestamp}_${random}`;
  }

  /**
   * DB 행을 WorkSession 객체로 변환
   */
  private mapRowToSession(row: any): WorkSession {
    return {
      session_id: row.session_id,
      project_name: row.project_name,
      project_path: row.project_path,
      git_repository: row.git_repository,
      started_at: row.started_at,
      ended_at: row.ended_at,
      last_activity_at: row.last_activity_at,
      status: row.status,
      description: row.description,
      auto_created: row.auto_created,
      tags: row.tags ? JSON.parse(row.tags) : [],
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      activity_count: row.activity_count,
      memory_count: row.memory_count,
      total_work_time: row.total_work_time
    };
  }
}
