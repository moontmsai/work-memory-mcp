/**
 * SessionMemoryLinker 통합 테스트 및 검증 스크립트
 */

import { DatabaseManager, DatabaseConnection } from '../../../src/database/connection.js';
import { SessionMemoryLinker, MemoryItem } from '../../../src/session/SessionMemoryLinker.js';
import { SessionFactory } from '../../../src/session/SessionFactory.js';
import { SessionStatus } from '../../../src/types/session.js';

async function testSessionMemoryLinker() {
  console.log('🧪 SessionMemoryLinker 통합 테스트 시작...\n');

  // 임시 데이터베이스 생성을 위한 환경변수 설정
  process.env.WORK_MEMORY_DIR = 'D:\\project\\memory\\tests\\temp';
  process.env.DB_FILENAME = `test_session_memory_${Date.now()}.sqlite`;

  const dbManager = DatabaseManager.getInstance();
  const connection = await dbManager.initialize();

  try {
    // 테스트 테이블 생성
    await createTestTables(connection);
    
    // 테스트 데이터 준비
    const { sessionFactory, memoryLinker, testSessions, testMemories } = await setupTestData(connection);

    // 1. 메모리-세션 연결 테스트
    await testMemoryLinking(memoryLinker, testSessions, testMemories);
    
    // 2. 메모리 언링크 테스트
    await testMemoryUnlinking(memoryLinker, testSessions, testMemories);
    
    // 3. 메모리 마이그레이션 테스트
    await testMemoryMigration(memoryLinker, testSessions, testMemories);
    
    // 4. 세션 메모리 조회 테스트
    await testSessionMemoryRetrieval(memoryLinker, testSessions);
    
    // 5. 고아 메모리 정리 테스트
    await testOrphanMemoryCleanup(memoryLinker);
    
    // 6. 세션 메모리 통계 테스트
    await testSessionMemoryStats(memoryLinker, testSessions);
    
    // 7. 검증 규칙 테스트
    await testValidationRules(memoryLinker, testSessions, testMemories);

    console.log('✅ 모든 SessionMemoryLinker 테스트 통과!\n');

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    throw error;
  } finally {
    await connection.close();
    
    // 테스트 DB 파일 정리
    try {
      const fs = await import('fs');
      const dbPath = `D:\\project\\memory\\tests\\temp\\${process.env.DB_FILENAME}`;
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    } catch (error) {
      console.warn('Failed to cleanup test database:', error);
    }
  }
}

async function createTestTables(connection: DatabaseConnection) {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS work_sessions (
      session_id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      project_path TEXT NOT NULL,
      project_normalized TEXT NOT NULL,
      git_repository TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      last_activity_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT,
      auto_created BOOLEAN DEFAULT FALSE,
      tags TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      activity_count INTEGER DEFAULT 0,
      memory_count INTEGER DEFAULT 0,
      total_work_time INTEGER DEFAULT 0
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
      project TEXT,
      tags TEXT,
      work_type TEXT DEFAULT 'memory',
      created_by TEXT DEFAULT 'unknown',
      context TEXT,
      requirements TEXT,
      result_content TEXT,
      FOREIGN KEY (session_id) REFERENCES work_sessions(session_id)
    )
  `);
}

async function setupTestData(connection: DatabaseConnection) {
  const sessionFactory = new SessionFactory(connection);
  const memoryLinker = new SessionMemoryLinker(connection);

  // 테스트 세션들 생성
  const session1Result = await sessionFactory.createSession({
    project_name: 'Test Project Alpha',
    project_path: '/test/alpha',
    description: 'Test session for linking',
    created_by: 'test-user'
  });

  const session2Result = await sessionFactory.createSession({
    project_name: 'Test Project Beta',
    project_path: '/test/beta',
    description: 'Another test session',
    created_by: 'test-user'
  });

  const testSessions = [session1Result.session, session2Result.session];

  // 테스트 메모리들 생성
  const testMemories: MemoryItem[] = [];
  const memoryData = [
    {
      id: 'mem-alpha-1',
      content: 'Alpha project initial setup completed',
      importance_score: 85,
      project: 'Test Project Alpha',
      tags: ['setup', 'completed'],
      work_type: 'memory' as const
    },
    {
      id: 'mem-alpha-2', 
      content: 'Configuration files updated',
      importance_score: 60,
      project: 'Test Project Alpha',
      tags: ['config', 'update'],
      work_type: 'todo' as const
    },
    {
      id: 'mem-beta-1',
      content: 'Beta project research phase',
      importance_score: 75,
      project: 'Test Project Beta', 
      tags: ['research', 'planning'],
      work_type: 'memory' as const
    },
    {
      id: 'mem-orphan-1',
      content: 'Orphaned memory without session',
      importance_score: 30,
      project: 'Unknown Project',
      tags: ['orphan'],
      work_type: 'memory' as const
    },
    {
      id: 'mem-empty-content',
      content: '', // 빈 컨텐츠 - 검증 실패용
      importance_score: 20,
      project: 'Test Project Alpha',
      tags: [],
      work_type: 'memory' as const
    }
  ];

  for (const memData of memoryData) {
    const now = new Date().toISOString();
    await connection.run(`
      INSERT INTO work_memories (
        id, content, importance_score, created_at, updated_at,
        project, tags, work_type, created_by, context
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      memData.id,
      memData.content,
      memData.importance_score,
      now,
      now,
      memData.project,
      JSON.stringify(memData.tags),
      memData.work_type,
      'test-user',
      'Test context'
    ]);

    testMemories.push({
      id: memData.id,
      content: memData.content,
      importance_score: memData.importance_score,
      created_at: now,
      updated_at: now,
      project: memData.project,
      tags: memData.tags,
      work_type: memData.work_type,
      created_by: 'test-user',
      context: 'Test context'
    });
  }

  return { sessionFactory, memoryLinker, testSessions, testMemories };
}

