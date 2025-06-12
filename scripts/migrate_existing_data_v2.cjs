// 수정된 데이터 마이그레이션 스크립트
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');

console.log('🚀 데이터 마이그레이션 시작 (수정 버전)');
console.log('='.repeat(50));

try {
  const db = new Database(dbPath);
  
  // 1. 마이그레이션 전 백업
  console.log('\n💾 마이그레이션 전 백업 생성...');
  const backupPath = path.join(__dirname, '..', 'work_memory', 'backups', 
    `data_migration_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  
  const backupDb = new Database(backupPath);
  db.backup(backupDb);
  backupDb.close();
  console.log(`✅ 백업 완료: ${backupPath}`);
  
  // 2. 마이그레이션 대상 확인
  console.log('\n📊 마이그레이션 대상 확인...');
  const nullSessionCount = db.prepare('SELECT COUNT(*) as count FROM work_memories WHERE session_id IS NULL').get();
  console.log(`마이그레이션 대상: ${nullSessionCount.count}개`);
  
  if (nullSessionCount.count === 0) {
    console.log('✅ 마이그레이션할 데이터가 없습니다.');
    db.close();
    return;
  }
  
  // 3. 프로젝트별 그룹화
  console.log('\n📁 프로젝트별 데이터 분석...');
  const projectGroups = db.prepare(`
    SELECT 
      COALESCE(project, 'unknown') as project_name,
      COUNT(*) as memory_count
    FROM work_memories 
    WHERE session_id IS NULL
    GROUP BY COALESCE(project, 'unknown')
    ORDER BY memory_count DESC
  `).all();
  
  console.log('프로젝트별 그룹:');
  projectGroups.forEach(group => {
    console.log(`  📁 ${group.project_name}: ${group.memory_count}개`);
  });
  
  // 4. 트랜잭션으로 세션 생성 및 메모리 연결
  console.log('\n🔄 마이그레이션 실행...');
  
  const migration = db.transaction(() => {
    const createdSessions = [];
    
    for (const group of projectGroups) {
      console.log(`\n📁 "${group.project_name}" 프로젝트 처리 중...`);
      
      // 세션 ID 생성 (간단하게)
      const sessionId = `session_${group.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
      
      // 세션 생성 (문제가 될 수 있는 필드들 제거)
      console.log(`   🆔 세션 생성: ${sessionId}`);
      db.prepare(`
        INSERT INTO work_sessions (
          session_id, 
          project_name, 
          description, 
          status, 
          created_by
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        sessionId,
        group.project_name === 'unknown' ? 'Uncategorized Memories' : group.project_name,
        `Auto-generated session for ${group.memory_count} existing memories`,
        'completed',
        'migration_script'
      );
      
      // 해당 프로젝트의 모든 메모리에 session_id 연결
      console.log(`   🔗 ${group.memory_count}개 메모리 연결 중...`);
      const updateResult = db.prepare(`
        UPDATE work_memories 
        SET session_id = ?
        WHERE session_id IS NULL 
        AND COALESCE(project, 'unknown') = ?
      `).run(sessionId, group.project_name);
      
      console.log(`   ✅ ${updateResult.changes}개 메모리 연결 완료`);
      
      // 세션 통계 업데이트
      db.prepare(`
        UPDATE work_sessions 
        SET memory_count = ?, activity_count = ?
        WHERE session_id = ?
      `).run(updateResult.changes, updateResult.changes, sessionId);
      
      createdSessions.push({
        sessionId,
        projectName: group.project_name,
        memoryCount: updateResult.changes
      });
    }
    
    return createdSessions;
  });
  
  const createdSessions = migration();
  
  // 5. 마이그레이션 결과 확인
  console.log('\n🔍 마이그레이션 결과 확인...');
  
  const finalNullCount = db.prepare('SELECT COUNT(*) as count FROM work_memories WHERE session_id IS NULL').get();
  const finalHasSessionCount = db.prepare('SELECT COUNT(*) as count FROM work_memories WHERE session_id IS NOT NULL').get();
  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM work_sessions').get();
  
  console.log(`session_id 없는 메모리: ${finalNullCount.count}개`);
  console.log(`session_id 있는 메모리: ${finalHasSessionCount.count}개`);
  console.log(`생성된 세션: ${sessionCount.count}개`);
  
  // 6. 세션별 연결 확인
  console.log('\n📊 세션별 연결 확인:');
  const sessionStats = db.prepare(`
    SELECT 
      s.session_id,
      s.project_name,
      s.status,
      s.memory_count,
      COUNT(m.id) as actual_linked_memories
    FROM work_sessions s
    LEFT JOIN work_memories m ON s.session_id = m.session_id
    GROUP BY s.session_id
    ORDER BY actual_linked_memories DESC
  `).all();
  
  sessionStats.forEach(stat => {
    console.log(`  🔗 ${stat.project_name} (${stat.session_id})`);
    console.log(`     예상: ${stat.memory_count}개, 실제: ${stat.actual_linked_memories}개`);
    console.log(`     상태: ${stat.status}`);
  });
  
  // 7. 샘플 연결 확인
  console.log('\n🧪 샘플 연결 확인:');
  const sampleJoin = db.prepare(`
    SELECT 
      m.id,
      m.project,
      m.session_id,
      s.project_name as session_project,
      s.status
    FROM work_memories m
    JOIN work_sessions s ON m.session_id = s.session_id
    LIMIT 3
  `).all();
  
  sampleJoin.forEach((sample, index) => {
    console.log(`  ${index + 1}. 메모리 ${sample.id}`);
    console.log(`     프로젝트: ${sample.project} → 세션: ${sample.session_project}`);
    console.log(`     세션 ID: ${sample.session_id.substring(0, 20)}...`);
  });
  
  db.close();
  
  // 8. 최종 결과
  console.log('\n' + '='.repeat(50));
  console.log('🎉 데이터 마이그레이션 완료!');
  console.log('='.repeat(50));
  
  if (finalNullCount.count === 0) {
    console.log('✅ 모든 메모리가 세션에 성공적으로 연결되었습니다!');
    console.log('\n📈 마이그레이션 결과:');
    console.log(`  - 생성된 세션: ${createdSessions.length}개`);
    console.log(`  - 연결된 메모리: ${finalHasSessionCount.count}개`);
    console.log(`  - 미연결 메모리: ${finalNullCount.count}개`);
    
    console.log('\n🔄 생성된 세션 목록:');
    createdSessions.forEach((session, index) => {
      console.log(`  ${index + 1}. ${session.projectName}: ${session.memoryCount}개 메모리`);
    });
    
    console.log('\n✅ Task 2 (Data Migration) 완료!');
    console.log('🚀 다음 단계: Task 3 (Session Management Logic) 구현');
    
  } else {
    console.log('⚠️  일부 메모리가 연결되지 않았습니다. 확인이 필요합니다.');
  }
  
} catch (error) {
  console.error('\n💥 마이그레이션 실패:', error);
  console.log('\n복구 방법:');
  console.log('  1. 백업 파일을 사용하여 데이터베이스 복원');
  console.log('  2. 마이그레이션 스크립트 수정 후 재시도');
  process.exit(1);
}
