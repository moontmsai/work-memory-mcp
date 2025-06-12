// project_normalized 컬럼 추가 스크립트
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');

console.log('🔧 project_normalized 컬럼 추가 작업');
console.log(`📁 DB 경로: ${dbPath}`);

try {
  const db = new Database(dbPath);
  
  // 현재 work_sessions 테이블 구조 확인
  console.log('\n📊 현재 work_sessions 테이블 구조 확인...');
  const tableInfo = db.prepare("PRAGMA table_info(work_sessions)").all();
  console.log(`현재 컬럼 수: ${tableInfo.length}개`);
  
  tableInfo.forEach(col => {
    console.log(`  - ${col.name}: ${col.type}`);
  });
  
  // project_normalized 컬럼 존재 확인
  const hasProjectNormalized = tableInfo.some(col => col.name === 'project_normalized');
  
  if (hasProjectNormalized) {
    console.log('\n⚠️  project_normalized 컬럼이 이미 존재합니다.');
  } else {
    console.log('\n➕ project_normalized 컬럼 추가 중...');
    
    try {
      // SQLite에서 GENERATED ALWAYS 컬럼 추가
      db.exec(`
        ALTER TABLE work_sessions 
        ADD COLUMN project_normalized TEXT GENERATED ALWAYS AS (lower(trim(project_name))) STORED
      `);
      
      console.log('✅ project_normalized 컬럼 추가 완료');
      
      // 인덱스도 다시 생성
      console.log('📚 project_normalized 인덱스 생성 중...');
      db.exec('CREATE INDEX IF NOT EXISTS idx_work_sessions_project_normalized ON work_sessions(project_normalized)');
      console.log('✅ 인덱스 생성 완료');
      
    } catch (error) {
      console.log('⚠️  GENERATED ALWAYS 구문이 지원되지 않는 경우, 일반 컬럼으로 추가...');
      
      // 일반 TEXT 컬럼으로 추가
      db.exec('ALTER TABLE work_sessions ADD COLUMN project_normalized TEXT');
      
      // 기존 데이터에 대해 값 업데이트
      db.exec(`
        UPDATE work_sessions 
        SET project_normalized = lower(trim(project_name))
        WHERE project_normalized IS NULL
      `);
      
      console.log('✅ project_normalized 컬럼 추가 및 데이터 업데이트 완료');
      
      // 인덱스 생성
      db.exec('CREATE INDEX IF NOT EXISTS idx_work_sessions_project_normalized ON work_sessions(project_normalized)');
      console.log('✅ 인덱스 생성 완료');
    }
  }
  
  // 최종 확인
  console.log('\n🔍 최종 테이블 구조 확인...');
  const finalTableInfo = db.prepare("PRAGMA table_info(work_sessions)").all();
  console.log(`최종 컬럼 수: ${finalTableInfo.length}개`);
  
  const hasProjectNormalizedFinal = finalTableInfo.some(col => col.name === 'project_normalized');
  console.log(`project_normalized 컬럼: ${hasProjectNormalizedFinal ? '✅ 존재' : '❌ 없음'}`);
  
  if (hasProjectNormalizedFinal) {
    // 테스트 데이터로 기능 확인
    console.log('\n🧪 기능 테스트...');
    const testSessionId = 'test_' + Date.now();
    
    db.prepare(`
      INSERT INTO work_sessions (session_id, project_name, status)
      VALUES (?, ?, ?)
    `).run(testSessionId, 'Test Project', 'active');
    
    const result = db.prepare('SELECT project_name, project_normalized FROM work_sessions WHERE session_id = ?').get(testSessionId);
    
    console.log(`원본: "${result.project_name}"`);
    console.log(`정규화: "${result.project_normalized}"`);
    
    // 테스트 데이터 정리
    db.prepare('DELETE FROM work_sessions WHERE session_id = ?').run(testSessionId);
    
    if (result.project_normalized === 'test project') {
      console.log('✅ project_normalized 기능 정상 작동');
    } else {
      console.log('⚠️  project_normalized 기능 확인 필요');
    }
  }
  
  db.close();
  console.log('\n🎉 project_normalized 컬럼 작업 완료!');
  
} catch (error) {
  console.error('❌ 오류:', error);
  process.exit(1);
}
