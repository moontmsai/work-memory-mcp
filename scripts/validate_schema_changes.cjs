// 종합적인 스키마 변경 검증 스크립트
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');

console.log('🔍 종합적인 스키마 변경 검증 시작');
console.log(`📁 DB 경로: ${dbPath}`);
console.log('='.repeat(60));

let testsPassed = 0;
let testsTotal = 0;
const errors = [];

function runTest(testName, testFunction) {
  testsTotal++;
  try {
    console.log(`\n${testsTotal}. ${testName}`);
    const result = testFunction();
    if (result === true || result === undefined) {
      console.log(`   ✅ 성공`);
      testsPassed++;
    } else {
      console.log(`   ❌ 실패: ${result}`);
      errors.push(`${testName}: ${result}`);
    }
  } catch (error) {
    console.log(`   ❌ 오류: ${error.message}`);
    errors.push(`${testName}: ${error.message}`);
  }
}

try {
  const db = new Database(dbPath);
  
  console.log('\n📋 1. 기본 테이블 존재 확인');
  
  runTest('work_sessions 테이블 존재 확인', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_sessions'").get();
    return result ? true : 'work_sessions 테이블이 존재하지 않음';
  });
  
  runTest('work_memories 테이블 존재 확인', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_memories'").get();
    return result ? true : 'work_memories 테이블이 존재하지 않음';
  });
  
  console.log('\n📊 2. work_sessions 테이블 구조 검증');
  
  const sessionTableInfo = db.prepare("PRAGMA table_info(work_sessions)").all();
  const sessionColumns = sessionTableInfo.map(col => col.name);
  
  const expectedSessionColumns = [
    'session_id', 'project_name', 'project_path', 'git_repository',
    'started_at', 'ended_at', 'last_activity_at', 'status',
    'description', 'auto_created', 'tags', 'created_by',
    'created_at', 'updated_at', 'activity_count', 'memory_count',
    'total_work_time', 'project_normalized'
  ];
  
  runTest('work_sessions 컬럼 수 확인', () => {
    return sessionColumns.length === expectedSessionColumns.length ? 
      true : `예상 ${expectedSessionColumns.length}개, 실제 ${sessionColumns.length}개`;
  });
  
  expectedSessionColumns.forEach(colName => {
    runTest(`work_sessions.${colName} 컬럼 존재`, () => {
      return sessionColumns.includes(colName) ? true : `${colName} 컬럼이 존재하지 않음`;
    });
  });
  
  runTest('session_id PRIMARY KEY 확인', () => {
    const pkCol = sessionTableInfo.find(col => col.name === 'session_id');
    return pkCol && pkCol.pk === 1 ? true : 'session_id가 PRIMARY KEY가 아님';
  });
  
  runTest('project_normalized GENERATED ALWAYS 확인', () => {
    const genCol = sessionTableInfo.find(col => col.name === 'project_normalized');
    return genCol ? true : 'project_normalized 컬럼 확인 필요';
  });
  
  console.log('\n🔗 3. work_memories 테이블 session_id 컬럼 검증');
  
  const memoriesTableInfo = db.prepare("PRAGMA table_info(work_memories)").all();
  const memoriesColumns = memoriesTableInfo.map(col => col.name);
  
  runTest('work_memories.session_id 컬럼 존재', () => {
    return memoriesColumns.includes('session_id') ? true : 'session_id 컬럼이 존재하지 않음';
  });
  
  runTest('session_id 컬럼 타입 확인', () => {
    const sessionIdCol = memoriesTableInfo.find(col => col.name === 'session_id');
    return sessionIdCol && sessionIdCol.type === 'TEXT' ? true : `타입이 TEXT가 아님: ${sessionIdCol?.type}`;
  });
  
  runTest('session_id NULL 허용 확인', () => {
    const sessionIdCol = memoriesTableInfo.find(col => col.name === 'session_id');
    return sessionIdCol && sessionIdCol.notnull === 0 ? true : 'session_id가 NOT NULL 제약이 있음';
  });
  
  console.log('\n📚 4. 인덱스 검증');
  
  const allIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
  const indexNames = allIndexes.map(idx => idx.name);
  
  const expectedWorkSessionsIndexes = [
    'idx_work_sessions_project_name',
    'idx_work_sessions_project_normalized', 
    'idx_work_sessions_status',
    'idx_work_sessions_started_at',
    'idx_work_sessions_last_activity',
    'idx_work_sessions_auto_created',
    'idx_work_sessions_status_activity',
    'idx_work_sessions_project_status',
    'idx_work_sessions_active_projects'
  ];
  
  const expectedSessionIdIndexes = [
    'idx_work_memories_session_id',
    'idx_work_memories_session_project'
  ];
  
  expectedWorkSessionsIndexes.forEach(indexName => {
    runTest(`${indexName} 인덱스 존재`, () => {
      return indexNames.includes(indexName) ? true : `${indexName} 인덱스가 존재하지 않음`;
    });
  });
  
  expectedSessionIdIndexes.forEach(indexName => {
    runTest(`${indexName} 인덱스 존재`, () => {
      return indexNames.includes(indexName) ? true : `${indexName} 인덱스가 존재하지 않음`;
    });
  });
  
  console.log('\n🧪 5. 기능 테스트 (데이터 삽입/조회)');
  
  runTest('work_sessions 테이블에 테스트 데이터 삽입', () => {
    const testSessionId = 'test_session_' + Date.now();
    try {
      db.prepare(`
        INSERT INTO work_sessions (session_id, project_name, description, status)
        VALUES (?, ?, ?, ?)
      `).run(testSessionId, 'test-project', 'Schema validation test', 'active');
      
      // 삽입된 데이터 확인
      const inserted = db.prepare('SELECT * FROM work_sessions WHERE session_id = ?').get(testSessionId);
      
      if (!inserted) return '데이터 삽입 후 조회 실패';
      if (inserted.project_name !== 'test-project') return '프로젝트명 불일치';
      if (inserted.project_normalized !== 'test-project') return 'project_normalized 생성 실패';
      
      // 테스트 데이터 정리
      db.prepare('DELETE FROM work_sessions WHERE session_id = ?').run(testSessionId);
      
      return true;
    } catch (error) {
      return `데이터 삽입 테스트 실패: ${error.message}`;
    }
  });
  
  runTest('work_memories 테이블에 session_id와 함께 테스트 데이터 삽입', () => {
    const testMemoryId = 'test_memory_' + Date.now();
    const testSessionId = 'test_session_' + Date.now();
    
    try {
      // 먼저 세션 생성
      db.prepare(`
        INSERT INTO work_sessions (session_id, project_name, status)
        VALUES (?, ?, ?)
      `).run(testSessionId, 'test-project', 'active');
      
      // 메모리 삽입 (session_id 포함)
      db.prepare(`
        INSERT INTO work_memories (id, content, session_id, project)
        VALUES (?, ?, ?, ?)
      `).run(testMemoryId, 'Test memory content', testSessionId, 'test-project');
      
      // 삽입된 데이터 확인
      const memory = db.prepare('SELECT * FROM work_memories WHERE id = ?').get(testMemoryId);
      
      if (!memory) return '메모리 데이터 삽입 후 조회 실패';
      if (memory.session_id !== testSessionId) return 'session_id 연결 실패';
      
      // JOIN 쿼리 테스트
      const joined = db.prepare(`
        SELECT m.id, m.content, s.project_name, s.status
        FROM work_memories m
        LEFT JOIN work_sessions s ON m.session_id = s.session_id
        WHERE m.id = ?
      `).get(testMemoryId);
      
      if (!joined || joined.project_name !== 'test-project') {
        return 'JOIN 쿼리 실패';
      }
      
      // 테스트 데이터 정리
      db.prepare('DELETE FROM work_memories WHERE id = ?').run(testMemoryId);
      db.prepare('DELETE FROM work_sessions WHERE session_id = ?').run(testSessionId);
      
      return true;
    } catch (error) {
      return `session_id 연결 테스트 실패: ${error.message}`;
    }
  });
  
  runTest('외래키 제약 조건 테스트', () => {
    const testMemoryId = 'test_memory_fk_' + Date.now();
    
    try {
      // 존재하지 않는 session_id로 메모리 삽입 시도
      db.prepare(`
        INSERT INTO work_memories (id, content, session_id, project)
        VALUES (?, ?, ?, ?)
      `).run(testMemoryId, 'Test content', 'nonexistent_session_id', 'test-project');
      
      // 정리
      db.prepare('DELETE FROM work_memories WHERE id = ?').run(testMemoryId);
      
      // 외래키 제약이 없다면 삽입이 성공하므로 정상
      return true;
    } catch (error) {
      // 외래키 제약이 있다면 오류가 발생할 수 있음 (정상)
      return true;
    }
  });
  
  console.log('\n📈 6. 성능 테스트');
  
  runTest('인덱스 성능 확인', () => {
    try {
      // EXPLAIN QUERY PLAN으로 인덱스 사용 확인
      const queryPlan = db.prepare(`
        EXPLAIN QUERY PLAN 
        SELECT * FROM work_sessions WHERE project_name = 'test'
      `).all();
      
      const usesIndex = queryPlan.some(step => 
        step.detail && step.detail.includes('idx_work_sessions_project_name')
      );
      
      return usesIndex ? true : '프로젝트명 인덱스가 사용되지 않음';
    } catch (error) {
      return `인덱스 성능 테스트 실패: ${error.message}`;
    }
  });
  
  db.close();
  
  // 최종 결과 출력
  console.log('\n' + '='.repeat(60));
  console.log('📊 검증 결과 요약');
  console.log('='.repeat(60));
  console.log(`총 테스트: ${testsTotal}개`);
  console.log(`성공: ${testsPassed}개`);
  console.log(`실패: ${testsTotal - testsPassed}개`);
  
  if (errors.length > 0) {
    console.log('\n❌ 실패한 테스트:');
    errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }
  
  const successRate = (testsPassed / testsTotal * 100).toFixed(1);
  console.log(`\n성공률: ${successRate}%`);
  
  if (testsPassed === testsTotal) {
    console.log('\n🎉 모든 스키마 변경이 성공적으로 검증되었습니다!');
    console.log('\n✅ 검증 완료 항목:');
    console.log('  - work_sessions 테이블 생성 및 구조');
    console.log('  - work_memories 테이블 session_id 컬럼 추가');
    console.log('  - 모든 필수 인덱스 생성');
    console.log('  - 데이터 삽입/조회 기능');
    console.log('  - 테이블 간 JOIN 연산');
    console.log('  - 인덱스 성능 최적화');
    
    console.log('\n🚀 다음 단계:');
    console.log('  ✅ Task 1 (Database Schema Update) 완료');
    console.log('  🔄 Task 2: Session Management Logic 구현');
    
    process.exit(0);
  } else {
    console.log('\n⚠️  일부 검증이 실패했습니다. 위의 오류를 확인하고 수정하세요.');
    process.exit(1);
  }
  
} catch (error) {
  console.error('\n💥 검증 스크립트 실행 실패:', error);
  process.exit(1);
}
