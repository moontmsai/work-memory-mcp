// work_sessions 테이블 완전 분석
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');

try {
  const db = new Database(dbPath);
  
  console.log('🔍 work_sessions 테이블 완전 분석');
  
  // 1. PRAGMA table_info 결과
  console.log('\n1️⃣ PRAGMA table_info 결과:');
  const tableInfo = db.prepare("PRAGMA table_info(work_sessions)").all();
  tableInfo.forEach((col, i) => {
    console.log(`  ${i+1}. ${col.name} (${col.type})`);
  });
  
  // 2. 테이블 CREATE 문 확인
  console.log('\n2️⃣ 테이블 CREATE 문:');
  const createStmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='work_sessions'").get();
  console.log(createStmt?.sql || '찾을 수 없음');
  
  // 3. 실제 SELECT 쿼리로 확인
  console.log('\n3️⃣ SELECT * 쿼리 테스트:');
  try {
    const result = db.prepare('SELECT * FROM work_sessions LIMIT 0').all();
    console.log('테이블 구조 조회 성공');
  } catch (error) {
    console.log('테이블 구조 조회 실패:', error.message);
  }
  
  // 4. project_normalized 컬럼 직접 조회 시도
  console.log('\n4️⃣ project_normalized 컬럼 직접 조회:');
  try {
    const result = db.prepare('SELECT project_normalized FROM work_sessions LIMIT 0').all();
    console.log('✅ project_normalized 컬럼 존재함!');
  } catch (error) {
    console.log('❌ project_normalized 컬럼 없음:', error.message);
  }
  
  // 5. 모든 인덱스 확인
  console.log('\n5️⃣ work_sessions 관련 인덱스:');
  const indexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='work_sessions'").all();
  indexes.forEach(idx => {
    console.log(`  - ${idx.name}`);
    if (idx.sql) console.log(`    ${idx.sql}`);
  });
  
  // 6. 실제 데이터가 있는지 확인
  console.log('\n6️⃣ 테이블 데이터 확인:');
  const count = db.prepare('SELECT COUNT(*) as count FROM work_sessions').get();
  console.log(`총 레코드 수: ${count.count}개`);
  
  if (count.count > 0) {
    console.log('첫 번째 레코드:');
    const first = db.prepare('SELECT * FROM work_sessions LIMIT 1').get();
    console.log(JSON.stringify(first, null, 2));
  }
  
  db.close();
  
} catch (error) {
  console.error('❌ 오류:', error);
}
