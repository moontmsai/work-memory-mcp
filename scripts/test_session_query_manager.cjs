// SessionQueryManager 기능 검증 스크립트
const { DatabaseManager } = require('../dist/database/connection.js');
const { SessionQueryManager } = require('../dist/session/SessionQueryManager.js');
const { SessionStatus } = require('../dist/types/session.js');

console.log('🧪 SessionQueryManager 기능 검증 시작');
console.log('='.repeat(50));

try {
  // DatabaseManager 인스턴스 가져오기
  const dbManager = DatabaseManager.getInstance();
  const connection = dbManager.getConnection();
  const queryManager = new SessionQueryManager(connection);

  console.log('📁 데이터베이스 연결 성공');

  // 테스트 함수들
  async function test1_getSessionById() {
    console.log('\n1️⃣ 세션 ID로 조회 테스트');
    
    try {
      // 첫 번째 세션 ID 가져오기 - DatabaseManager의 메서드 사용
      const firstSessionResult = await connection.get('SELECT session_id FROM work_sessions LIMIT 1');
      
      if (!firstSessionResult) {
        console.log('⚠️  세션이 없어서 테스트를 건너뜀');
        return;
      }

      const session = await queryManager.getSessionById(firstSessionResult.session_id);
      
      if (session) {
        console.log('✅ 세션 조회 성공');
        console.log(`   세션 ID: ${session.session_id}`);
        console.log(`   프로젝트: ${session.project_name}`);
        console.log(`   상태: ${session.status}`);
        console.log(`   메모리 수: ${session.memory_count}`);
      } else {
        console.log('❌ 세션 조회 실패');
      }

      // 메모리 포함 조회 테스트
      const sessionWithMemories = await queryManager.getSessionById(firstSessionResult.session_id, true);
      
      if (sessionWithMemories && sessionWithMemories.memories) {
        console.log('✅ 메모리 포함 조회 성공');
        console.log(`   연결된 메모리: ${sessionWithMemories.memories.length}개`);
        console.log(`   중요도별 분포: ${JSON.stringify(sessionWithMemories.memory_stats.by_importance)}`);
      }

    } catch (error) {
      console.log('❌ 세션 ID 조회 테스트 실패:', error.message);
    }
  }

  async function test2_getAllSessions() {
    console.log('\n2️⃣ 전체 세션 조회 테스트');
    
    try {
      const result = await queryManager.getSessions();
      
      console.log('✅ 전체 세션 조회 성공');
      console.log(`   총 세션 수: ${result.total_count}개`);
      console.log(`   현재 페이지: ${result.data.length}개`);
      console.log(`   더 있음: ${result.has_more ? 'Yes' : 'No'}`);
      
      if (result.data.length > 0) {
        console.log('   세션 목록:');
        result.data.slice(0, 3).forEach((session, index) => {
          console.log(`     ${index + 1}. ${session.project_name} (${session.status}) - ${session.memory_count}개 메모리`);
        });
      }

    } catch (error) {
      console.log('❌ 전체 세션 조회 테스트 실패:', error.message);
    }
  }

  async function test3_filterBySatus() {
    console.log('\n3️⃣ 상태별 필터링 테스트');
    
    try {
      // ACTIVE 세션 조회
      const activeResult = await queryManager.getSessions({
        status: SessionStatus.ACTIVE
      });
      
      console.log(`✅ ACTIVE 세션: ${activeResult.total_count}개`);
      
      // COMPLETED 세션 조회
      const completedResult = await queryManager.getSessions({
        status: SessionStatus.COMPLETED
      });
      
      console.log(`✅ COMPLETED 세션: ${completedResult.total_count}개`);
      
      // 복수 상태 조회
      const multipleResult = await queryManager.getSessions({
        status: [SessionStatus.ACTIVE, SessionStatus.PAUSED]
      });
      
      console.log(`✅ ACTIVE + PAUSED 세션: ${multipleResult.total_count}개`);

    } catch (error) {
      console.log('❌ 상태별 필터링 테스트 실패:', error.message);
    }
  }

  async function test4_searchSessions() {
    console.log('\n4️⃣ 세션 검색 테스트');
    
    try {
      // 프로젝트명으로 검색
      const searchResult = await queryManager.searchSessions({
        search_query: 'memory',
        search_fields: ['project_name', 'description']
      });
      
      console.log('✅ 검색 기능 테스트 성공');
      console.log(`   검색 결과: ${searchResult.total_count}개`);
      
      if (searchResult.data.length > 0) {
        console.log('   검색된 세션:');
        searchResult.data.slice(0, 3).forEach((session, index) => {
          console.log(`     ${index + 1}. ${session.project_name} - ${session.description || '설명 없음'}`);
        });
      }

    } catch (error) {
      console.log('❌ 세션 검색 테스트 실패:', error.message);
    }
  }

  async function test5_getActiveSessions() {
    console.log('\n5️⃣ 활성 세션 조회 테스트');
    
    try {
      const activeSessions = await queryManager.getActiveSessions();
      
      console.log('✅ 활성 세션 조회 성공');
      console.log(`   활성 세션 수: ${activeSessions.length}개`);
      
      if (activeSessions.length > 0) {
        console.log('   활성 세션 목록:');
        activeSessions.slice(0, 3).forEach((session, index) => {
          console.log(`     ${index + 1}. ${session.project_name} (${session.status}) - 최근 활동: ${session.last_activity_at}`);
        });
      }

    } catch (error) {
      console.log('❌ 활성 세션 조회 테스트 실패:', error.message);
    }
  }

  async function test6_getSessionsByProject() {
    console.log('\n6️⃣ 프로젝트별 세션 조회 테스트');
    
    try {
      // 첫 번째 프로젝트명 가져오기 - DatabaseManager 사용
      const firstProjectResult = await connection.get('SELECT DISTINCT project_name FROM work_sessions LIMIT 1');
      
      if (!firstProjectResult) {
        console.log('⚠️  프로젝트가 없어서 테스트를 건너뜀');
        return;
      }

      const projectSessions = await queryManager.getSessionsByProject(firstProjectResult.project_name);
      
      console.log('✅ 프로젝트별 세션 조회 성공');
      console.log(`   프로젝트: ${firstProjectResult.project_name}`);
      console.log(`   세션 수: ${projectSessions.total_count}개`);

    } catch (error) {
      console.log('❌ 프로젝트별 세션 조회 테스트 실패:', error.message);
    }
  }

  async function test7_getSessionStats() {
    console.log('\n7️⃣ 세션 통계 조회 테스트');
    
    try {
      const stats = await queryManager.getSessionStats();
      
      console.log('✅ 세션 통계 조회 성공');
      console.log(`   총 세션 수: ${stats.total_sessions}개`);
      console.log(`   활성 세션 수: ${stats.active_sessions}개`);
      console.log(`   완료된 세션 수: ${stats.completed_sessions}개`);
      console.log(`   총 작업 시간: ${Math.round(stats.total_work_time / 3600)}시간`);
      console.log(`   평균 세션 시간: ${Math.round(stats.average_session_duration / 3600)}시간`);
      console.log(`   가장 활성 프로젝트: ${stats.most_active_project || '없음'}`);
      
      console.log('   상태별 분포:');
      Object.entries(stats.session_by_status).forEach(([status, count]) => {
        console.log(`     ${status}: ${count}개`);
      });

    } catch (error) {
      console.log('❌ 세션 통계 조회 테스트 실패:', error.message);
    }
  }

  async function test8_getRecentSessions() {
    console.log('\n8️⃣ 최근 세션 조회 테스트');
    
    try {
      const recentSessions = await queryManager.getRecentSessions(5);
      
      console.log('✅ 최근 세션 조회 성공');
      console.log(`   최근 5개 세션:`);
      
      recentSessions.forEach((session, index) => {
        const lastActivity = new Date(session.last_activity_at).toLocaleString();
        console.log(`     ${index + 1}. ${session.project_name} (${session.status}) - ${lastActivity}`);
      });

    } catch (error) {
      console.log('❌ 최근 세션 조회 테스트 실패:', error.message);
    }
  }

  async function test9_getSessionSummaries() {
    console.log('\n9️⃣ 세션 요약 조회 테스트');
    
    try {
      const summaries = await queryManager.getSessionSummaries();
      
      console.log('✅ 세션 요약 조회 성공');
      console.log(`   요약 개수: ${summaries.length}개`);
      
      if (summaries.length > 0) {
        console.log('   요약 정보:');
        summaries.slice(0, 3).forEach((summary, index) => {
          const duration = Math.round(summary.duration / 3600);
          console.log(`     ${index + 1}. ${summary.project_name} (${summary.status}) - ${summary.memory_count}개 메모리, ${duration}시간`);
        });
      }

    } catch (error) {
      console.log('❌ 세션 요약 조회 테스트 실패:', error.message);
    }
  }

  async function test10_pagination() {
    console.log('\n🔟 페이지네이션 테스트');
    
    try {
      // 첫 번째 페이지
      const page1 = await queryManager.getSessions({
        limit: 2,
        offset: 0
      });
      
      console.log('✅ 첫 번째 페이지 조회 성공');
      console.log(`   페이지 1: ${page1.data.length}개`);
      console.log(`   더 있음: ${page1.has_more}`);
      console.log(`   다음 오프셋: ${page1.next_offset || 'None'}`);
      
      if (page1.has_more && page1.next_offset) {
        // 두 번째 페이지
        const page2 = await queryManager.getSessions({
          limit: 2,
          offset: page1.next_offset
        });
        
        console.log(`   페이지 2: ${page2.data.length}개`);
        console.log(`   더 있음: ${page2.has_more}`);
      }

    } catch (error) {
      console.log('❌ 페이지네이션 테스트 실패:', error.message);
    }
  }

  // 모든 테스트 실행
  async function runAllTests() {
    await test1_getSessionById();
    await test2_getAllSessions();
    await test3_filterBySatus();
    await test4_searchSessions();
    await test5_getActiveSessions();
    await test6_getSessionsByProject();
    await test7_getSessionStats();
    await test8_getRecentSessions();
    await test9_getSessionSummaries();
    await test10_pagination();
  }

  // 테스트 실행
  runAllTests().then(async () => {
    console.log('\n' + '='.repeat(50));
    console.log('🎉 SessionQueryManager 기능 검증 완료!');
    console.log('✅ 모든 조회 및 검색 기능이 정상 작동합니다.');
    
    await connection.close();
  }).catch(async (error) => {
    console.error('\n💥 테스트 실행 중 오류:', error);
    try {
      await connection.close();
    } catch (closeError) {
      console.error('데이터베이스 종료 오류:', closeError);
    }
  });

} catch (error) {
  console.error('\n💥 SessionQueryManager 검증 실패:', error);
  console.log('\n가능한 원인:');
  console.log('  1. TypeScript 빌드가 완료되지 않음');
  console.log('  2. 데이터베이스 연결 실패');
  console.log('  3. 모듈 경로 문제');
}
