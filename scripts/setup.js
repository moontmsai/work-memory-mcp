#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';

// 콘솔 색상
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

// 사용자 입력 인터페이스
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log(colorize('\n🧠 Work Memory MCP Server 설정 도우미', 'cyan'));
  console.log(colorize('=' * 50, 'blue'));
  
  try {
    // 1. 데이터 디렉토리 설정
    const dataDir = await setupDataDirectory();
    
    // 2. 로그 레벨 설정
    const logLevel = await setupLogLevel();
    
    // 3. 고급 설정
    const advancedConfig = await setupAdvancedConfig();
    
    // 4. MCP 설정 생성
    await setupMCPConfig(dataDir);
    
    // 5. 설정 파일 저장
    await saveConfiguration({
      dataDir,
      logLevel,
      ...advancedConfig
    });
    
    console.log(colorize('\n✅ 설정이 완료되었습니다!', 'green'));
    console.log(colorize('\n🚀 이제 work-memory-mcp를 실행할 수 있습니다.', 'cyan'));
    
  } catch (error) {
    console.error(colorize('\n❌ 설정 중 오류가 발생했습니다:', 'red'), error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

async function setupDataDirectory() {
  console.log(colorize('\n📁 데이터 저장 디렉토리 설정', 'yellow'));
  
  const defaultDir = join(homedir(), '.work-memory');
  const answer = await question(`데이터 디렉토리 경로 (기본값: ${defaultDir}): `);
  const dataDir = answer.trim() || defaultDir;
  const resolvedDir = resolve(dataDir);
  
  // 디렉토리 생성
  try {
    if (!existsSync(resolvedDir)) {
      mkdirSync(resolvedDir, { recursive: true });
      console.log(colorize(`✅ 디렉토리 생성: ${resolvedDir}`, 'green'));
    } else {
      console.log(colorize(`✅ 기존 디렉토리 사용: ${resolvedDir}`, 'green'));
    }
    
    // 하위 디렉토리 생성
    const subdirs = [
      'history/changes',
      'history/versions',
      'cache',
      'backups',
      'logs'
    ];
    
    subdirs.forEach(subdir => {
      const fullPath = join(resolvedDir, subdir);
      if (!existsSync(fullPath)) {
        mkdirSync(fullPath, { recursive: true });
      }
    });
    
    return resolvedDir;
  } catch (error) {
    throw new Error(`디렉토리 생성 실패: ${error.message}`);
  }
}

async function setupLogLevel() {
  console.log(colorize('\n📋 로그 레벨 설정', 'yellow'));
  console.log('1. DEBUG - 상세한 디버그 정보');
  console.log('2. INFO - 일반적인 정보 (권장)');
  console.log('3. WARN - 경고 메시지만');
  console.log('4. ERROR - 오류 메시지만');
  
  const answer = await question('로그 레벨을 선택하세요 (1-4, 기본값: 2): ');
  const choice = parseInt(answer.trim()) || 2;
  
  const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  const logLevel = levels[choice - 1] || 'INFO';
  
  console.log(colorize(`✅ 로그 레벨: ${logLevel}`, 'green'));
  return logLevel;
}

async function setupAdvancedConfig() {
  console.log(colorize('\n⚙️ 고급 설정', 'yellow'));
  
  const advanced = await question('고급 설정을 구성하시겠습니까? (y/N): ');
  
  if (advanced.toLowerCase() !== 'y') {
    return {
      maxMemorySize: 1048576,
      cacheTTL: 300,
      backupInterval: 60,
      indexRebuildThreshold: 1000
    };
  }
  
  const maxMemoryAnswer = await question('최대 메모리 크기 (바이트, 기본값: 1048576): ');
  const maxMemorySize = parseInt(maxMemoryAnswer.trim()) || 1048576;
  
  const cacheTTLAnswer = await question('캐시 TTL (초, 기본값: 300): ');
  const cacheTTL = parseInt(cacheTTLAnswer.trim()) || 300;
  
  const backupIntervalAnswer = await question('백업 간격 (분, 기본값: 60): ');
  const backupInterval = parseInt(backupIntervalAnswer.trim()) || 60;
  
  const indexThresholdAnswer = await question('인덱스 재구성 임계값 (기본값: 1000): ');
  const indexRebuildThreshold = parseInt(indexThresholdAnswer.trim()) || 1000;
  
  return {
    maxMemorySize,
    cacheTTL,
    backupInterval,
    indexRebuildThreshold
  };
}

async function setupMCPConfig(dataDir) {
  console.log(colorize('\n🔗 MCP 설정 생성', 'yellow'));
  
  const setupMCP = await question('MCP 설정 파일을 자동으로 생성하시겠습니까? (y/N): ');
  
  if (setupMCP.toLowerCase() !== 'y') {
    console.log(colorize('⏭️ MCP 설정을 건너뜁니다.', 'yellow'));
    return;
  }
  
  console.log('\nMCP 클라이언트를 선택하세요:');
  console.log('1. Cursor');
  console.log('2. Claude Desktop');
  console.log('3. 둘 다');
  
  const clientChoice = await question('선택 (1-3): ');
  const choice = parseInt(clientChoice.trim());
  
  if (choice === 1 || choice === 3) {
    await createCursorConfig(dataDir);
  }
  
  if (choice === 2 || choice === 3) {
    await createClaudeConfig(dataDir);
  }
}

async function createCursorConfig(dataDir) {
  const cursorConfigPath = join(homedir(), '.cursor', 'mcp.json');
  
  try {
    // 기존 설정 읽기
    let config = {};
    if (existsSync(cursorConfigPath)) {
      config = JSON.parse(readFileSync(cursorConfigPath, 'utf8'));
    }
    
    // 설정 추가/업데이트
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    
    config.mcpServers['work-memory'] = {
      command: 'work-memory-mcp',
      env: {
        WORK_MEMORY_DIR: dataDir
      }
    };
    
    // 디렉토리 생성
    mkdirSync(join(homedir(), '.cursor'), { recursive: true });
    
    // 설정 파일 저장
    writeFileSync(cursorConfigPath, JSON.stringify(config, null, 2));
    console.log(colorize(`✅ Cursor 설정 생성: ${cursorConfigPath}`, 'green'));
    
  } catch (error) {
    console.warn(colorize(`⚠️ Cursor 설정 생성 실패: ${error.message}`, 'yellow'));
  }
}

async function createClaudeConfig(dataDir) {
  const claudeConfigPath = join(homedir(), '.config', 'claude-desktop', 'claude_desktop_config.json');
  
  try {
    // 기존 설정 읽기
    let config = {};
    if (existsSync(claudeConfigPath)) {
      config = JSON.parse(readFileSync(claudeConfigPath, 'utf8'));
    }
    
    // 설정 추가/업데이트
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    
    config.mcpServers['work-memory'] = {
      command: 'work-memory-mcp',
      env: {
        WORK_MEMORY_DIR: dataDir
      }
    };
    
    // 디렉토리 생성
    mkdirSync(join(homedir(), '.config', 'claude-desktop'), { recursive: true });
    
    // 설정 파일 저장
    writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2));
    console.log(colorize(`✅ Claude Desktop 설정 생성: ${claudeConfigPath}`, 'green'));
    
  } catch (error) {
    console.warn(colorize(`⚠️ Claude Desktop 설정 생성 실패: ${error.message}`, 'yellow'));
  }
}

async function saveConfiguration(config) {
  const configPath = join(config.dataDir, 'config.json');
  
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(colorize(`✅ 설정 파일 저장: ${configPath}`, 'green'));
  } catch (error) {
    throw new Error(`설정 파일 저장 실패: ${error.message}`);
  }
}

// 메인 실행
main().catch(error => {
  console.error(colorize('\n❌ 설정 도우미 실행 오류:', 'red'), error.message);
  process.exit(1);
}); 