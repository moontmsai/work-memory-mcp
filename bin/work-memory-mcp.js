#!/usr/bin/env node

/**
 * 업무 메모리 MCP 서버 실행 스크립트
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 버전 정보
const VERSION = '1.0.0';

// 도움말 메시지
const HELP_MESSAGE = `
🧠 Work Memory MCP Server v${VERSION}

사용법:
  work-memory-mcp [옵션]

옵션:
  --version, -v     버전 정보 표시
  --help, -h        도움말 표시
  --setup           초기 설정 실행
  --config <path>   설정 파일 경로 지정
  --data-dir <path> 데이터 디렉토리 경로 지정
  --log-level <level> 로그 레벨 설정 (DEBUG, INFO, WARN, ERROR)

환경 변수:
  WORK_MEMORY_DIR   데이터 저장 디렉토리
  LOG_LEVEL         로그 레벨

예시:
  work-memory-mcp                     # 서버 시작
  work-memory-mcp --setup            # 초기 설정
  work-memory-mcp --data-dir ./data  # 사용자 정의 데이터 디렉토리

더 많은 정보: https://github.com/your-repo/work-memory-mcp
`;

// 메인 함수
function main() {
  const args = process.argv.slice(2);
  
  // 버전 확인
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`work-memory-mcp v${VERSION}`);
    process.exit(0);
  }
  
  // 도움말 확인
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP_MESSAGE);
    process.exit(0);
  }
  
  // 설정 모드
  if (args.includes('--setup')) {
    runSetup();
    return;
  }
  
  // 환경 변수 설정
  const env = { ...process.env };
  
  // 데이터 디렉토리 설정
  const dataDirIndex = args.indexOf('--data-dir');
  if (dataDirIndex !== -1 && args[dataDirIndex + 1]) {
    env.WORK_MEMORY_DIR = args[dataDirIndex + 1];
  }
  
  // 로그 레벨 설정
  const logLevelIndex = args.indexOf('--log-level');
  if (logLevelIndex !== -1 && args[logLevelIndex + 1]) {
    env.LOG_LEVEL = args[logLevelIndex + 1];
  }
  
  // 설정 파일 경로
  const configIndex = args.indexOf('--config');
  if (configIndex !== -1 && args[configIndex + 1]) {
    env.CONFIG_PATH = args[configIndex + 1];
  }
  
  // 메인 서버 실행
  startServer(env);
}

// 설정 실행
function runSetup() {
  const setupScript = join(__dirname, '..', 'scripts', 'setup.js');
  
  if (!existsSync(setupScript)) {
    console.error('❌ 설정 스크립트를 찾을 수 없습니다:', setupScript);
    process.exit(1);
  }
  
  console.log('🔧 Work Memory MCP Server 설정을 시작합니다...');
  
  const setup = spawn('node', [setupScript], {
    stdio: 'inherit',
    env: process.env
  });
  
  setup.on('close', (code) => {
    if (code === 0) {
      console.log('✅ 설정이 완료되었습니다!');
    } else {
      console.error('❌ 설정 중 오류가 발생했습니다.');
      process.exit(code);
    }
  });
}

// 서버 시작
function startServer(env) {
  const serverPath = join(__dirname, '..', 'dist', 'index.js');
  
  if (!existsSync(serverPath)) {
    console.error('❌ 서버 파일을 찾을 수 없습니다:', serverPath);
    console.error('💡 먼저 빌드를 실행해주세요: npm run build');
    process.exit(1);
  }
  
  console.log('🧠 Work Memory MCP Server를 시작합니다...');
  
  const server = spawn('node', [serverPath], {
    stdio: 'inherit',
    env
  });
  
  server.on('close', (code) => {
    console.log(`서버가 종료되었습니다. 코드: ${code}`);
    process.exit(code);
  });
  
  server.on('error', (error) => {
    console.error('❌ 서버 시작 오류:', error.message);
    process.exit(1);
  });
  
  // 종료 시그널 처리
  process.on('SIGINT', () => {
    console.log('\n🛑 서버를 종료합니다...');
    server.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 서버를 종료합니다...');
    server.kill('SIGTERM');
  });
}

// 메인 실행
main();