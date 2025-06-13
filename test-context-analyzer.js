/**
 * ProjectContextAnalyzer 테스트 스크립트
 * 실제 프로젝트에서 ProjectContextAnalyzer를 테스트
 */

import { ProjectContextAnalyzer } from './dist/session/ProjectContextAnalyzer.js';

async function testProjectContextAnalyzer() {
  console.log('🔍 ProjectContextAnalyzer 테스트 시작...\n');
  
  const analyzer = new ProjectContextAnalyzer();
  const projectPath = process.cwd();
  
  try {
    console.log(`📁 분석 대상: ${projectPath}`);
    
    const startTime = Date.now();
    const context = await analyzer.analyzeProjectContext(projectPath);
    const endTime = Date.now();
    
    console.log(`⏱️ 분석 시간: ${endTime - startTime}ms\n`);
    
    // 결과 출력
    console.log('='.repeat(60));
    console.log(analyzer.generateProjectSummary(context));
    console.log('='.repeat(60));
    
    // 상세 정보 출력
    console.log('\n📋 상세 분석 결과:');
    console.log(`🎯 감지 신뢰도: ${context.detection.confidence}%`);
    console.log(`📦 설정 파일들: ${context.detection.configFiles.join(', ')}`);
    
    if (context.workspace.mainEntryPoints.length > 0) {
      console.log(`🚪 진입점 파일들: ${context.workspace.mainEntryPoints.join(', ')}`);
    }
    
    if (context.dependencies.frameworksDetected.length > 0) {
      console.log(`🚀 감지된 프레임워크: ${context.dependencies.frameworksDetected.join(', ')}`);
    }
    
    if (context.dependencies.majorLibraries.length > 0) {
      console.log(`📚 주요 라이브러리: ${context.dependencies.majorLibraries.join(', ')}`);
    }
    
    console.log(`\n📊 워크스페이스 구조:`);
    console.log(`  • 소스 디렉토리: ${context.workspace.sourceDirectories.join(', ') || '없음'}`);
    console.log(`  • 테스트 디렉토리: ${context.workspace.testDirectories.join(', ') || '없음'}`);
    console.log(`  • 빌드 디렉토리: ${context.workspace.buildDirectories.join(', ') || '없음'}`);
    
    if (context.git.isGitRepository) {
      console.log(`\n🌿 Git 정보:`);
      console.log(`  • 브랜치: ${context.git.currentBranch || '알 수 없음'}`);
      if (context.git.remoteUrl) {
        console.log(`  • 원격 저장소: ${context.git.remoteUrl}`);
      }
      console.log(`  • Ignore 패턴: ${context.git.ignoredPatterns.length}개`);
    }
    
    console.log('\n✅ ProjectContextAnalyzer 테스트 완료!');
    
    return context;
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    throw error;
  }
}

// 스크립트 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  testProjectContextAnalyzer().catch(console.error);
}

export { testProjectContextAnalyzer };
