// 기존 데이터 현황 분석 스크립트
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'work_memory', 'database.sqlite');

console.log('📊 기존 데이터 현황 분석');
console.log('='.repeat(50));

try {
  const db = new Database(dbPath);
  
  // 1. work_memories 테이블 전체 데이터 분석
  console.log('\n1️⃣ work_memories 테이블 분석');
  
  const totalMemories = db.prepare('SELECT COUNT(*) as count FROM work_memories').get();
  console.log(`전체 메모리 수: ${totalMemories.count}개`);
  
  if (totalMemories.count === 0) {
    console.log('⚠️  데이터가 없으므로 마이그레이션이 필요하지 않습니다.');
    db.close();
    return;
  }
  
  // session_id가 NULL인 데이터 확인
  const nullSessionCount = db.prepare('SELECT COUNT(*) as count FROM work_memories WHERE session_id IS NULL').get();
  console.log(`session_id가 NULL인 메모리: ${nullSessionCount.count}개`);
  
  const hasSessionCount = db.prepare('SELECT COUNT(*) as count FROM work_memories WHERE session_id IS NOT NULL').get();
  console.log(`session_id가 있는 메모리: ${hasSessionCount.count}개`);
  
  // 2. 프로젝트별 분석
  console.log('\n2️⃣ 프로젝트별 데이터 분석');
  
  const projectStats = db.prepare(`
    SELECT 
      project,
      COUNT(*) as memory_count,
      COUNT(CASE WHEN session_id IS NULL THEN 1 END) as null_session_count,
      COUNT(CASE WHEN session_id IS NOT NULL THEN 1 END) as has_session_count
    FROM work_memories 
    GROUP BY project 
    ORDER BY memory_count DESC
  `).all();
  
  console.log('\n프로젝트별 현황:');
  projectStats.forEach(stat => {
    console.log(`📁 ${stat.project || '(프로젝트 없음)'}`);
    console.log(`   총 메모리: ${stat.memory_count}개`);
    console.log(`   session_id 없음: ${stat.null_session_count}개`);
    console.log(`   session_id 있음: ${stat.has_session_count}개`);
  });
  
  // 3. 날짜별 분석
  console.log('\n3️⃣ 생성 날짜별 분석');
  
  const dateStats = db.prepare(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as count,
      COUNT(CASE WHEN session_id IS NULL THEN 1 END) as null_session_count
    FROM work_memories 
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 10
  `).all();
  
  console.log('\n최근 10일 데이터:');
  dateStats.forEach(stat => {
    console.log(`📅 ${stat.date}: ${stat.count}개 (session_id 없음: ${stat.null_session_count}개)`);
  });
  
  // 4. 샘플 데이터 확인
  console.log('\n4️⃣ 샘플 데이터 확인');
  
  const sampleData = db.prepare(`
    SELECT id, project, created_at, session_id, content
    FROM work_memories 
    WHERE session_id IS NULL
    ORDER BY created_at DESC
    LIMIT 3
  `).all();
  
  console.log('\nsession_id가 없는 최근 데이터 3개:');
  sampleData.forEach((item, index) => {
    console.log(`\n${index + 1}. ID: ${item.id}`);
    console.log(`   프로젝트: ${item.project || '(없음)'}`);
    console.log(`   생성일: ${item.created_at}`);
    console.log(`   내용: ${item.content.substring(0, 100)}${item.content.length > 100 ? '...' : ''}`);
  });
  
  // 5. 마이그레이션 필요성 판단
  console.log('\n5️⃣ 마이그레이션 필요성 판단');
  
  if (nullSessionCount.count > 0) {
    console.log('🚨 마이그레이션 필요!');
    console.log(`\n마이그레이션 대상: ${nullSessionCount.count}개 메모리`);
    console.log('프로젝트별 세션 생성 전략:');
    
    projectStats.forEach(stat => {
      if (stat.null_session_count > 0) {
        console.log(`  📁 ${stat.project || '(프로젝트 없음)'}: ${stat.null_session_count}개 → 세션 1개 생성 예정`);
      }
    });
    
    console.log('\n마이그레이션 전략:');
    console.log('  1. 프로젝트별로 기본 세션 생성');
    console.log('  2. 같은 프로젝트의 메모리들을 해당 세션에 연결');
    console.log('  3. 프로젝트가 없는 메모리는 "unknown" 세션에 연결');
    console.log('  4. 기존 session_id가 있는 데이터는 그대로 유지');
    
  } else {
    console.log('✅ 모든 데이터에 session_id가 있습니다. 마이그레이션 불필요!');
  }
  
  // 6. work_sessions 테이블 현황
  console.log('\n6️⃣ work_sessions 테이블 현황');
  
  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM work_sessions').get();
  console.log(`기존 세션 수: ${sessionCount.count}개`);
  
  if (sessionCount.count > 0) {
    const sessions = db.prepare('SELECT session_id, project_name, status, created_at FROM work_sessions ORDER BY created_at DESC LIMIT 5').all();
    console.log('\n최근 세션 5개:');
    sessions.forEach((session, index) => {
      console.log(`  ${index + 1}. ${session.session_id} (${session.project_name}) - ${session.status}`);
    });
  }
  
  db.close();
  
  console.log('\n' + '='.repeat(50));
  console.log('📋 분석 완료');
  console.log('='.repeat(50));
  
  if (nullSessionCount.count > 0) {
    console.log('\n🔄 다음 단계: 데이터 마이그레이션 스크립트 실행');
  } else {
    console.log('\n✅ 마이그레이션 작업이 필요하지 않습니다.');
  }
  
} catch (error) {
  console.error('❌ 분석 중 오류:', error);
}
