// work_sessions 테이블 마이그레이션 실행 스크립트 (CommonJS)
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
  
  // SQL을 세미콜론으로 분리
  const sqlStatements = migrationSql
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'));
  
  console.log(`\n⚡ ${sqlStatements.length}개의 SQL 명령어 실행 중...`);
  
  // 트랜잭션으로 실행
  const transaction = db.transaction(() => {
    let executedCount = 0;
    
    for (const sql of sqlStatements) {
      try {
        console.log(`   ${++executedCount}. 실행: ${sql.substring(0, 50).replace(/\n/g, ' ')}...`);
        db.exec(sql);
        console.log(`   ✅ 성공`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`   ⚠️  이미 존재함 (무시)`);
        } else {
          console.error(`   ❌ 실패: ${error.message}`);
          throw error;
        }
      }
    }
  });
  
  transaction();
  console.log('\n🎉 work_sessions 테이블 생성 완료!');
  
  // work_memories 테이블에 session_id 컬럼 추가
  console.log('\n🔗 work_memories 테이블에 session_id 컬럼 추가...');
  
  try {
    // 테이블 정보 확인
    const tableInfo = db.prepare("PRAGMA table_info(work_memories)").all();
    const hasSessionId = tableInfo.some(col => col.name === 'session_id');
    
    if (!hasSessionId) {
      console.log('   session_id 컬럼 추가 중...');
      db.exec('ALTER TABLE work_memories ADD COLUMN session_id TEXT REFERENCES work_sessions(session_id)');
      console.log('   ✅ session_id 컬럼 추가 완료');
      
      // 인덱스 생성
      console.log('   session_id 인덱스 생성 중...');
      db.exec('CREATE INDEX IF NOT EXISTS idx_work_memories_session_id ON work_memories(session_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_work_memories_session_project ON work_memories(session_id, project)');
      console.log('   ✅ 인덱스 생성 완료');
    } else {
      console.log('   ⚠️  session_id 컬럼이 이미 존재합니다.');
    }
  } catch (error) {
    console.error('   ❌ session_id 컬럼 추가 실패:', error);
    throw error;
  }
  
  // 마이그레이션 완료 확인
  console.log('\n🔍 마이그레이션 결과 확인...');
  
  // work_sessions 테이블 확인
  const workSessionsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_sessions'").get();
  console.log(`   work_sessions 테이블: ${workSessionsExists ? '✅ 존재' : '❌ 없음'}`);
  
  // session_id 컬럼 확인
  const updatedTableInfo = db.prepare("PRAGMA table_info(work_memories)").all();
  const hasSessionIdAfter = updatedTableInfo.some(col => col.name === 'session_id');
  console.log(`   work_memories.session_id: ${hasSessionIdAfter ? '✅ 존재' : '❌ 없음'}`);
  
  // 인덱스 확인
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%session%'").all();
  console.log(`   session 관련 인덱스: ${indexes.length}개`);
  indexes.forEach(idx => {
    console.log(`     - ${idx.name}`);
  });
  
  db.close();
  
  console.log('\n🎊 work_sessions 마이그레이션이 성공적으로 완료되었습니다!');
  console.log('\n다음 단계:');
  console.log('  1. work_memories 테이블의 session_id 컬럼 외래키 설정 (Task 1.4)');
  console.log('  2. 마이그레이션 검증 (Task 1.6)');
  
} catch (error) {
  console.error('\n💥 마이그레이션 실패:', error);
  console.log('\n복구 방법:');
  console.log('  1. 백업 파일을 사용하여 데이터베이스 복원');
  console.log('  2. 마이그레이션 스크립트 수정 후 재시도');
  process.exit(1);
}
