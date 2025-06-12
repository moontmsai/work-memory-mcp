// work_sessions 테이블 상세 구조 확인
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');

try {
  const db = new Database(dbPath);
  
  console.log('🔍 work_sessions 테이블 상세 분석');
  console.log('='.repeat(50));
  
  // 테이블 정보 상세 확인
  const tableInfo = db.prepare("PRAGMA table_info(work_sessions)").all();
  console.log(`\n📊 총 컬럼 수: ${tableInfo.length}개\n`);
  
  tableInfo.forEach((col, index) => {
    console.log(`${index + 1}. ${col.name}`);
    console.log(`   타입: ${col.type}`);
    console.log(`   NULL 허용: ${col.notnull ? 'NO' : 'YES'}`);
    console.log(`   기본값: ${col.dflt_value || 'NULL'}`);
    console.log(`   PRIMARY KEY: ${col.pk ? 'YES' : 'NO'}`);
    console.log('');
  });
  
  // project_normalized 컬럼 특별 확인
  const projectNormalizedCol = tableInfo.find(col => col.name === 'project_normalized');
  
  if (projectNormalizedCol) {
    console.log('✅ project_normalized 컬럼 발견!');
    console.log(`   인덱스: ${tableInfo.indexOf(projectNormalizedCol) + 1}`);
    console.log(`   세부정보: ${JSON.stringify(projectNormalizedCol, null, 2)}`);
  } else {
    console.log('❌ project_normalized 컬럼을 찾을 수 없음');
  }
  
  // 컬럼명 정확히 나열
  const columnNames = tableInfo.map(col => col.name);
  console.log('\n📝 모든 컬럼명:');
  columnNames.forEach((name, index) => {
    console.log(`  ${index + 1}. "${name}"`);
  });
  
  // project로 시작하는 컬럼들 찾기
  const projectColumns = columnNames.filter(name => name.toLowerCase().includes('project'));
  console.log('\n🎯 project 관련 컬럼들:');
  projectColumns.forEach(name => {
    console.log(`  - "${name}"`);
  });
  
  db.close();
  
} catch (error) {
  console.error('❌ 오류:', error);
}
