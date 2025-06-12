/**
 * SessionSwitchManager 통합 테스트
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionSwitchManager } from '../../src/session/SessionSwitchManager.js';
import { DatabaseConnection } from '../../src/database/connection.js';
import { SessionStatus, SwitchDecision } from '../../src/types/session.js';
import Database from 'better-sqlite3';

describe('SessionSwitchManager Integration Tests', () => {
  let connection: DatabaseConnection;
  let switchManager: SessionSwitchManager;
  let db: Database.Database;

  beforeEach(async () => {
    // 실제 SQLite 인메모리 DB 사용
    db = new Database(':memory:');
    
    // 데이터베이스 연결 생성
    connection = {
      query: async (sql: string, params?: any[]) => {
        return db.prepare(sql).run(...(params || []));
      },
      get: async (sql: string, params?: any[]) => {
        return db.prepare(sql).get(...(params || []));
      },
      all: async (sql: string, params?: any[]) => {
        return db.prepare(sql).all(...(params || []));
      },
      close: async () => {
        db.close();
      }
    } as any;

    // 테이블 생성
    db.exec(`
      CREATE TABLE work_sessions (
        session_id TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        project_path TEXT,
        git_repository TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        last_activity_at TEXT NOT NULL,
        status TEXT NOT NULL,
        description TEXT,
        auto_created INTEGER DEFAULT 0,
        tags TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        activity_count INTEGER DEFAULT 0,
        memory_count INTEGER DEFAULT 0,
        total_work_time INTEGER DEFAULT 0,
        project_normalized TEXT
      )
    `);

    // 모킹된 ProjectContextAnalyzer로 SwitchManager 생성
    const mockContextAnalyzer = {
      analyzeContext: async () => ({ 
        project_type: 'node',
        has_package_json: true 
      })
    };

    switchManager = new SessionSwitchManager(
      connection, 
      {}, 
      mockContextAnalyzer as any
    );
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
  });

  describe('실제 데이터베이스 연동', () => {
    it('새 프로젝트에 대해 실제로 새 세션을 생성하고 DB에 저장해야 함', async () => {
      const context = {
        project_path: '/test/real-project',
        project_name: 'real-project',
        git_repository: 'https://github.com/test/real-project.git'
      };

      const result = await switchManager.switchSession(context);

      expect(result.success).toBe(true);
      expect(result.switched).toBe(true);
      expect(result.decision).toBe(SwitchDecision.CREATE_NEW);
      expect(result.target_session).toBeDefined();

      // DB에서 실제로 세션이 생성되었는지 확인
      const savedSession = await connection.get(
        'SELECT * FROM work_sessions WHERE session_id = ?',
        [result.target_session!.session_id]
      );

      expect(savedSession).toBeDefined();
      expect(savedSession.project_name).toBe('real-project');
      expect(savedSession.status).toBe(SessionStatus.ACTIVE);
    });

    it('기존 세션이 있을 때 올바르게 재활성화해야 함', async () => {
      // 1. 먼저 일시정지된 세션을 DB에 직접 삽입
      const pausedSessionId = 'test_session_' + Date.now();
      await connection.query(`
        INSERT INTO work_sessions (
          session_id, project_name, project_path, started_at, 
          last_activity_at, status, auto_created, tags, 
          created_by, created_at, updated_at, activity_count, 
          memory_count, total_work_time, project_normalized
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        pausedSessionId,
        'existing-project',
        '/test/existing-project',
        new Date().toISOString(),
        new Date().toISOString(),
        SessionStatus.PAUSED,
        0,
        JSON.stringify(['test']),
        'test',
        new Date().toISOString(),
        new Date().toISOString(),
        0,
        0,
        0,
        'existing-project'
      ]);

      // 2. 동일 프로젝트로 전환 요청
      const context = {
        project_path: '/test/existing-project',
        project_name: 'existing-project'
      };

      const result = await switchManager.switchSession(context);

      expect(result.success).toBe(true);
      expect(result.switched).toBe(true);
      expect(result.decision).toBe(SwitchDecision.REACTIVATE_EXISTING);

      // 3. DB에서 세션이 실제로 활성화되었는지 확인
      const updatedSession = await connection.get(
        'SELECT * FROM work_sessions WHERE session_id = ?',
        [pausedSessionId]
      );

      expect(updatedSession.status).toBe(SessionStatus.ACTIVE);
    });

    it('유사도 계산이 실제로 올바르게 작동해야 함', async () => {
      // SessionFactory 없이 직접 세션 객체 생성
      const session = {
        session_id: 'test_similarity',
        project_name: 'test-project',
        project_path: '/path/to/test-project',
        git_repository: 'https://github.com/test/repo.git',
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        status: SessionStatus.ACTIVE,
        auto_created: false,
        tags: [],
        created_by: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activity_count: 0,
        memory_count: 0,
        total_work_time: 0,
        project_normalized: 'test-project'
      };

      // 프로젝트명 정확히 일치하는 경우
      const context1 = {
        project_name: 'test-project',
        project_path: '/different/path'
      };

      const similarity1 = switchManager['calculateSessionSimilarity'](session, context1);
      expect(similarity1).toBe(0.4); // 프로젝트명 일치

      // 프로젝트 경로 정확히 일치하는 경우  
      const context2 = {
        project_name: 'different-project',
        project_path: '/path/to/test-project'
      };

      const similarity2 = switchManager['calculateSessionSimilarity'](session, context2);
      expect(similarity2).toBe(0.4); // 프로젝트 경로 일치

      // 둘 다 일치하는 경우
      const context3 = {
        project_name: 'test-project',
        project_path: '/path/to/test-project',
        git_repository: 'https://github.com/test/repo.git'
      };

      const similarity3 = switchManager['calculateSessionSimilarity'](session, context3);
      expect(similarity3).toBe(1.0); // 모든 요소 일치
    });
  });

  describe('에러 처리', () => {
    it('데이터베이스 오류 시 적절한 에러 메시지를 반환해야 함', async () => {
      // 데이터베이스 연결 끊기
      db.close();

      const context = {
        project_path: '/test/error-project',
        project_name: 'error-project'
      };

      const result = await switchManager.switchSession(context);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });
});
