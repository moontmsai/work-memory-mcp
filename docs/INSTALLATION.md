# 🚀 Work Memory MCP Server 설치 가이드

이 가이드는 Work Memory MCP Server의 설치부터 설정까지 전체 과정을 다룹니다.

## 📋 시스템 요구사항

### 필수 소프트웨어
- **Node.js**: 18.0.0 이상
- **npm**: 8.0.0 이상
- **OS**: Windows 10+, macOS 10.15+, Linux (Ubuntu 20.04+)

### 권장 사양
- **RAM**: 최소 2GB, 권장 4GB+
- **Storage**: 최소 100MB 여유 공간
- **CPU**: x64 프로세서

## 📦 설치 방법

### 방법 1: Git 클론 (권장)

```bash
# 1. 리포지토리 클론
git clone https://github.com/your-repo/work-memory-mcp.git
cd work-memory-mcp

# 2. 의존성 설치
npm install

# 3. TypeScript 빌드
npm run build

# 4. 설치 확인
node ./dist/index.js --version
```

### 방법 2: NPM 패키지 설치

```bash
# NPM 글로벌 설치
npm install -g work-memory-mcp

# 또는 로컬 설치
npm install work-memory-mcp
```

### 방법 3: 바이너리 다운로드

GitHub Releases에서 OS별 바이너리를 다운로드할 수 있습니다.

```bash
# Windows
curl -o work-memory-mcp.exe https://github.com/your-repo/work-memory-mcp/releases/latest/download/work-memory-mcp-win.exe

# macOS
curl -o work-memory-mcp https://github.com/your-repo/work-memory-mcp/releases/latest/download/work-memory-mcp-macos
chmod +x work-memory-mcp

# Linux
curl -o work-memory-mcp https://github.com/your-repo/work-memory-mcp/releases/latest/download/work-memory-mcp-linux
chmod +x work-memory-mcp
```

## ⚙️ MCP 설정

### Cursor 설정

1. **설정 파일 위치**
   - Windows: `%APPDATA%\Cursor\User\globalStorage\cursor-mcp\mcp.json`
   - macOS: `~/Library/Application Support/Cursor/User/globalStorage/cursor-mcp/mcp.json`
   - Linux: `~/.config/Cursor/User/globalStorage/cursor-mcp/mcp.json`

