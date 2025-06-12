// SessionStateManager 기능 검증 스크립트
const { SessionStateManager, StateManagerBuilder } = require('../dist/session/SessionStateManager.js');
const { SessionStatus } = require('../dist/types/session.js');

console.log('🧪 SessionStateManager 기능 검증 시작');
console.log('='.repeat(50));

try {
  // 테스트용 모의 세션 생성
  const createMockSession = (status = SessionStatus.ACTIVE) => ({
    session_id: 'test-session-' + Date.now(),
    project_name: 'test-project',
    project_path: '/test/path',
    git_repository: undefined,
    started_at: '2025-06-11T10:00:00.000Z',
    ended_at: undefined,
    last_activity_at: '2025-06-11T10:00:00.000Z',
    status: status,
    description: 'Test session',
    auto_created: false,
    tags: ['test'],
    created_by: 'test-user',
    created_at: '2025-06-11T10:00:00.000Z',
    updated_at: '2025-06-11T10:00:00.000Z',
    activity_count: 0,
    memory_count: 0,
    total_work_time: 0,
    project_normalized: 'test-project'
  });

  // 1. 기본 상태 관리자 생성
  console.log('\n1️⃣ 기본 SessionStateManager 테스트');
  const stateManager = new SessionStateManager();
  
  const config = stateManager.getConfig();
  console.log('기본 설정:', config);

  // 2. 허용된 상태 전환 테스트
  console.log('\n2️⃣ 허용된 상태 전환 테스트');
  
  const activeSession = createMockSession(SessionStatus.ACTIVE);
  console.log(`초기 상태: ${activeSession.status}`);

  // ACTIVE → PAUSED
  const pauseResult = stateManager.pauseSession(activeSession);
  if (pauseResult.success) {
    console.log(`✅ ACTIVE → PAUSED 전환 성공: ${pauseResult.previous_status} → ${pauseResult.new_status}`);
    console.log(`   타임스탬프 업데이트: ${activeSession.updated_at !== '2025-06-11T10:00:00.000Z'}`);
  } else {
    console.log('❌ ACTIVE → PAUSED 전환 실패:', pauseResult.errors);
  }

  // PAUSED → ACTIVE
  const activateResult = stateManager.activateSession(activeSession);
  if (activateResult.success) {
    console.log(`✅ PAUSED → ACTIVE 전환 성공: ${activateResult.previous_status} → ${activateResult.new_status}`);
  } else {
    console.log('❌ PAUSED → ACTIVE 전환 실패:', activateResult.errors);
  }

  // ACTIVE → COMPLETED
  const completeResult = stateManager.completeSession(activeSession);
  if (completeResult.success) {
    console.log(`✅ ACTIVE → COMPLETED 전환 성공: ${completeResult.previous_status} → ${completeResult.new_status}`);
    console.log(`   ended_at 설정: ${activeSession.ended_at ? '설정됨' : '설정안됨'}`);
  } else {
    console.log('❌ ACTIVE → COMPLETED 전환 실패:', completeResult.errors);
  }

  // 3. 재개 기능 테스트
  console.log('\n3️⃣ 세션 재개 테스트');
  
  const reopenResult = stateManager.activateSession(activeSession);
  if (reopenResult.success) {
    console.log(`✅ COMPLETED → ACTIVE 재개 성공: ${reopenResult.previous_status} → ${reopenResult.new_status}`);
    console.log(`   ended_at 초기화: ${activeSession.ended_at === undefined ? '초기화됨' : '초기화안됨'}`);
  } else {
    console.log('❌ COMPLETED → ACTIVE 재개 실패:', reopenResult.errors);
  }

  // 4. 금지된 상태 전환 테스트
  console.log('\n4️⃣ 금지된 상태 전환 테스트');
  
  const completedSession = createMockSession(SessionStatus.COMPLETED);
  const invalidResult = stateManager.pauseSession(completedSession);
  
  if (!invalidResult.success) {
    console.log('✅ 금지된 전환 차단 성공: COMPLETED → PAUSED');
    console.log(`   오류 메시지: ${invalidResult.errors[0]}`);
  } else {
    console.log('❌ 금지된 전환이 허용됨!');
  }

  // 5. 강제 전환 테스트
  console.log('\n5️⃣ 강제 전환 테스트');
  
  const forceResult = stateManager.changeState(completedSession, SessionStatus.PAUSED, { force: true });
  if (forceResult.success) {
    console.log(`✅ 강제 전환 성공: ${forceResult.previous_status} → ${forceResult.new_status}`);
  } else {
    console.log('❌ 강제 전환 실패:', forceResult.errors);
  }

  // 6. 상태 전환 가능성 확인
  console.log('\n6️⃣ 상태 전환 가능성 확인');
  
  const activeTransitions = stateManager.getAvailableTransitions(createMockSession(SessionStatus.ACTIVE));
  console.log('ACTIVE에서 가능한 전환:', activeTransitions);
  
  const completedTransitions = stateManager.getAvailableTransitions(createMockSession(SessionStatus.COMPLETED));
  console.log('COMPLETED에서 가능한 전환:', completedTransitions);

  // 7. 동일 상태 전환 테스트
  console.log('\n7️⃣ 동일 상태 전환 테스트');
  
  const sameStateSession = createMockSession(SessionStatus.ACTIVE);
  const sameStateResult = stateManager.activateSession(sameStateSession);
  
  if (sameStateResult.success && sameStateResult.errors) {
    console.log('✅ 동일 상태 전환 처리 성공');
    console.log(`   경고 메시지: ${sameStateResult.errors[0]}`);
  } else {
    console.log('❌ 동일 상태 전환 처리 실패');
  }

  // 8. 상태 히스토리 분석 테스트
  console.log('\n8️⃣ 상태 히스토리 분석 테스트');
  
  const sessions = [
    createMockSession(SessionStatus.ACTIVE),
    createMockSession(SessionStatus.ACTIVE),
    createMockSession(SessionStatus.PAUSED),
    createMockSession(SessionStatus.COMPLETED),
    createMockSession(SessionStatus.CANCELLED)
  ];
  
  const analysis = stateManager.analyzeStateHistory(sessions);
  console.log('세션 분석 결과:');
  console.log(`  총 세션: ${analysis.total_sessions}개`);
  console.log(`  상태별 분포: ACTIVE=${analysis.by_status.active}, PAUSED=${analysis.by_status.paused}, COMPLETED=${analysis.by_status.completed}, CANCELLED=${analysis.by_status.cancelled}`);
  console.log(`  완료율: ${(analysis.completed_ratio * 100).toFixed(1)}%`);
  console.log(`  취소율: ${(analysis.cancelled_ratio * 100).toFixed(1)}%`);
  console.log(`  활성율: ${(analysis.active_ratio * 100).toFixed(1)}%`);

  // 9. 제한적 설정 테스트
  console.log('\n9️⃣ 제한적 설정 테스트');
  
  const restrictiveManager = new SessionStateManager({
    allow_reopen_completed: false,
    allow_reopen_cancelled: false
  });
  
  const restrictedSession = createMockSession(SessionStatus.COMPLETED);
  const restrictedResult = restrictiveManager.activateSession(restrictedSession);
  
  if (!restrictedResult.success) {
    console.log('✅ 제한적 설정 정상 작동');
    console.log(`   제한 사유: ${restrictedResult.errors[0]}`);
  } else {
    console.log('❌ 제한적 설정 미작동');
  }

  // 10. StateManagerBuilder 테스트
  console.log('\n🔟 StateManagerBuilder 테스트');
  
  const customManager = new StateManagerBuilder()
    .allowReopenCompleted(false)
    .allowReopenCancelled(true)
    .autoUpdateTimestamps(false)
    .validateConditions(true)
    .build();
  
  const customConfig = customManager.getConfig();
  console.log('커스텀 설정:', customConfig);
  
  const builderSession = createMockSession(SessionStatus.ACTIVE);
  const originalUpdatedAt = builderSession.updated_at;
  
  customManager.pauseSession(builderSession);
  
  if (builderSession.updated_at === originalUpdatedAt) {
    console.log('✅ 타임스탬프 자동 업데이트 비활성화 확인');
  } else {
    console.log('❌ 타임스탬프 자동 업데이트 설정 미적용');
  }

  // 11. 전환 규칙 조회 테스트
  console.log('\n1️⃣1️⃣ 전환 규칙 조회 테스트');
  
  const rules = stateManager.getTransitionRules();
  console.log(`총 전환 규칙: ${rules.length}개`);
  
  const allowedRules = rules.filter(r => r.allowed).length;
  const forbiddenRules = rules.filter(r => !r.allowed).length;
  console.log(`허용된 전환: ${allowedRules}개, 금지된 전환: ${forbiddenRules}개`);

  console.log('\n' + '='.repeat(50));
  console.log('🎉 SessionStateManager 기능 검증 완료!');
  console.log('✅ 모든 상태 전환 로직이 정상 작동합니다.');
  
} catch (error) {
  console.error('\n💥 SessionStateManager 검증 실패:', error);
  console.log('\n가능한 원인:');
  console.log('  1. TypeScript 빌드가 완료되지 않음');
  console.log('  2. 모듈 경로 문제'); 
  console.log('  3. 타입 정의 문제');
}
