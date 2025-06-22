// 히스토리 테이블 분석 스크립트
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'work_memory', 'database.sqlite');

console.log('🔍 히스토리 테이블 분석');
console.log(`📁 DB 경로: ${dbPath}`);

try {
  const db = new Database(dbPath);
  
  // 모든 테이블 조회
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('\n📋 현재 테이블 목록:');
  tables.forEach(table => console.log(`  - ${table.name}`));
  
  // 히스토리 관련 테이블 확인
  const historyTables = ['change_history', 'memory_versions', 'work_memory_versions'];
  const existingHistoryTables = historyTables.filter(tableName => 
    tables.some(t => t.name === tableName)
  );
  
  console.log('\n🗂️ 히스토리 관련 테이블:');
  historyTables.forEach(tableName => {
    const exists = existingHistoryTables.includes(tableName);
    console.log(`  - ${tableName}: ${exists ? '✅ 존재' : '❌ 없음'}`);
  });
  
  // change_history 테이블 분석
  if (existingHistoryTables.includes('change_history')) {
    console.log('\n📊 change_history 테이블 분석:');
    
    // 스키마 확인
    const changeHistorySchema = db.prepare("PRAGMA table_info(change_history)").all();
    console.log('  스키마:');
    changeHistorySchema.forEach(col => {
      console.log(`    - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    // 데이터 개수
    const changeHistoryCount = db.prepare("SELECT COUNT(*) as count FROM change_history").get();
    console.log(`  총 레코드 수: ${changeHistoryCount.count}개`);
    
    // 액션별 분포
    const actionStats = db.prepare(`
      SELECT action, COUNT(*) as count 
      FROM change_history 
      GROUP BY action 
      ORDER BY count DESC
    `).all();
    console.log(`  액션별 분포:`);
    actionStats.forEach(stat => {
      console.log(`    - ${stat.action}: ${stat.count}개`);
    });
    
    // 고아 히스토리 확인 (work_memories와 조인)
    const orphanedHistory = db.prepare(`
      SELECT COUNT(*) as count 
      FROM change_history ch
      LEFT JOIN work_memories wm ON ch.memory_id = wm.id
      WHERE wm.id IS NULL
    `).get();
    console.log(`  고아 히스토리 (메모리 없음): ${orphanedHistory.count}개`);
    
    // 최근 히스토리 샘플
    const recentHistory = db.prepare(`
      SELECT memory_id, action, timestamp 
      FROM change_history 
      ORDER BY id DESC 
      LIMIT 5
    `).all();
    console.log(`  최근 히스토리 샘플:`);
    recentHistory.forEach(hist => {
      console.log(`    - ${hist.memory_id} ${hist.action} ${hist.timestamp}`);
    });
  }
  
  // memory_versions 테이블 분석
  if (existingHistoryTables.includes('memory_versions')) {
    console.log('\n📊 memory_versions 테이블 분석:');
    
    // 스키마 확인
    const memoryVersionsSchema = db.prepare("PRAGMA table_info(memory_versions)").all();
    console.log('  스키마:');
    memoryVersionsSchema.forEach(col => {
      console.log(`    - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    // 데이터 개수
    const memoryVersionsCount = db.prepare("SELECT COUNT(*) as count FROM memory_versions").get();
    console.log(`  총 레코드 수: ${memoryVersionsCount.count}개`);
    
    // 메모리별 버전 분포
    const versionStats = db.prepare(`
      SELECT memory_id, COUNT(*) as version_count
      FROM memory_versions 
      GROUP BY memory_id 
      ORDER BY version_count DESC 
      LIMIT 10
    `).all();
    console.log(`  메모리별 버전 수 (상위 10개):`);
    versionStats.forEach(stat => {
      console.log(`    - ${stat.memory_id}: ${stat.version_count}개 버전`);
    });
    
    // 고아 버전 확인 (work_memories와 조인)
    const orphanedVersions = db.prepare(`
      SELECT COUNT(*) as count 
      FROM memory_versions mv
      LEFT JOIN work_memories wm ON mv.memory_id = wm.id
      WHERE wm.id IS NULL
    `).get();
    console.log(`  고아 버전 (메모리 없음): ${orphanedVersions.count}개`);
  }
  
  // work_memory_versions 테이블 (있다면) 분석
  if (existingHistoryTables.includes('work_memory_versions')) {
    console.log('\n📊 work_memory_versions 테이블 분석:');
    
    const workMemoryVersionsSchema = db.prepare("PRAGMA table_info(work_memory_versions)").all();
    console.log('  스키마:');
    workMemoryVersionsSchema.forEach(col => {
      console.log(`    - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
    });
    
    const workMemoryVersionsCount = db.prepare("SELECT COUNT(*) as count FROM work_memory_versions").get();
    console.log(`  총 레코드 수: ${workMemoryVersionsCount.count}개`);
  }
  
  // work_memories 테이블 확인
  const workMemoriesCount = db.prepare("SELECT COUNT(*) as count FROM work_memories").get();
  console.log(`\n📝 work_memories 총 개수: ${workMemoriesCount.count}개`);
  
  // 두 테이블의 관계 분석
  if (existingHistoryTables.includes('change_history') && existingHistoryTables.includes('memory_versions')) {
    console.log('\n🔗 테이블 간 관계 분석:');
    
    // change_history의 고유 memory_id 수
    const uniqueHistoryMemories = db.prepare(`
      SELECT COUNT(DISTINCT memory_id) as count FROM change_history
    `).get();
    
    // memory_versions의 고유 memory_id 수
    const uniqueVersionMemories = db.prepare(`
      SELECT COUNT(DISTINCT memory_id) as count FROM memory_versions
    `).get();
    
    console.log(`  change_history의 고유 메모리 수: ${uniqueHistoryMemories.count}개`);
    console.log(`  memory_versions의 고유 메모리 수: ${uniqueVersionMemories.count}개`);
    
    // 두 테이블 모두에 있는 메모리
    const commonMemories = db.prepare(`
      SELECT COUNT(DISTINCT ch.memory_id) as count
      FROM change_history ch
      INNER JOIN memory_versions mv ON ch.memory_id = mv.memory_id
    `).get();
    
    console.log(`  두 테이블 모두에 있는 메모리: ${commonMemories.count}개`);
    
    // change_history에만 있는 메모리
    const historyOnlyMemories = db.prepare(`
      SELECT COUNT(DISTINCT ch.memory_id) as count
      FROM change_history ch
      LEFT JOIN memory_versions mv ON ch.memory_id = mv.memory_id
      WHERE mv.memory_id IS NULL
    `).get();
    
    console.log(`  change_history에만 있는 메모리: ${historyOnlyMemories.count}개`);
    
    // memory_versions에만 있는 메모리
    const versionsOnlyMemories = db.prepare(`
      SELECT COUNT(DISTINCT mv.memory_id) as count
      FROM memory_versions mv
      LEFT JOIN change_history ch ON mv.memory_id = ch.memory_id
      WHERE ch.memory_id IS NULL
    `).get();
    
    console.log(`  memory_versions에만 있는 메모리: ${versionsOnlyMemories.count}개`);
  }
  
  // 결론
  console.log('\n📋 분석 결과:');
  console.log(`  - 현재 시스템에는 ${existingHistoryTables.length}개의 히스토리 테이블이 있습니다`);
  console.log(`  - 사용자가 보고 있는 7개 히스토리는 아마도 UI에서 표시되는 최근 히스토리일 것입니다`);
  console.log(`  - clean_orphaned_history는 ${existingHistoryTables.includes('change_history') ? 'change_history' : '알 수 없는'} 테이블을 대상으로 합니다`);
  
  if (existingHistoryTables.includes('change_history')) {
    const orphanedHistory = db.prepare(`
      SELECT COUNT(*) as count 
      FROM change_history ch
      LEFT JOIN work_memories wm ON ch.memory_id = wm.id
      WHERE wm.id IS NULL
    `).get();
    console.log(`  - 정리 대상 고아 히스토리: ${orphanedHistory.count}개`);
  }
  
  db.close();
} catch (error) {
  console.error('❌ 오류:', error.message);
}