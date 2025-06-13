// PathPatternDetector 실제 동작 테스트
import { PathPatternDetector } from './dist/session/PathPatternDetector.js';

async function testDetector() {
  console.log('🔍 PathPatternDetector 테스트 시작...\n');
  
  const detector = new PathPatternDetector();
  
  // 현재 프로젝트 디렉토리 감지 테스트
  const currentDir = process.cwd();
  console.log(`📁 테스트 디렉토리: ${currentDir}`);
  
  try {
    const result = await detector.detectProject(currentDir);
    
    if (result) {
      console.log('\n✅ 프로젝트 감지 성공!');
      console.log(`📦 프로젝트명: ${result.projectName}`);
      console.log(`🏷️  프로젝트 타입: ${result.projectType.join(', ')}`);
      console.log(`📂 프로젝트 루트: ${result.projectRoot}`);
      console.log(`🔗 Git 저장소: ${result.gitRepository || '없음'}`);
      console.log(`📦 패키지 매니저: ${result.packageManager || '없음'}`);
      console.log(`🎯 신뢰도: ${result.confidence}%`);
      console.log(`📄 설정 파일들:`);
      result.configFiles.forEach(file => console.log(`   - ${file}`));
      
      console.log(`\n📊 메타데이터:`);
      console.log(`   이름: ${result.metadata.name || '없음'}`);
      console.log(`   버전: ${result.metadata.version || '없음'}`);
      console.log(`   설명: ${result.metadata.description || '없음'}`);
      
    } else {
      console.log('\n❌ 프로젝트 감지 실패');
    }
    
  } catch (error) {
    console.error('\n💥 오류 발생:', error.message);
  }
  
  // 규칙 정보 출력
  console.log('\n📋 등록된 패턴 규칙들:');
  const rules = detector.getRules();
  rules.forEach((rule, index) => {
    console.log(`${index + 1}. ${rule.name} (우선순위: ${rule.priority})`);
    console.log(`   패턴: ${rule.patterns.join(', ')}`);
    console.log(`   타입: ${rule.projectType}`);
  });
}

testDetector().catch(console.error);
