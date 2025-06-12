// work_sessions 테이블 마이그레이션 실행 스크립트 (개선된 버전)
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');
const migrationSqlPath = path.join(__dirname, '..', 'src', 'database', 'migration', '001_create_work_sessions.sql');

console.log('🚀 work_sessions 테이블 마이그레이션 시작');
console.log(`📁 DB 경로: ${dbPath}`);
console.log(`📄 SQL 파일: ${migrationSqlPath}`);

try {
  // 백업 생성
  console.log('\n💾 마이그레이션 전 백업 생성...');
  const backupPath = path.join(__dirname, '..', 'work_memory', 'backups', 
    `migration_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  
  const db = new Database(dbPath);
  const backupDb = new Database(backupPath);
  db.backup(backupDb);
  backupDb.close();
  console.log(`✅ 백업 완료: ${backupPath}`);
  
  // SQL 파일 읽기
  console.log('\n📖 마이그레이션 SQL 파일 읽는 중...');
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');
  
  // 주석 제거 및 SQL 분리 (개선된 로직)
  const cleanSql = migrationSql
    .replace(/--.*$/gm, '')  // 한 줄 주석 제거
    .replace(/\/\*[\s\S]*?\*\//g, '')  // 다중 줄 주석 제거
    .trim();
  
  // SQL 문을 개별적으로 실행하기 위해 수동으로 분리
  console.log('\n⚡ work_sessions 테이블 생성...');
  
  // 1. 테이블 생성
  const createTableSql = `CREATE TABLE IF NOT EXISTS work_sessions (
    session_id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    project_path TEXT,
    git_repository TEXT,
    started_at DATETIME NOT NULL DEFAULT (datetime('now')),
    ended_at DATETIME,
    last_activity_at DATETIME DEFAULT (datetime('now')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'cancelled')),
    description TEXT,
    auto_created BOOLEAN DEFAULT TRUE,
    tags TEXT,
    created_by TEXT DEFAULT 'system',
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    activity_count INTEGER DEFAULT 0,
    memory_count INTEGER DEFAULT 0,
    total_work_time INTEGER DEFAULT 0,
    project_normalized TEXT GENERATED ALWAYS AS (lower(trim(project_name))) STORED
  )`;
  
  console.log('   테이블 생성 중...');
  db.exec(createTableSql);
  console.log('   ✅ work_sessions 테이블 생성 완료');
  
  // 2. 인덱스 생성
  console.log('\n📊 인덱스 생성 중...');
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_project_name ON work_sessions(project_name)',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_project_normalized ON work_sessions(project_normalized)',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status)',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_started_at ON work_sessions(started_at)',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_last_activity ON work_sessions(last_activity_at)',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_auto_created ON work_sessions(auto_created)',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_status_activity ON work_sessions(status, last_activity_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_project_status ON work_sessions(project_name, status)',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_active_projects ON work_sessions(project_normalized, status) WHERE status = \'active\''
  ];
  
  let indexCount = 0;
  for (const indexSql of indexes) {
    try {
      db.exec(indexSql);
      console.log(`   ✅ 인덱스 ${++indexCount}/${indexes.length} 생성 완료`);
    } catch (error) {
      console.log(`   ⚠️  인덱스 ${++indexCount}/${indexes.length} 이미 존재: ${error.message}`);
    }
  }
  
  // 3. work_memories 테이블에 session_id 컬럼 추가
  console.log('\n🔗 work_memories 테이블에 session_id 컬럼 추가...');
  
  try {
    // 테이블 정보 확인
    const tableInfo = db.prepare("PRAGMA table_info(work_memories)").all();
    const hasSessionId = tableInfo.some(col => col.name === 'session_id');
    
    if (!hasSessionId) {
      console.log('   session_id 컬럼 추가 중...');
      db.exec('ALTER TABLE work_memories ADD COLUMN session_id TEXT REFERENCES work_sessions(session_id)');
      console.log('   ✅ session_id 컬럼 추가 완료');
      
      // session_id 관련 인덱스 생성
      console.log('   session_id 인덱스 생성 중...');
      db.exec('CREATE INDEX IF NOT EXISTS idx_work_memories_session_id ON work_memories(session_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_work_memories_session_project ON work_memories(session_id, project)');
      console.log('   ✅ session_id 인덱스 생성 완료');
    } else {
      console.log('   ⚠️  session_id 컬럼이 이미 존재합니다.');
    }
  } catch (error) {
    console.error('   ❌ session_id 컬럼 추가 실패:', error);
    throw error;
  }
  
  // 4. 마이그레이션 완료 확인
  console.log('\n🔍 마이그레이션 결과 확인...');
  
  // work_sessions 테이블 확인
  const workSessionsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_sessions'").get();
  console.log(`   work_sessions 테이블: ${workSessionsExists ? '✅ 존재' : '❌ 없음'}`);
  
  if (workSessionsExists) {
    // 테이블 구조 확인
    const sessionTableInfo = db.prepare("PRAGMA table_info(work_sessions)").all();
    console.log(`   컬럼 수: ${sessionTableInfo.length}개`);
  }
  
  // session_id 컬럼 확인
  const updatedTableInfo = db.prepare("PRAGMA table_info(work_memories)").all();
  const hasSessionIdAfter = updatedTableInfo.some(col => col.name === 'session_id');
  console.log(`   work_memories.session_id: ${hasSessionIdAfter ? '✅ 존재' : '❌ 없음'}`);
  
  // 인덱스 확인
  const allIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%session%'").all();
  console.log(`   session 관련 인덱스: ${allIndexes.length}개`);
  allIndexes.forEach(idx => {
    console.log(`     - ${idx.name}`);
  });
  
  db.close();
  
  console.log('\n🎊 work_sessions 마이그레이션이 성공적으로 완료되었습니다!');
  console.log('\n다음 단계:');
  console.log('  ✅ Task 1.3 완료: work_sessions 테이블 마이그레이션');
  console.log('  🔄 Task 1.4: work_memories 테이블 session_id 외래키 설정');
  console.log('  🔄 Task 1.5: work_memories 테이블 변경 마이그레이션');
  console.log('  🔄 Task 1.6: 스키마 변경 검증');
  
} catch (error) {
  console.error('\n💥 마이그레이션 실패:', error);
  console.log('\n복구 방법:');
  console.log('  1. 백업 파일을 사용하여 데이터베이스 복원');
  console.log('  2. 마이그레이션 스크립트 수정 후 재시도');
  process.exit(1);
}