async function testMemoryLinking(
  memoryLinker: SessionMemoryLinker,
  testSessions: any[],
  testMemories: MemoryItem[]
) {
  console.log('🔗 메모리-세션 연결 테스트...');

  // 1. 정상적인 메모리 연결
  const linkResult1 = await memoryLinker.linkMemoryToSession(
    testSessions[0].session_id,
    ['mem-alpha-1', 'mem-alpha-2']
  );

  console.log('  연결 결과:', {
    success: linkResult1.success,
    linked: linkResult1.linked_count,
    failed: linkResult1.failed_count,
    errors: linkResult1.errors
  });

  if (!linkResult1.success || linkResult1.linked_count !== 2) {
    throw new Error('정상 메모리 연결 실패');
  }

  // 2. 존재하지 않는 메모리 연결 시도
  const linkResult2 = await memoryLinker.linkMemoryToSession(
    testSessions[0].session_id,
    ['nonexistent-mem']
  );

  if (linkResult2.success || linkResult2.failed_count !== 1) {
    throw new Error('존재하지 않는 메모리 연결 처리 실패');
  }

  // 3. 빈 컨텐츠 메모리 연결 시도 (검증 실패)
  const linkResult3 = await memoryLinker.linkMemoryToSession(
    testSessions[0].session_id,
    ['mem-empty-content']
  );

  if (linkResult3.success || !linkResult3.errors[0].includes('non-empty content')) {
    throw new Error('검증 규칙 적용 실패');
  }

  console.log('  ✅ 메모리 연결 테스트 통과\n');
}

async function testMemoryUnlinking(
  memoryLinker: SessionMemoryLinker,
  testSessions: any[],
  testMemories: MemoryItem[]
) {
  console.log('🔓 메모리 언링크 테스트...');

  // 1. 소프트 언링크
  const unlinkResult1 = await memoryLinker.unlinkMemoryFromSession(
    testSessions[0].session_id,
    ['mem-alpha-2'],
    { soft_unlink: true, reason: 'Test unlink' }
  );

  console.log('  소프트 언링크 결과:', {
    success: unlinkResult1.success,
    unlinked: unlinkResult1.linked_count,
    errors: unlinkResult1.errors
  });

  if (!unlinkResult1.success || unlinkResult1.linked_count !== 1) {
    throw new Error('소프트 언링크 실패');
  }

  // 2. 연결되지 않은 메모리 언링크 시도
  const unlinkResult2 = await memoryLinker.unlinkMemoryFromSession(
    testSessions[1].session_id,
    ['mem-alpha-1']
  );

  if (!unlinkResult2.warnings || !unlinkResult2.warnings[0].includes('not linked')) {
    throw new Error('언링크 경고 처리 실패');
  }

  console.log('  ✅ 메모리 언링크 테스트 통과\n');
}

async function testMemoryMigration(
  memoryLinker: SessionMemoryLinker,
  testSessions: any[],
  testMemories: MemoryItem[]
) {
  console.log('🚚 메모리 마이그레이션 테스트...');

  // Beta 세션에 메모리 먼저 연결
  await memoryLinker.linkMemoryToSession(
    testSessions[1].session_id,
    ['mem-beta-1']
  );

  // Alpha에서 Beta로 메모리 마이그레이션
  const migrateResult = await memoryLinker.migrateMemoryToSession(
    testSessions[0].session_id, // from
    testSessions[1].session_id, // to
    ['mem-alpha-1'],
    { validate_target: true, reason: 'Test migration' }
  );

  console.log('  마이그레이션 결과:', {
    success: migrateResult.success,
    migrated: migrateResult.linked_count,
    errors: migrateResult.errors
  });

  if (!migrateResult.success || migrateResult.linked_count !== 1) {
    throw new Error('메모리 마이그레이션 실패');
  }

  console.log('  ✅ 메모리 마이그레이션 테스트 통과\n');
}

