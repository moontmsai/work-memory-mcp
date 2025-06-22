// 간단한 히스토리 분석 도구
import { getDatabaseConnection } from './dist/database/index.js';

async function analyzeHistoryTables() {
  console.log('🔍 히스토리 테이블 분석 시작\n');
  
  try {
    const connection = getDatabaseConnection();
    
    // 테이블 목록 확인
    const tables = await connection.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('📋 데이터베이스 테이블:');
    tables.forEach(table => console.log(`  - ${table.name}`));
    
    // change_history 테이블 분석
    console.log('\n📊 change_history 테이블 분석:');
    
    // 총 개수
    const totalHistory = await connection.get('SELECT COUNT(*) as count FROM change_history');
    console.log(`  총 히스토리 레코드: ${totalHistory.count}개`);
    
    // 액션별 분포
    const actionStats = await connection.all(`
      SELECT action, COUNT(*) as count 
      FROM change_history 
      GROUP BY action 
      ORDER BY count DESC
    `);
    console.log('  액션별 분포:');
    actionStats.forEach(stat => {
      console.log(`    - ${stat.action}: ${stat.count}개`);
    });
    
    // 최근 7개 히스토리 (사용자가 보는 것과 동일)
    const recentHistory = await connection.all(`
      SELECT ch.id, ch.memory_id, ch.action, ch.timestamp, wm.id as memory_exists
      FROM change_history ch
      LEFT JOIN work_memories wm ON ch.memory_id = wm.id
      ORDER BY ch.id DESC 
      LIMIT 7
    `);
    
    console.log('\n📅 최근 7개 히스토리 (사용자가 보는 히스토리):');
    recentHistory.forEach((hist, index) => {
      const status = hist.memory_exists ? '✅' : '❌';
      console.log(`  ${index + 1}. ${hist.memory_id} - ${hist.action} ${status} (ID: ${hist.id})`);
    });
    
    // 고아 히스토리 확인 (clean_orphaned_history 대상)
    const orphanedHistory = await connection.get(`
      SELECT COUNT(*) as count 
      FROM change_history ch
      LEFT JOIN work_memories wm ON ch.memory_id = wm.id
      WHERE wm.id IS NULL
    `);
    
    console.log(`\n🧹 고아 히스토리 (clean_orphaned_history 대상): ${orphanedHistory.count}개`);
    
    if (orphanedHistory.count > 0) {
      // 고아 히스토리 샘플
      const orphanedSamples = await connection.all(`
        SELECT ch.memory_id, ch.action, COUNT(*) as count
        FROM change_history ch
        LEFT JOIN work_memories wm ON ch.memory_id = wm.id
        WHERE wm.id IS NULL
        GROUP BY ch.memory_id, ch.action
        ORDER BY count DESC
        LIMIT 5
      `);
      
      console.log('  고아 히스토리 샘플:');
      orphanedSamples.forEach(sample => {
        console.log(`    - ${sample.memory_id}: ${sample.action} 액션 ${sample.count}개`);
      });
    }
    
    // work_memories 개수
    const workMemoriesCount = await connection.get('SELECT COUNT(*) as count FROM work_memories');
    console.log(`\n📝 현재 work_memories: ${workMemoriesCount.count}개`);
    
    // memory_versions 테이블이 있는지 확인
    const hasMemoryVersions = tables.some(t => t.name === 'memory_versions');
    if (hasMemoryVersions) {
      const versionsCount = await connection.get('SELECT COUNT(*) as count FROM memory_versions');
      console.log(`📦 memory_versions: ${versionsCount.count}개`);
      
      if (versionsCount.count > 0) {
        const orphanedVersions = await connection.get(`
          SELECT COUNT(*) as count 
          FROM memory_versions mv
          LEFT JOIN work_memories wm ON mv.memory_id = wm.id
          WHERE wm.id IS NULL
        `);
        console.log(`  고아 버전: ${orphanedVersions.count}개`);
      }
    }
    
    console.log('\n📋 결론:');
    console.log('  🔸 사용자가 보는 7개 히스토리: UI에서 표시되는 최근 change_history 레코드');
    console.log('  🔸 clean_orphaned_history 대상: 삭제된 메모리의 남은 히스토리 레코드');
    console.log(`  🔸 두 데이터는 서로 다른 범위입니다!`);
    
    if (orphanedHistory.count > 0) {
      console.log(`  ⚠️  현재 ${orphanedHistory.count}개의 고아 히스토리가 정리 대상입니다`);
    } else {
      console.log(`  ✅ 현재 고아 히스토리가 없으므로 clean_orphaned_history 실행해도 변화 없음`);
    }
    
  } catch (error) {
    console.error('❌ 분석 중 오류:', error.message);
    console.error('스택:', error.stack);
  }
}

analyzeHistoryTables().catch(console.error);