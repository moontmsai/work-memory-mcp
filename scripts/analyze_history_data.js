// 히스토리 데이터 분석 스크립트 (ES modules)
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');

console.log('🔍 히스토리 테이블 분석');
console.log(`📁 DB 경로: ${dbPath}`);

// Promise 래퍼 함수들
function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getRow(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function analyzeDatabase() {
  const db = new sqlite3.Database(dbPath);
  
  try {
    // 모든 테이블 조회
    const tables = await runQuery(db, "SELECT name FROM sqlite_master WHERE type='table'");
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
      const changeHistorySchema = await runQuery(db, "PRAGMA table_info(change_history)");
      console.log('  스키마:');
      changeHistorySchema.forEach(col => {
        console.log(`    - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });
      
      // 데이터 개수
      const changeHistoryCount = await getRow(db, "SELECT COUNT(*) as count FROM change_history");
      console.log(`  총 레코드 수: ${changeHistoryCount.count}개`);
      
      // 액션별 분포
      const actionStats = await runQuery(db, `
        SELECT action, COUNT(*) as count 
        FROM change_history 
        GROUP BY action 
        ORDER BY count DESC
      `);
      console.log(`  액션별 분포:`);
      actionStats.forEach(stat => {
        console.log(`    - ${stat.action}: ${stat.count}개`);
      });
      
      // 고아 히스토리 확인 (work_memories와 조인)
      const orphanedHistory = await getRow(db, `
        SELECT COUNT(*) as count 
        FROM change_history ch
        LEFT JOIN work_memories wm ON ch.memory_id = wm.id
        WHERE wm.id IS NULL
      `);
      console.log(`  고아 히스토리 (메모리 없음): ${orphanedHistory.count}개`);
      
      // 최근 히스토리 샘플
      const recentHistory = await runQuery(db, `
        SELECT memory_id, action, timestamp 
        FROM change_history 
        ORDER BY id DESC 
        LIMIT 7
      `);
      console.log(`  최근 히스토리 샘플 (7개):`);
      recentHistory.forEach(hist => {
        console.log(`    - ${hist.memory_id} ${hist.action} ${hist.timestamp}`);
      });
    }
    
    // memory_versions 테이블 분석
    if (existingHistoryTables.includes('memory_versions')) {
      console.log('\n📊 memory_versions 테이블 분석:');
      
      // 스키마 확인
      const memoryVersionsSchema = await runQuery(db, "PRAGMA table_info(memory_versions)");
      console.log('  스키마:');
      memoryVersionsSchema.forEach(col => {
        console.log(`    - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });
      
      // 데이터 개수
      const memoryVersionsCount = await getRow(db, "SELECT COUNT(*) as count FROM memory_versions");
      console.log(`  총 레코드 수: ${memoryVersionsCount.count}개`);
      
      if (memoryVersionsCount.count > 0) {
        // 메모리별 버전 분포
        const versionStats = await runQuery(db, `
          SELECT memory_id, COUNT(*) as version_count
          FROM memory_versions 
          GROUP BY memory_id 
          ORDER BY version_count DESC 
          LIMIT 10
        `);
        console.log(`  메모리별 버전 수 (상위 10개):`);
        versionStats.forEach(stat => {
          console.log(`    - ${stat.memory_id}: ${stat.version_count}개 버전`);
        });
        
        // 고아 버전 확인 (work_memories와 조인)
        const orphanedVersions = await getRow(db, `
          SELECT COUNT(*) as count 
          FROM memory_versions mv
          LEFT JOIN work_memories wm ON mv.memory_id = wm.id
          WHERE wm.id IS NULL
        `);
        console.log(`  고아 버전 (메모리 없음): ${orphanedVersions.count}개`);
      }
    }
    
    // work_memory_versions 테이블 (있다면) 분석
    if (existingHistoryTables.includes('work_memory_versions')) {
      console.log('\n📊 work_memory_versions 테이블 분석:');
      
      const workMemoryVersionsSchema = await runQuery(db, "PRAGMA table_info(work_memory_versions)");
      console.log('  스키마:');
      workMemoryVersionsSchema.forEach(col => {
        console.log(`    - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });
      
      const workMemoryVersionsCount = await getRow(db, "SELECT COUNT(*) as count FROM work_memory_versions");
      console.log(`  총 레코드 수: ${workMemoryVersionsCount.count}개`);
    }
    
    // work_memories 테이블 확인
    const workMemoriesCount = await getRow(db, "SELECT COUNT(*) as count FROM work_memories");
    console.log(`\n📝 work_memories 총 개수: ${workMemoriesCount.count}개`);
    
    // 두 테이블의 관계 분석
    if (existingHistoryTables.includes('change_history') && existingHistoryTables.includes('memory_versions')) {
      console.log('\n🔗 테이블 간 관계 분석:');
      
      // change_history의 고유 memory_id 수
      const uniqueHistoryMemories = await getRow(db, `
        SELECT COUNT(DISTINCT memory_id) as count FROM change_history
      `);
      
      // memory_versions의 고유 memory_id 수
      const uniqueVersionMemories = await getRow(db, `
        SELECT COUNT(DISTINCT memory_id) as count FROM memory_versions
      `);
      
      console.log(`  change_history의 고유 메모리 수: ${uniqueHistoryMemories.count}개`);
      console.log(`  memory_versions의 고유 메모리 수: ${uniqueVersionMemories.count}개`);
      
      // 두 테이블 모두에 있는 메모리
      const commonMemories = await getRow(db, `
        SELECT COUNT(DISTINCT ch.memory_id) as count
        FROM change_history ch
        INNER JOIN memory_versions mv ON ch.memory_id = mv.memory_id
      `);
      
      console.log(`  두 테이블 모두에 있는 메모리: ${commonMemories.count}개`);
      
      // change_history에만 있는 메모리
      const historyOnlyMemories = await getRow(db, `
        SELECT COUNT(DISTINCT ch.memory_id) as count
        FROM change_history ch
        LEFT JOIN memory_versions mv ON ch.memory_id = mv.memory_id
        WHERE mv.memory_id IS NULL
      `);
      
      console.log(`  change_history에만 있는 메모리: ${historyOnlyMemories.count}개`);
      
      // memory_versions에만 있는 메모리
      const versionsOnlyMemories = await getRow(db, `
        SELECT COUNT(DISTINCT mv.memory_id) as count
        FROM memory_versions mv
        LEFT JOIN change_history ch ON mv.memory_id = ch.memory_id
        WHERE ch.memory_id IS NULL
      `);
      
      console.log(`  memory_versions에만 있는 메모리: ${versionsOnlyMemories.count}개`);
    }
    
    // clean_orphaned_history 기능 분석
    if (existingHistoryTables.includes('change_history')) {
      console.log('\n🧹 clean_orphaned_history 타겟 분석:');
      
      // 고아 히스토리 상세 분석
      const orphanedDetails = await runQuery(db, `
        SELECT ch.memory_id, ch.action, COUNT(*) as count
        FROM change_history ch
        LEFT JOIN work_memories wm ON ch.memory_id = wm.id
        WHERE wm.id IS NULL
        GROUP BY ch.memory_id, ch.action
        ORDER BY count DESC
        LIMIT 10
      `);
      
      if (orphanedDetails.length > 0) {
        console.log(`  고아 히스토리 상세 (상위 10개):`);
        orphanedDetails.forEach(detail => {
          console.log(`    - 메모리 ${detail.memory_id}: ${detail.action} 액션 ${detail.count}개`);
        });
      } else {
        console.log(`  고아 히스토리가 없습니다.`);
      }
    }
    
    // 결론
    console.log('\n📋 분석 결과:');
    console.log(`  - 현재 시스템에는 ${existingHistoryTables.length}개의 히스토리 테이블이 있습니다`);
    console.log(`  - 사용자가 보고 있는 7개 히스토리는 UI에서 표시되는 최근 change_history 레코드일 가능성이 높습니다`);
    console.log(`  - clean_orphaned_history는 change_history 테이블의 고아 레코드를 대상으로 합니다`);
    
    if (existingHistoryTables.includes('change_history')) {
      const orphanedHistory = await getRow(db, `
        SELECT COUNT(*) as count 
        FROM change_history ch
        LEFT JOIN work_memories wm ON ch.memory_id = wm.id
        WHERE wm.id IS NULL
      `);
      console.log(`  - 정리 대상 고아 히스토리: ${orphanedHistory.count}개`);
      
      if (orphanedHistory.count > 0) {
        console.log(`  - ⚠️ 사용자가 보는 7개 히스토리와 clean_orphaned_history 대상은 다른 데이터입니다!`);
        console.log(`  - 사용자 히스토리: 최근 변경사항 (유효한 메모리 포함)`);
        console.log(`  - clean_orphaned_history 대상: 삭제된 메모리의 남은 히스토리 레코드`);
      } else {
        console.log(`  - ✅ 현재 고아 히스토리가 없으므로 clean_orphaned_history 실행해도 변화 없음`);
      }
    }
    
  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    db.close();
  }
}

analyzeDatabase().catch(console.error);