async function testSessionMemoryRetrieval(
  memoryLinker: SessionMemoryLinker,
  testSessions: any[]
) {
  console.log('📋 세션 메모리 조회 테스트...');

  // 세션의 메모리들 조회
  const memories = await memoryLinker.getSessionMemories(
    testSessions[1].session_id,
    {
      include_stats: true,
      sort_by: 'importance_score',
      sort_order: 'DESC'
    }
  );

  console.log('  조회 결과:', {
    count: memories.memories.length,
    total: memories.total_count,
    hasStats: !!memories.stats
  });

  if (memories.memories.length === 0 || !memories.stats) {
    throw new Error('세션 메모리 조회 실패');
  }

  console.log('  통계:', {
    total: memories.stats.total_count,
    byImportance: memories.stats.by_importance,
    byType: memories.stats.by_type,
    avgImportance: memories.stats.average_importance
  });

  console.log('  ✅ 세션 메모리 조회 테스트 통과\n');
}

async function testOrphanMemoryCleanup(memoryLinker: SessionMemoryLinker) {
  console.log('🧹 고아 메모리 정리 테스트...');

  // 먼저 드라이런으로 고아 메모리 확인
  const dryRunResult = await memoryLinker.cleanupOrphanMemories({ dry_run: true });

  console.log('  고아 메모리 발견:', {
    found: dryRunResult.found_count,
    orphans: dryRunResult.orphan_memories.map(m => m.id)
  });

  if (dryRunResult.found_count === 0) {
    throw new Error('고아 메모리가 발견되지 않음 (mem-orphan-1이 있어야 함)');
  }

  // 실제 정리 수행
  const cleanupResult = await memoryLinker.cleanupOrphanMemories({ dry_run: false });

  console.log('  정리 결과:', {
    found: cleanupResult.found_count,
    cleaned: cleanupResult.cleaned_count
  });

  if (cleanupResult.cleaned_count === 0) {
    throw new Error('고아 메모리 정리 실패');
  }

  console.log('  ✅ 고아 메모리 정리 테스트 통과\n');
}

async function testSessionMemoryStats(
  memoryLinker: SessionMemoryLinker,
  testSessions: any[]
) {
  console.log('📊 세션 메모리 통계 테스트...');

  const stats = await memoryLinker.calculateSessionMemoryStats(testSessions[1].session_id);

  console.log('  통계 결과:', {
    total: stats.total_count,
    importance: stats.by_importance,
    types: stats.by_type,
    avgImportance: Math.round(stats.average_importance),
    recentCount: stats.recent_count
  });

  if (stats.total_count === 0) {
    throw new Error('세션에 메모리가 없음');
  }

  // 빈 세션 통계도 테스트
  const emptyStats = await memoryLinker.calculateSessionMemoryStats('nonexistent');
  if (emptyStats.total_count !== 0 || emptyStats.average_importance !== 0) {
    throw new Error('빈 세션 통계 처리 실패');
  }

  console.log('  ✅ 세션 메모리 통계 테스트 통과\n');
}

async function testValidationRules(
  memoryLinker: SessionMemoryLinker,
  testSessions: any[],
  testMemories: MemoryItem[]
) {
  console.log('✅ 검증 규칙 테스트...');

  // 커스텀 검증 규칙 추가
  memoryLinker.addValidationRule({
    name: 'test_custom_rule',
    description: 'Test custom validation rule',
    validate: async (sessionId, memoryId, memory, session) => {
      return !memory.content.includes('forbidden');
    },
    error_message: 'Memory contains forbidden content'
  });

  // 커스텀 규칙을 위반하는 메모리 생성 및 테스트
  const now = new Date().toISOString();
  await memoryLinker['connection'].run(`
    INSERT INTO work_memories (
      id, content, importance_score, created_at, updated_at,
      project, tags, work_type, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'mem-forbidden',
    'This contains forbidden content',
    50,
    now,
    now,
    'Test Project Alpha',
    '[]',
    'memory',
    'test-user'
  ]);

  const linkResult = await memoryLinker.linkMemoryToSession(
    testSessions[0].session_id,
    ['mem-forbidden']
  );

  if (linkResult.success || !linkResult.errors[0].includes('forbidden content')) {
    throw new Error('커스텀 검증 규칙 적용 실패');
  }

  console.log('  ✅ 검증 규칙 테스트 통과\n');
}

// 메인 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  testSessionMemoryLinker()
    .then(() => {
      console.log('🎉 SessionMemoryLinker 모든 테스트 완료!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 테스트 실패:', error);
      process.exit(1);
    });
}

export { testSessionMemoryLinker };
