// 수정된 스키마 검증 스크립트 (project_normalized 직접 확인)
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');

console.log('🔍 최종 스키마 변경 검증');
console.log('='.repeat(50));

let testsPassed = 0;
let testsTotal = 0;

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
    }
  } catch (error) {
    console.log(`   ❌ 오류: ${error.message}`);
  }
}

try {
  const db = new Database(dbPath);
  
  console.log('\n📋 핵심 검증 항목');
  
  runTest('work_sessions 테이블 존재', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_sessions'").get();
    return result ? true : 'work_sessions 테이블 없음';
  });
  
  runTest('work_memories.session_id 컬럼 존재', () => {
    const tableInfo = db.prepare("PRAGMA table_info(work_memories)").all();
    const hasSessionId = tableInfo.some(col => col.name === 'session_id');
    return hasSessionId ? true : 'session_id 컬럼 없음';
  });
  
  runTest('project_normalized 컬럼 기능 확인', () => {
    try {
      // 직접 SELECT로 확인
      db.prepare('SELECT project_normalized FROM work_sessions LIMIT 0').all();
      return true;
    } catch (error) {
      return 'project_normalized 컬럼 접근 실패';
    }
  });
  
  runTest('필수 인덱스 존재 확인', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
    const indexNames = indexes.map(idx => idx.name);
    
    const requiredIndexes = [
      'idx_work_sessions_project_name',
      'idx_work_sessions_status',
      'idx_work_memories_session_id'
    ];
    
    for (const reqIndex of requiredIndexes) {
      if (!indexNames.includes(reqIndex)) {
        return `${reqIndex} 인덱스 없음`;
      }
    }
    return true;
  });
  
  runTest('데이터 삽입/조회 기능 테스트', () => {
    const testSessionId = 'final_test_' + Date.now();
    const testMemoryId = 'final_memory_' + Date.now();
    
    try {
      // 세션 생성
      db.prepare(`
        INSERT INTO work_sessions (session_id, project_name, status)
        VALUES (?, ?, ?)
      `).run(testSessionId, 'Final Test Project', 'active');
      
      // 메모리 생성 (session_id 연결)
      db.prepare(`
        INSERT INTO work_memories (id, content, session_id, project)
        VALUES (?, ?, ?, ?)
      `).run(testMemoryId, 'Final test content', testSessionId, 'Final Test Project');
      
      // JOIN 쿼리 테스트
      const joined = db.prepare(`
        SELECT 
          m.content,
          s.project_name,
          s.project_normalized,
          s.status
        FROM work_memories m
        JOIN work_sessions s ON m.session_id = s.session_id
        WHERE m.id = ?
      `).get(testMemoryId);
      
      // 검증
      if (!joined) return 'JOIN 쿼리 실패';
      if (joined.project_name !== 'Final Test Project') return '프로젝트명 불일치';
      if (joined.project_normalized !== 'final test project') return 'project_normalized 실패';
      if (joined.status !== 'active') return '상태값 불일치';
      
      // 정리
      db.prepare('DELETE FROM work_memories WHERE id = ?').run(testMemoryId);
      db.prepare('DELETE FROM work_sessions WHERE session_id = ?').run(testSessionId);
      
      return true;
    } catch (error) {
      return `기능 테스트 실패: ${error.message}`;
    }
  });
  
  runTest('성능 최적화 확인', () => {
    try {
      // 인덱스 사용 확인
      const queryPlan = db.prepare(`
        EXPLAIN QUERY PLAN 
        SELECT * FROM work_sessions WHERE project_name = 'test'
      `).all();
      
      const usesIndex = queryPlan.some(step => 
        step.detail && step.detail.includes('idx_work_sessions_project_name')
      );
      
      return usesIndex ? true : '인덱스 최적화 미적용';
    } catch (error) {
      return `성능 테스트 실패: ${error.message}`;
    }
  });
  
  db.close();
  
  // 최종 결과
  console.log('\n' + '='.repeat(50));
  console.log('📊 최종 검증 결과');
  console.log('='.repeat(50));
  console.log(`총 테스트: ${testsTotal}개`);
  console.log(`성공: ${testsPassed}개`);
  console.log(`실패: ${testsTotal - testsPassed}개`);
  
  const successRate = (testsPassed / testsTotal * 100).toFixed(1);
  console.log(`성공률: ${successRate}%`);
  
  if (testsPassed === testsTotal) {
    console.log('\n🎉 모든 스키마 변경이 성공적으로 검증되었습니다!');
    console.log('\n✅ 검증 완료 항목:');
    console.log('  - work_sessions 테이블 완전 생성');
    console.log('  - work_memories.session_id 컬럼 추가');
    console.log('  - project_normalized GENERATED 컬럼 정상 작동');
    console.log('  - 모든 인덱스 생성 및 최적화');
    console.log('  - 테이블 간 JOIN 연산 정상');
    console.log('  - 데이터 무결성 보장');
    
    return true;
  } else {
    console.log('\n⚠️  일부 검증 실패');
    return false;
  }
  
} catch (error) {
  console.error('\n💥 검증 실패:', error);
  return false;
}
