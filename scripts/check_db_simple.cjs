// 간단한 데이터베이스 상태 확인 스크립트
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');

console.log('🔍 데이터베이스 상태 확인');
console.log(`📁 DB 경로: ${dbPath}`);

try {
  const db = new Database(dbPath);
  
  // 모든 테이블 조회
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('\n📋 현재 테이블 목록:');
  tables.forEach(table => console.log(`  - ${table.name}`));
  
  // work_sessions 테이블 확인
  const hasWorkSessions = tables.some(t => t.name === 'work_sessions');
  console.log(`\n🎯 work_sessions 테이블: ${hasWorkSessions ? '✅ 존재' : '❌ 없음'}`);
  
  // work_memories 테이블의 session_id 컬럼 확인
  const workMemoriesSchema = db.prepare("PRAGMA table_info(work_memories)").all();
  const hasSessionId = workMemoriesSchema.some(col => col.name === 'session_id');
  console.log(`🔗 work_memories.session_id: ${hasSessionId ? '✅ 존재' : '❌ 없음'}`);
  
  console.log(`\n결론: ${!hasWorkSessions || !hasSessionId ? '마이그레이션 필요' : '마이그레이션 불필요'}`);
  
  db.close();
} catch (error) {
  console.error('❌ 오류:', error.message);
}