2. **설정 파일 예시**
```json
{
  "mcpServers": {
    "work-memory": {
      "command": "node",
      "args": ["/full/path/to/work-memory-mcp/dist/index.js"],
      "cwd": "/full/path/to/work-memory-mcp",
      "env": {
        "WORK_MEMORY_DIR": "/path/to/data/directory",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

3. **Windows 경로 예시**
```json
{
  "mcpServers": {
    "work-memory": {
      "command": "node",
      "args": ["C:\\work-memory-mcp\\dist\\index.js"],
      "cwd": "C:\\work-memory-mcp",
      "env": {
        "WORK_MEMORY_DIR": "C:\\work-memory-data",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

### Claude Desktop 설정

1. **설정 파일 위치**
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Linux: `~/.config/claude-desktop/claude_desktop_config.json`

2. **설정 파일 예시**
```json
{
  "mcpServers": {
    "work-memory": {
      "command": "node",
      "args": ["/full/path/to/work-memory-mcp/dist/index.js"],
      "env": {
        "WORK_MEMORY_DIR": "/path/to/data/directory",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

## 🔧 환경 변수 설정

### 필수 환경 변수

| 변수명 | 설명 | 기본값 | 예시 |
|--------|------|--------|------|
| `WORK_MEMORY_DIR` | 데이터 저장 디렉토리 | `./work_memory` | `/home/user/memory_data` |

### 선택적 환경 변수

| 변수명 | 설명 | 기본값 | 가능한 값 |
|--------|------|--------|-----------|
| `LOG_LEVEL` | 로그 레벨 | `INFO` | `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `MAX_MEMORY_SIZE` | 최대 메모리 크기 (바이트) | `1048576` | 숫자 |
| `CACHE_TTL` | 캐시 TTL (초) | `300` | 숫자 |
| `BACKUP_INTERVAL` | 백업 간격 (분) | `60` | 숫자 |
| `INDEX_REBUILD_THRESHOLD` | 인덱스 재구성 임계값 | `1000` | 숫자 |

### 환경 변수 설정 방법

#### Windows
```cmd
# CMD
set WORK_MEMORY_DIR=C:\MyMemoryData
set LOG_LEVEL=DEBUG

# PowerShell
$env:WORK_MEMORY_DIR="C:\MyMemoryData"
$env:LOG_LEVEL="DEBUG"
```

#### macOS/Linux
```bash
# Bash/Zsh
export WORK_MEMORY_DIR="/home/user/memory_data"
export LOG_LEVEL="DEBUG"

# 영구 설정 (~/.bashrc 또는 ~/.zshrc에 추가)
echo 'export WORK_MEMORY_DIR="/home/user/memory_data"' >> ~/.bashrc
echo 'export LOG_LEVEL="INFO"' >> ~/.bashrc
```

## 📁 디렉토리 구조 설정

### 기본 디렉토리 구조
```
work_memory/
├── current_work.json          # 현재 메모리 데이터
├── search_index.json          # 검색 인덱스
├── history/                   # 변경 히스토리
│   ├── changes/              # 변경 로그
│   └── versions/             # 버전 데이터
├── cache/                    # 캐시 파일
├── backups/                  # 백업 파일
└── logs/                     # 로그 파일
```

### 디렉토리 권한 설정

#### Windows
```cmd
# 데이터 디렉토리에 쓰기 권한 부여
icacls "C:\work_memory" /grant:r "%USERNAME%":(OI)(CI)F
```

#### macOS/Linux
```bash
# 디렉토리 생성 및 권한 설정
mkdir -p ~/work_memory
chmod 755 ~/work_memory

# 하위 디렉토리 생성
mkdir -p ~/work_memory/{history/changes,history/versions,cache,backups,logs}
chmod 755 ~/work_memory/{history,cache,backups,logs}
chmod 644 ~/work_memory/history/{changes,versions}
```

## 🔍 설치 검증

### 1. 기본 실행 테스트
```bash
# 서버 시작 (개발 모드)
npm run dev

# 또는 프로덕션 모드
node ./dist/index.js
```

**예상 출력:**
```
[HH:MM:SS] INFO [MCP_SERVER] Initializing Work Memory MCP Server
[HH:MM:SS] INFO [MCP_SERVER] Work Memory MCP Server initialized successfully
[HH:MM:SS] INFO [MCP_SERVER] Starting MCP transport connection
🧠 Work Memory MCP Server v0.1.0 started
📝 Available tools: 12 memory management tools
🔄 Ready for Claude/Cursor integration
```

### 2. MCP 연결 테스트

#### Cursor에서 테스트
1. Cursor 재시작
2. 새 채팅 생성
3. 다음 명령어 테스트:
```
메모리 시스템이 작동하는지 확인해주세요.
```

#### Claude Desktop에서 테스트
1. Claude Desktop 재시작
2. 다음 명령어 테스트:
```
work memory 시스템 상태를 확인해주세요.
```

### 3. 기능 테스트
```bash
# 테스트 스위트 실행
npm test

# 특정 테스트 실행
npm run test:integration
```

## 🚨 문제 해결

### 일반적인 설치 문제

#### 1. Node.js 버전 문제
```bash
# Node.js 버전 확인
node --version

# Node.js 업데이트 (Windows)
choco upgrade nodejs

# Node.js 업데이트 (macOS)
brew upgrade node

# Node.js 업데이트 (Linux)
sudo apt update && sudo apt upgrade nodejs npm
```

#### 2. 권한 문제
```bash
# npm 권한 문제 해결 (Linux/macOS)
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Windows 관리자 권한으로 실행
# PowerShell을 관리자로 실행하여 설치
```

#### 3. 빌드 오류
```bash
# node_modules 정리 후 재설치
rm -rf node_modules package-lock.json
npm install

# TypeScript 재빌드
npm run clean
npm run build
```

#### 4. 경로 문제
```bash
# 절대 경로 사용 확인
pwd  # 현재 디렉토리 확인

# Windows에서 경로 변환
echo %CD%  # 현재 디렉토리
```

### MCP 연결 문제

#### 1. 서버가 시작되지 않음
- 포트 충돌 확인: `netstat -an | grep :3000`
- 로그 확인: `LOG_LEVEL=DEBUG node ./dist/index.js`
- 방화벽 설정 확인

#### 2. AI 도구에서 인식 안됨
- 설정 파일 경로 확인
- JSON 문법 검증: [JSONLint](https://jsonlint.com/)
- AI 도구 재시작

#### 3. 권한 오류
```bash
# 데이터 디렉토리 권한 확인
ls -la ~/work_memory

# 권한 수정 (Linux/macOS)
chmod -R 755 ~/work_memory
```

### 로그 확인 방법

#### 1. 서버 로그
```bash
# 디버그 모드로 실행
LOG_LEVEL=DEBUG node ./dist/index.js 2>&1 | tee server.log
```

#### 2. 시스템 로그
```bash
# Windows 이벤트 로그
eventvwr.msc

# macOS 시스템 로그
console.app

# Linux 시스템 로그
journalctl -f
```

## 🔄 업데이트

### Git 기반 업데이트
```bash
# 최신 코드 가져오기
git pull origin main

# 의존성 업데이트
npm install

# 재빌드
npm run build

# 서버 재시작
npm restart
```

### NPM 기반 업데이트
```bash
# 패키지 업데이트
npm update work-memory-mcp

# 글로벌 패키지 업데이트
npm update -g work-memory-mcp
```

## 🛠️ 개발 환경 설정

### 개발 도구 설치
```bash
# 개발 의존성 설치
npm install --save-dev @types/node typescript ts-node nodemon

# 개발 서버 실행
npm run dev

# 자동 재시작으로 개발
npm run dev:watch
```

### VS Code 설정
1. 확장 프로그램 설치:
   - TypeScript
   - ESLint
   - Prettier

2. `.vscode/settings.json` 설정:
```json
{
  "typescript.preferences.includePackageJsonAutoImports": "auto",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## 📞 지원

### 문서
- [API 레퍼런스](./API.md)
- [사용자 가이드](./USER_GUIDE.md)
- [FAQ](./FAQ.md)

### 커뮤니티
- GitHub Issues: 버그 리포트 및 기능 요청
- Discord: 실시간 지원 및 토론
- Wiki: 커뮤니티 문서

### 기업 지원
기업용 지원이 필요한 경우 contact@example.com으로 문의해주세요.

---

> 💡 **팁**: 설치 후 `get_server_status` 도구를 사용하여 시스템이 정상 동작하는지 확인하세요! 