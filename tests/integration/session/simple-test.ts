/**
 * 간단한 SessionMemoryLinker 테스트
 */

import { DatabaseManager, DatabaseConnection } from '../../../src/database/connection.js';
import { SessionMemoryLinker } from '../../../src/session/SessionMemoryLinker.js';

async function simpleTest() {
  console.log('🧪 간단한 SessionMemoryLinker 테스트...');
  
  // 임시 데이터베이스 설정
  process.env.WORK_MEMORY_DIR = 'D:\\project\\memory\\tests\\temp';
  process.env.DB_FILENAME = `simple_test_${Date.now()}.sqlite`;

  try {
    const dbManager = DatabaseManager.getInstance();
    const connection = await dbManager.initialize();
    
    console.log('✅ 데이터베이스 연결 성공');

    // 테이블 생성
    await connection.run(`
      CREATE TABLE IF NOT EXISTS work_sessions (
        session_id TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        project_path TEXT NOT NULL,
        project_normalized TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        memory_count INTEGER DEFAULT 0
      )
    `);

    await connection.run(`
      CREATE TABLE IF NOT EXISTS work_memories (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        content TEXT NOT NULL,
        importance_score INTEGER DEFAULT 50,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        work_type TEXT DEFAULT 'memory',
        created_by TEXT DEFAULT 'unknown'
      )
    `);

    console.log('✅ 테이블 생성 성공');

    // 테스트 세션 생성
    const now = new Date().toISOString();
    await connection.run(`
      INSERT INTO work_sessions (
        session_id, project_name, project_path, project_normalized,
        status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'test-session-1',
      'Test Project',
      '/test/path',
      'test project',
      'active',
      'test-user',
      now,
      now
    ]);

    // 테스트 메모리 생성
    await connection.run(`
      INSERT INTO work_memories (
        id, content, importance_score, created_at, updated_at,
        work_type, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'test-memory-1',
      'Test memory content',
      80,
      now,
      now,
      'memory',
      'test-user'
    ]);

    console.log('✅ 테스트 데이터 생성 성공');

    // SessionMemoryLinker 테스트
    const memoryLinker = new SessionMemoryLinker(connection);
    
    // 메모리를 세션에 연결
    const linkResult = await memoryLinker.linkMemoryToSession(
      'test-session-1',
      ['test-memory-1']
    );

    console.log('연결 결과:', linkResult);

    if (linkResult.success && linkResult.linked_count === 1) {
      console.log('✅ 메모리 연결 테스트 성공');
    } else {
      console.log('❌ 메모리 연결 테스트 실패');
    }

    // 세션 메모리 조회
    const memories = await memoryLinker.getSessionMemories('test-session-1');
    console.log('세션 메모리:', memories);

    if (memories.memories.length === 1) {
      console.log('✅ 세션 메모리 조회 성공');
    } else {
      console.log('❌ 세션 메모리 조회 실패');
    }

    await connection.close();
    console.log('🎉 모든 테스트 성공!');

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    throw error;
  }
}

// 실행
simpleTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 테스트 오류:', error);
    process.exit(1);
  });
