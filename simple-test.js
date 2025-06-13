/**
 * 간단한 테스트 스크립트
 */

console.log('🔍 테스트 시작...');

try {
  const { ProjectContextAnalyzer } = await import('./dist/session/ProjectContextAnalyzer.js');
  console.log('✅ ProjectContextAnalyzer 임포트 성공');
  
  const analyzer = new ProjectContextAnalyzer();
  console.log('✅ ProjectContextAnalyzer 인스턴스 생성 성공');
  
  console.log('📁 현재 디렉토리 분석 시작...');
  const projectPath = process.cwd();
  console.log(`분석 경로: ${projectPath}`);
  
  const context = await analyzer.analyzeProjectContext(projectPath);
  console.log('✅ 프로젝트 컨텍스트 분석 완료!');
  
  const summary = analyzer.generateProjectSummary(context);
  console.log('\n' + '='.repeat(60));
  console.log(summary);
  console.log('='.repeat(60));
  
} catch (error) {
  console.error('❌ 에러 발생:', error.message);
  console.error(error.stack);
}

console.log('🏁 테스트 완료');
