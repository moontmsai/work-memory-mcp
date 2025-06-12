#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

console.log('🎉 Work Memory MCP Server 설치를 완료했습니다!');

// 기본 데이터 디렉토리 생성
const defaultDataDir = join(homedir(), '.work-memory');

try {
  if (!existsSync(defaultDataDir)) {
    mkdirSync(defaultDataDir, { recursive: true });
    console.log(`📁 기본 데이터 디렉토리 생성: ${defaultDataDir}`);
  }
  
  // 기본 디렉토리 구조 생성
  const subdirs = [
    'history/changes',
    'history/versions', 
    'cache',
    'backups',
    'logs'
  ];
  
  subdirs.forEach(subdir => {
    const fullPath = join(defaultDataDir, subdir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  });
  
  // 기본 설정 파일 생성
  const configPath = join(defaultDataDir, 'config.json');
  if (!existsSync(configPath)) {
    const defaultConfig = {
      dataDir: defaultDataDir,
      logLevel: 'INFO',
      maxMemorySize: 1048576,
      cacheTTL: 300,
      backupInterval: 60,
      indexRebuildThreshold: 1000
    };
    
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`⚙️ 기본 설정 파일 생성: ${configPath}`);
  }
  
} catch (error) {
  console.warn('⚠️ 초기 설정 중 일부 오류가 발생했습니다:', error.message);
  console.log('💡 수동으로 설정하려면 work-memory-mcp --setup을 실행하세요.');
}

console.log(`
🚀 다음 단계:

1. MCP 서버 설정:
   - Cursor: ~/.cursor/mcp.json 또는 .cursor/mcp.json
   - Claude: ~/.config/claude-desktop/claude_desktop_config.json

2. 설정 예시:
   {
     "mcpServers": {
       "work-memory": {
         "command": "work-memory-mcp"
       }
     }
   }

3. 서버 시작:
   work-memory-mcp

4. 도움말:
   work-memory-mcp --help

📖 더 자세한 설명: https://github.com/your-repo/work-memory-mcp/blob/main/docs/INSTALLATION.md
`); 