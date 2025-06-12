// project_normalized 컬럼 추가 (단순 버전)
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');

try {
  const db = new Database(dbPath);
  
  console.log('🔧 project_normalized 컬럼 추가');
  
  // 기존 잘못된 인덱스들 제거
  console.log('🗑️  기존 project_normalized 관련 인덱스 제거...');
  try {
    db.exec('DROP INDEX IF EXISTS idx_work_sessions_project_normalized');
    console.log('✅ 기존 인덱스 제거 완료');
  } catch (e) {
    console.log('⚠️  인덱스 제거 시 오류 (무시): ', e.message);
  }
  
  // 컬럼 추가
  console.log('➕ project_normalized 컬럼 추가...');
  db.exec('ALTER TABLE work_sessions ADD COLUMN project_normalized TEXT');
  console.log('✅ 컬럼 추가 완료');
  
  // 기존 데이터에 대해 값 설정
  console.log('🔄 기존 데이터 업데이트...');
  const updateResult = db.exec(`
    UPDATE work_sessions 
    SET project_normalized = lower(trim(project_name))
    WHERE project_normalized IS NULL
  `);
  console.log('✅ 데이터 업데이트 완료');
  
  // 인덱스 재생성
  console.log('📚 새 인덱스 생성...');
  db.exec('CREATE INDEX IF NOT EXISTS idx_work_sessions_project_normalized ON work_sessions(project_normalized)');
  console.log('✅ 인덱스 생성 완료');
  
  // 확인
  console.log('\n🔍 최종 확인...');
  const tableInfo = db.prepare("PRAGMA table_info(work_sessions)").all();
  const hasProjectNormalized = tableInfo.some(col => col.name === 'project_normalized');
  
  console.log(`총 컬럼 수: ${tableInfo.length}개`);
  console.log(`project_normalized 컬럼: ${hasProjectNormalized ? '✅ 존재' : '❌ 없음'}`);
  
  if (hasProjectNormalized) {
    // 기능 테스트
    const testId = 'test_' + Date.now();
    db.prepare(`
      INSERT INTO work_sessions (session_id, project_name, status)
      VALUES (?, ?, ?)
    `).run(testId, '  Test Project  ', 'active');
    
    const result = db.prepare('SELECT project_name, project_normalized FROM work_sessions WHERE session_id = ?').get(testId);
    console.log(`\n🧪 테스트 결과:`);
    console.log(`  원본: "${result.project_name}"`);
    console.log(`  정규화: "${result.project_normalized}"`);
    
    db.prepare('DELETE FROM work_sessions WHERE session_id = ?').run(testId);
    
    if (result.project_normalized === 'test project') {
      console.log('✅ 정규화 기능 정상 작동');
    }
  }
  
  db.close();
  console.log('\n🎉 project_normalized 컬럼 추가 완료!');
  
} catch (error) {
  console.error('❌ 오류:', error);
}
