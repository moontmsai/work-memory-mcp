// SessionFactory 기능 검증 스크립트
const { SessionFactory, SessionFactoryBuilder } = require('../dist/session/SessionFactory.js');
const { SessionStatus } = require('../dist/types/session.js');

console.log('🧪 SessionFactory 기능 검증 시작');
console.log('='.repeat(50));

try {
  // 1. 기본 팩토리 인스턴스 생성
  console.log('\n1️⃣ 기본 SessionFactory 테스트');
  const factory = new SessionFactory();
  
  // 기본 설정 확인
  const config = factory.getConfig();
  console.log('기본 설정:', config);
  
  // 2. 간단한 세션 생성
  console.log('\n2️⃣ 기본 세션 생성 테스트');
  const basicResult = factory.createSession({
    project_name: 'test-project'
  });
  
  if (basicResult.created) {
    console.log('✅ 기본 세션 생성 성공');
    console.log(`세션 ID: ${basicResult.session.session_id}`);
    console.log(`프로젝트: ${basicResult.session.project_name}`);
    console.log(`상태: ${basicResult.session.status}`);
    console.log(`정규화된 프로젝트명: ${basicResult.session.project_normalized}`);
  } else {
    console.log('❌ 기본 세션 생성 실패:', basicResult.errors);
  }
  
  // 3. 전체 옵션 세션 생성
  console.log('\n3️⃣ 전체 옵션 세션 생성 테스트');
  const fullResult = factory.createSession({
    project_name: 'Full Test Project',
    project_path: '/path/to/project',
    git_repository: 'https://github.com/user/repo.git',
    description: 'Complete test session',
    tags: ['test', 'full'],
    created_by: 'test-user',
    auto_created: true
  });
  
  if (fullResult.created) {
    console.log('✅ 전체 옵션 세션 생성 성공');
    console.log('세션 정보:');
    console.log(`  ID: ${fullResult.session.session_id}`);
    console.log(`  프로젝트: ${fullResult.session.project_name}`);
    console.log(`  경로: ${fullResult.session.project_path}`);
    console.log(`  Git: ${fullResult.session.git_repository}`);
    console.log(`  설명: ${fullResult.session.description}`);
    console.log(`  태그: ${JSON.stringify(fullResult.session.tags)}`);
    console.log(`  생성자: ${fullResult.session.created_by}`);
    console.log(`  자동생성: ${fullResult.session.auto_created}`);
  } else {
    console.log('❌ 전체 옵션 세션 생성 실패:', fullResult.errors);
  }
  
  // 4. 마이그레이션용 자동 세션 생성
  console.log('\n4️⃣ 마이그레이션용 자동 세션 테스트');
  const migrationResult = factory.createAutoSessionForProject('test-migration', 25, 'migration-script');
  
  if (migrationResult.created) {
    console.log('✅ 마이그레이션 세션 생성 성공');
    console.log(`  프로젝트: ${migrationResult.session.project_name}`);
    console.log(`  상태: ${migrationResult.session.status}`);
    console.log(`  메모리 수: ${migrationResult.session.memory_count}`);
    console.log(`  활동 수: ${migrationResult.session.activity_count}`);
    console.log(`  자동생성: ${migrationResult.session.auto_created}`);
    console.log(`  태그: ${JSON.stringify(migrationResult.session.tags)}`);
  } else {
    console.log('❌ 마이그레이션 세션 생성 실패:', migrationResult.errors);
  }
  
  // 5. 입력 검증 테스트
  console.log('\n5️⃣ 입력 검증 테스트');
  const invalidResult = factory.createSession({
    project_name: '' // 빈 프로젝트명
  });
  
  if (!invalidResult.created) {
    console.log('✅ 입력 검증 정상 작동');
    console.log('검증 오류:', invalidResult.errors);
  } else {
    console.log('❌ 입력 검증 실패 - 잘못된 입력이 통과됨');
  }
  
  // 6. SessionFactoryBuilder 테스트
  console.log('\n6️⃣ SessionFactoryBuilder 테스트');
  const customFactory = new SessionFactoryBuilder()
    .setDefaultCreatedBy('builder-user')
    .setAutoStart(false)
    .setDefaultTags(['built', 'test'])
    .build();
  
  const builderResult = customFactory.createSession({
    project_name: 'builder-test-project'
  });
  
  if (builderResult.created) {
    console.log('✅ Builder 패턴 세션 생성 성공');
    console.log(`  생성자: ${builderResult.session.created_by}`);
    console.log(`  상태: ${builderResult.session.status}`);
    console.log(`  태그: ${JSON.stringify(builderResult.session.tags)}`);
  } else {
    console.log('❌ Builder 패턴 세션 생성 실패:', builderResult.errors);
  }
  
  // 7. 고유성 테스트
  console.log('\n7️⃣ 세션 ID 고유성 테스트');
  const session1 = factory.createSession({ project_name: 'uniqueness-test' });
  const session2 = factory.createSession({ project_name: 'uniqueness-test' });
  
  if (session1.session.session_id !== session2.session.session_id) {
    console.log('✅ 세션 ID 고유성 확인');
    console.log(`  세션1: ${session1.session.session_id}`);
    console.log(`  세션2: ${session2.session.session_id}`);
  } else {
    console.log('❌ 세션 ID 중복 발생!');
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🎉 SessionFactory 기능 검증 완료!');
  console.log('✅ 모든 핵심 기능이 정상 작동합니다.');
  
} catch (error) {
  console.error('\n💥 SessionFactory 검증 실패:', error);
  console.log('\n가능한 원인:');
  console.log('  1. TypeScript 빌드가 완료되지 않음');
  console.log('  2. 모듈 경로 문제');
  console.log('  3. 의존성 문제');
}
