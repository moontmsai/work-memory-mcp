# Work Memory MCP Server

An integrated MCP (Model Context Protocol) server for managing work memories and sharing context between AI tools.

## Project Purpose

Work Memory MCP is a memory management system that helps developers and knowledge workers maintain consistent work context while using multiple AI tools (Claude, Cursor AI, etc.). It systematically manages knowledge and work progress accumulated from individual AI conversation sessions, providing a continuous and efficient work environment.

## Core Values

### Persistence
While AI conversations disappear when sessions end, important work content and deliverables should be permanently preserved. Work Memory MCP safely stores all important work memories in a SQLite database, making them accessible at any time.

### Consistency
You can share the same work context even when using multiple AI tools. Work started in Claude Desktop can be continued in Cursor AI or referenced from other tools, providing a consistent work environment.

### Efficiency
There's no need to repeatedly explain already solved problems or organized information. Through an advanced search system, you can quickly find and reuse past work content, significantly improving work efficiency.

### Organization
Rather than randomly scattered information, you can build a systematically organized knowledge base by project, importance level, and tags. Session-based management clearly separates and manages the context of each project.

## Key Features

### Memory Management
- Store work content, deliverables, and learned information in structured format
- Priority management through importance scores (0-10 points)
- Multi-dimensional classification through tag system
- Separate management of todos and general memories
- Work progress management through completion status tracking

### Session Management
- Create independent work sessions by project
- Automatic session context detection and connection
- Session-specific work memory linking and tracking
- Session lifecycle management (creation, activation, termination)

### Advanced Search
- Keyword-based full-text search
- Filtering by project, importance, and session
- Related keyword recommendation system
- Search result highlighting and context provision
- Search performance optimization and statistics

### History Management
- Track all work memory change history
- Previous state restoration through version management system
- Change comparison and analysis
- Automatic backup and recovery features

### System Optimization
- Database performance monitoring
- Automatic index management and optimization
- Memory usage tracking
- Batch operation processing system
- Safe data cleanup features

## Integrated Tool Configuration

Work Memory MCP consists of 5 integrated tools:

### 1. Memory (Memory Management)
Core tool responsible for creating, modifying, querying, and deleting work memories.

**Key Functions:**
- `add`: Add new work memory
- `update`: Modify existing work memory
- `list`: Query work memory list (with filtering and paging support)
- `delete`: Delete or archive work memory

**Supported Data Types:**
- General memory: Learning content, ideas, reference materials
- Todos: Tasks to be performed and their progress status
- Project-based classification
- Tag-based multi-dimensional classification
- Importance scores (0-10 points)

### 2. Search (Search and Analysis)
Tool for efficiently finding and analyzing stored work memories.

**Key Functions:**
- `search`: Keyword-based search
- `keywords`: Related keyword analysis
- `stats`: Search system statistics
- `optimize`: Search index optimization

**Search Features:**
- Full-text search
- Multi-condition filtering
- Importance-based sorting
- Search result highlighting
- Related keyword recommendations
- Search performance statistics

### 3. Session (Session Management)
Tool for managing project-specific work sessions.

**Key Functions:**
- `create`: Create new session
- `activate`: Activate session
- `deactivate`: Deactivate session
- `list`: Query session list
- `status`: Check current session status
- `detect`: Automatic session detection

**Session Management Features:**
- Independent workspace by project
- Automatic session detection and connection
- Session-specific work memory linking
- Exclusive session mode (maintained for 30 minutes)
- Session statistics and activity tracking

### 4. History (History Management)
Tool for managing change history and versions of work memories.

**Key Functions:**
- `changes`: Query change history
- `versions`: Query version list
- `restore`: Restore previous version
- `list_versions`: Full version history

**Version Management Features:**
- Automatic version creation
- Detailed change tracking
- Version comparison functionality
- Selective restoration capability
- Version cleanup and optimization

### 5. System (System Management)
Tool responsible for server status monitoring and system optimization.

**Key Functions:**
- `status`: Query server status
- `monitor`: Real-time monitoring
- `optimize`: Database optimization
- `batch`: Batch operation processing
- `delete`: Category-based data cleanup
- `diagnose`: System diagnosis
- `analyze`: Detailed analysis
- `repair`: Automatic recovery

**System Management Features:**
- Real-time performance monitoring
- Automatic index management
- Memory usage tracking
- Database optimization
- Safe data cleanup
- System health diagnosis

## Installation

### 1. System Requirements
- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Operating System: Windows, macOS, Linux

### 2. Clone and Install Project
```bash
git clone https://github.com/your-repo/work-memory-mcp.git
cd work-memory-mcp
npm install
```

### 3. Build Project
```bash
npm run build
```

### 4. Test Server Execution
```bash
npm start
```

## Configuration

### Claude Desktop Configuration (or cursor.ai)
To use Work Memory MCP in Claude Desktop, add the following to the configuration file:

**Windows Configuration File Location:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS Configuration File Location:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Configuration File Content:**
```json
{
  "mcpServers": {
    "work-memory": {
      "command": "node",
      "args": ["/PATH/work-memory/dist/index.js"],
      "env": {
        "WORK_MEMORY_DIR": "/PATH/work-memory/data/",
        "LOG_LEVEL": "WARN",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Environment Variable Configuration (Optional)
You can set the following environment variables:

```env
# Log level setting (default: INFO)
LOG_LEVEL=WARN

# Database storage directory (default: ./work_memory)
WORK_MEMORY_DIR=/PATH/work-memory/data/

# Database filename (only applied when WORK_MEMORY_DIR is set, default: database.sqlite)
DB_FILENAME=database.sqlite
```

Note: 
- If WORK_MEMORY_DIR is not set, DB_FILENAME is ignored and fixed to 'database.sqlite'.
- Cache memory usage (50MB) is currently hardcoded and cannot be set via environment variables.

### Cursor AI Configuration
To use with Cursor AI, you can connect through MCP extensions or plugins. Refer to Cursor AI's MCP support documentation for detailed configuration methods.

### Recommended User Configuration
For optimal use of Work Memory MCP, add the following configuration to your AI assistant's user preferences:

```
# [Execute once at session start]
0. When a session starts for the first time, execute the following:
   - Say "Searching for memories..."
   - Query the 3 latest work memories from work-memory mcp
   - Query the 3 highest priority incomplete todos
   - Brief the user on the retrieved work memories and todos

# [Smart Session Management]
1. When conversation content is determined to be related to a specific project, subject area, or ongoing work, automatically detect and activate related sessions.
   - Execute session_status detect_active when determined to be continuous work rather than simple Q&A
   - Auto-activate if related session exists, prepare new session if none exists
   - Once activated, maintain exclusive session for 30 minutes (extend with activity)
   - Change sessions only when switching to different subject areas
   - All related work automatically connects to the same session
   - Provide brief session overview

# [Repeated execution during general conversation]
2. During ongoing conversation, follow only these principles:
   - Judge importance of all responses (out of 100 points), store in work-memory mcp if 50 points or higher
   - Make judgments based only on existing memories, do not repeatedly query
```

## Usage Examples

### Basic Work Memory Addition
```json
{
  "operation": "add",
  "content": "For React component optimization, useMemo and useCallback should be used appropriately. Especially effective when used with React.memo for components with frequent prop changes",
  "project": "frontend-optimization",
  "tags": ["React", "performance-optimization", "useMemo", "useCallback"],
  "importance_score": 8,
  "work_type": "memory"
}
```

### Todo Addition and Management
```json
{
  "operation": "add",
  "content": "Implement caching strategy for API response time improvement",
  "project": "backend-optimization",
  "tags": ["caching", "performance", "API"],
  "importance_score": 9,
  "work_type": "todo",
  "worked": "incomplete",
  "requirements": "Implement Redis caching layer, set TTL, establish cache invalidation strategy"
}
```

### Advanced Search Usage
```json
{
  "operation": "search",
  "query": "React performance optimization",
  "project": "frontend-optimization",
  "importance_min": 7,
  "highlight_matches": true,
  "include_content": true
}
```

### Session-based Work
```json
// Create new project session
{
  "operation": "create",
  "session_name": "Mobile App Refactoring",
  "description": "Performance improvement and code structure enhancement project for existing mobile app"
}

// Add work memory linked to session
{
  "operation": "add",
  "content": "Mobile app performance bottleneck analysis completed. Main issues require image loading and state management optimization",
  "project": "Mobile App Refactoring",
  "auto_link": true
}
```

### System Management and Optimization
```json
// Database optimization
{
  "operation": "optimize",
  "vacuum_type": "incremental",
  "analyze": true
}

// Clean up low importance tasks
{
  "operation": "delete",
  "category": "work_memories",
  "delete_criteria": {
    "max_importance_score": 3,
    "older_than_days": 30
  },
  "archive_only": true
}
```

## Project Structure

```
work-memory-mcp/
├── src/
│   ├── database/          # Database related (SQLite, schema, connections)
│   ├── tools/            # MCP tool implementations (5 integrated tools)
│   │   ├── memory.ts     # Memory management tool
│   │   ├── search.ts     # Search and analysis tool
│   │   ├── session.ts    # Session management tool
│   │   ├── history.ts    # History management tool
│   │   └── system.ts     # System management tool
│   ├── utils/            # Utility functions
│   ├── types/            # TypeScript type definitions
│   ├── session/          # Session management and termination handling
│   ├── progress/         # Progress tracking system
│   └── index.ts          # Server entry point
├── tests/               # Test files
├── docs/                # Documentation
├── dist/                # Build output
└── work_memory/         # Database file storage directory
```

## Database Structure

Work Memory MCP uses SQLite with the following table structure:

### work_memories table
- Stores main data for all work memories
- Content, projects, tags, importance, work types, etc.

### sessions table
- Manages project session information
- Session metadata and activity statistics

### work_memory_history table
- Tracks work memory change history
- Version management and restoration support

### search_keywords table
- Keyword index for search optimization
- Full-text search performance enhancement

### project_index table
- Project-specific metadata management
- Project statistics and analysis

## Performance and Optimization

### Search Performance
- Fast search through 16 composite indexes
- Accuracy improvement through keyword weighting system
- Repeated search optimization through LRU cache

### Memory Management
- LRU cache with maximum 500 entries, 50MB limit (hardcoded)
- Automatic memory cleanup system
- Progress tracking for large operations

### Database Optimization
- Automatic VACUUM and ANALYZE execution
- Index coverage analysis and optimization
- Atomic operation guarantee through transactions

## Security and Safety

### Data Security
- Prevent external leakage through local SQLite database
- SQL injection prevention through input validation
- Safe file system access control

### Data Integrity
- Atomic operations through transactions
- Automatic backup and recovery system
- Data corruption detection and recovery

### Protocol Compliance
- Full compliance with MCP standard protocol
- JSON-RPC compatibility guarantee
- Communication stability through stdout protection

## Development Environment

### Development Mode Execution
```bash
npm run dev
```

### Test Execution
```bash
# All tests
npm test

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Performance tests
npm run test:performance

# Coverage tests
npm run test:coverage
```

### Code Quality Management
```bash
# Lint check
npm run lint

# Automatic lint fix
npm run lint:fix
```

## Troubleshooting

### Common Issues

**MCP Server Connection Failure**
```bash
# 1. Server restart
npm run build && npm start

# 2. Claude Desktop restart
# 3. Check configuration file path
```

**Database Performance Degradation**
```json
{
  "operation": "optimize",
  "vacuum_type": "full",
  "analyze": true
}
```

**Memory Usage Increase**
```json
{
  "operation": "delete",
  "category": "work_memories",
  "delete_criteria": {
    "max_importance_score": 2,
    "older_than_days": 60
  },
  "archive_only": true
}
```

### Debug Mode
You can check detailed logs by setting environment variables:
```bash
LOG_LEVEL=debug npm start
```

## License

MIT License - See LICENSE file for details.

## Contributing

1. Fork the project
2. Create feature branch (`git checkout -b feature/new-feature`)
3. Commit changes (`git commit -am 'Add new feature'`)
4. Push to branch (`git push origin feature/new-feature`)
5. Create Pull Request

## Support and Contact

- Email: moontmsai@gmail.com

## ☕ Support
If this project has been helpful, please support with a cup of coffee: [https://coff.ee/moontmsai](https://coff.ee/moontmsai)  
Your support is a great help for continuous open source development.
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%E2%98%95-blue?style=flat&logo=buy-me-a-coffee&logoColor=white)](https://coff.ee/moontmsai)

Thank you for using Work Memory MCP. Let's work together to create a better AI collaboration environment!

---

# Work Memory MCP Server (한글)

업무 작업 기억을 관리하고 AI 도구 간에 컨텍스트를 공유하기 위한 통합 MCP (Model Context Protocol) 서버입니다.

## 프로젝트 목적

Work Memory MCP는 개발자와 지식 작업자가 여러 AI 도구(Claude, Cursor AI 등)를 사용하면서 일관된 작업 컨텍스트를 유지할 수 있도록 도와주는 메모리 관리 시스템입니다. 각각의 AI 대화 세션에서 축적된 지식과 작업 진행 상황을 체계적으로 관리하여, 연속적이고 효율적인 작업 환경을 제공합니다.

## 핵심 가치

### 지속성 (Persistence)
AI와의 대화는 세션이 끝나면 사라지지만, 중요한 작업 내용과 결과물은 영구적으로 보존되어야 합니다. Work Memory MCP는 모든 중요한 작업 기억을 SQLite 데이터베이스에 안전하게 저장하여 언제든지 접근할 수 있도록 합니다.

### 일관성 (Consistency)
여러 AI 도구를 사용하더라도 동일한 작업 컨텍스트를 공유할 수 있습니다. Claude Desktop에서 시작한 작업을 Cursor AI에서 이어받거나, 다른 도구에서 참조할 수 있는 일관된 작업 환경을 제공합니다.

### 효율성 (Efficiency)
이미 해결한 문제나 정리한 정보를 반복적으로 설명할 필요가 없습니다. 고급 검색 시스템을 통해 과거의 작업 내용을 빠르게 찾아 재활용할 수 있어, 작업 효율성이 크게 향상됩니다.

### 구조화 (Organization)
무작위로 흩어진 정보가 아닌, 프로젝트별, 중요도별, 태그별로 체계적으로 정리된 지식 베이스를 구축할 수 있습니다. 세션 기반 관리를 통해 각 프로젝트의 컨텍스트를 명확하게 분리하여 관리합니다.

## 주요 기능

### 메모리 관리
- 작업 내용, 결과물, 학습한 내용을 구조화된 형태로 저장
- 중요도 점수(0-10점)를 통한 우선순위 관리
- 태그 시스템으로 다차원적 분류
- 할일(Todo)과 일반 메모리(Memory) 구분 관리
- 완료 상태 추적을 통한 작업 진행률 관리

### 세션 관리
- 프로젝트별 독립적인 작업 세션 생성
- 세션 컨텍스트 자동 감지 및 연결
- 세션별 작업 기억 연동 및 추적
- 세션 생명주기 관리 (생성, 활성화, 종료)

### 고급 검색
- 키워드 기반 전문 검색
- 프로젝트, 중요도, 세션별 필터링
- 연관 키워드 추천 시스템
- 검색 결과 하이라이트 및 컨텍스트 제공
- 검색 성능 최적화 및 통계 제공

### 이력 관리
- 모든 작업 기억 변경 이력 추적
- 버전 관리 시스템을 통한 이전 상태 복원
- 변경 사항 비교 및 분석
- 자동 백업 및 복구 기능

### 시스템 최적화
- 데이터베이스 성능 모니터링
- 자동 인덱스 관리 및 최적화
- 메모리 사용량 추적
- 일괄 작업 처리 시스템
- 안전한 데이터 정리 기능

## 통합 도구 구성

Work Memory MCP는 5개의 통합 도구로 구성되어 있습니다:

### 1. Memory (메모리 관리)
작업 기억의 생성, 수정, 조회, 삭제를 담당하는 핵심 도구입니다.

**주요 기능:**
- `add`: 새로운 작업 기억 추가
- `update`: 기존 작업 기억 수정
- `list`: 작업 기억 목록 조회 (필터링 및 페이징 지원)
- `delete`: 작업 기억 삭제 또는 아카이브

**지원하는 데이터 유형:**
- 일반 메모리: 학습 내용, 아이디어, 참고 자료
- 할일: 수행해야 할 작업과 진행 상태
- 프로젝트별 분류
- 태그 기반 다차원 분류
- 중요도 점수 (0-10점)

### 2. Search (검색 및 분석)
저장된 작업 기억을 효율적으로 찾고 분석하는 도구입니다.

**주요 기능:**
- `search`: 키워드 기반 검색
- `keywords`: 연관 키워드 분석
- `stats`: 검색 시스템 통계
- `optimize`: 검색 인덱스 최적화

**검색 기능:**
- 전문 텍스트 검색
- 다중 조건 필터링
- 중요도별 정렬
- 검색 결과 하이라이트
- 연관 키워드 추천
- 검색 성능 통계

### 3. Session (세션 관리)
프로젝트별 작업 세션을 관리하는 도구입니다.

**주요 기능:**
- `create`: 새 세션 생성
- `activate`: 세션 활성화
- `deactivate`: 세션 비활성화
- `list`: 세션 목록 조회
- `status`: 현재 세션 상태 확인
- `detect`: 자동 세션 감지

**세션 관리 특징:**
- 프로젝트별 독립적인 작업 공간
- 자동 세션 감지 및 연결
- 세션별 작업 기억 연동
- 독점 세션 모드 (30분 동안 유지)
- 세션 통계 및 활동 추적

### 4. History (이력 관리)
작업 기억의 변경 이력과 버전을 관리하는 도구입니다.

**주요 기능:**
- `changes`: 변경 이력 조회
- `versions`: 버전 목록 조회
- `restore`: 이전 버전 복원
- `list_versions`: 전체 버전 이력

**버전 관리 특징:**
- 자동 버전 생성
- 변경 사항 상세 추적
- 버전 간 비교 기능
- 선택적 복원 기능
- 버전 정리 및 최적화

### 5. System (시스템 관리)
서버 상태 모니터링과 시스템 최적화를 담당하는 도구입니다.

**주요 기능:**
- `status`: 서버 상태 조회
- `monitor`: 실시간 모니터링
- `optimize`: 데이터베이스 최적화
- `batch`: 일괄 작업 처리
- `delete`: 카테고리별 데이터 정리
- `diagnose`: 시스템 진단
- `analyze`: 상세 분석
- `repair`: 자동 복구

**시스템 관리 특징:**
- 실시간 성능 모니터링
- 자동 인덱스 관리
- 메모리 사용량 추적
- 데이터베이스 최적화
- 안전한 데이터 정리
- 시스템 건강 상태 진단

## 설치 방법

### 1. 시스템 요구사항
- Node.js 18.0.0 이상
- npm 8.0.0 이상
- 운영체제: Windows, macOS, Linux

### 2. 프로젝트 클론 및 설치
```bash
git clone https://github.com/your-repo/work-memory-mcp.git
cd work-memory-mcp
npm install
```

### 3. 프로젝트 빌드
```bash
npm run build
```

### 4. 서버 테스트 실행
```bash
npm start
```

## 설정 방법

### Claude Desktop 설정 (또는 cursor.ai)
Claude Desktop에서 Work Memory MCP를 사용하려면 설정 파일에 다음을 추가해야 합니다.

**Windows 설정 파일 위치:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS 설정 파일 위치:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**설정 파일 내용:**
```json
{
  "mcpServers": {
    "work-memory": {
      "command": "node",
      "args": ["/PATH/work-memory/dist/index.js"],
      "env": {
        "WORK_MEMORY_DIR": "/PATH/work-memory/data/",
        "LOG_LEVEL": "WARN",
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 환경 변수 설정 (선택사항)
다음 환경 변수들을 설정할 수 있습니다:

```env
# 로그 레벨 설정 (기본값: INFO)
LOG_LEVEL=WARN

# 데이터베이스 저장 디렉토리 (기본값: ./work_memory)
WORK_MEMORY_DIR=/PATH/work-memory/data/

# 데이터베이스 파일명 (WORK_MEMORY_DIR 설정시에만 적용, 기본값: database.sqlite)
DB_FILENAME=database.sqlite
```

참고: 
- WORK_MEMORY_DIR이 설정되지 않으면 DB_FILENAME은 무시되고 'database.sqlite'로 고정됩니다.
- 캐시 메모리 사용량(50MB)은 현재 코드에서 하드코딩되어 있으며, 환경 변수로 설정할 수 없습니다.

### Cursor AI 설정
Cursor AI에서 사용하려면 MCP 확장이나 플러그인을 통해 연결할 수 있습니다. 자세한 설정 방법은 Cursor AI의 MCP 지원 문서를 참조하세요.

### 권장 사용자 설정
Work Memory MCP를 최적으로 활용하기 위해 AI 어시스턴트의 사용자 설정에 다음 내용을 추가하세요:

```
# [세션 시작 시 1회만 실행]
0. 세션이 처음 시작될 때만 다음을 실행하세요:
   - "기억을 찾아보는 중..." 이라고 말합니다.
   - work-memory mcp에서 최신 작업기억 3개 조회합니다.
   - 중요도 높은 미완료 할일 3개 조회합니다.
   - 조회한 작업기억과 할일은 사용자에게 브리핑합니다.

# [스마트 세션 관리]
1. 대화 내용이 특정 프로젝트, 주제영역, 또는 지속적 작업에 해당한다고 판단될 때, 관련 세션을 자동으로 감지하고 활성화한다.
   - 단순 질답이 아닌 연속적 작업으로 판단 시 session_status detect_active 실행
   - 관련 세션 있으면 자동 활성화, 없으면 새 세션 준비
   - 한번 활성화된 세션은 30분 동안 독점 유지 (활동 시 연장)
   - 다른 주제영역 전환 시에만 세션 교체
   - 모든 관련 작업이 자동으로 같은 세션에 연결
   - 세션에 대해 간단히 브리핑

# [일반 대화 중 반복적으로 수행]
2. 대화가 진행되는 동안에는 다음 원칙만 따릅니다:
   - 모든 응답은 중요도를 판단하여(100점 만점), 50점 이상일 경우 work-memory mcp에 저장합니다.
   - 기존 기억을 기반으로만 판단하고 반복 조회하지 않습니다.
```

## 사용 예시

### 기본 작업 기억 추가
```json
{
  "operation": "add",
  "content": "React 컴포넌트 최적화를 위해 useMemo와 useCallback을 적절히 사용해야 함. 특히 props 변경이 잦은 컴포넌트에서는 React.memo와 함께 사용하면 효과적",
  "project": "frontend-optimization",
  "tags": ["React", "성능최적화", "useMemo", "useCallback"],
  "importance_score": 8,
  "work_type": "memory"
}
```

### 할일 추가 및 관리
```json
{
  "operation": "add",
  "content": "API 응답 시간 개선을 위한 캐싱 전략 구현",
  "project": "backend-optimization",
  "tags": ["캐싱", "성능", "API"],
  "importance_score": 9,
  "work_type": "todo",
  "worked": "미완료",
  "requirements": "Redis 캐싱 레이어 구현, TTL 설정, 캐시 무효화 전략 수립"
}
```

### 고급 검색 활용
```json
{
  "operation": "search",
  "query": "React 성능 최적화",
  "project": "frontend-optimization",
  "importance_min": 7,
  "highlight_matches": true,
  "include_content": true
}
```

### 세션 기반 작업
```json
// 새 프로젝트 세션 생성
{
  "operation": "create",
  "session_name": "모바일 앱 리팩토링",
  "description": "기존 모바일 앱의 성능 개선 및 코드 구조 개선 프로젝트"
}

// 세션에 연결된 작업 기억 추가
{
  "operation": "add",
  "content": "모바일 앱 성능 병목 지점 분석 완료. 주요 문제는 이미지 로딩과 상태 관리 최적화 필요",
  "project": "모바일 앱 리팩토링",
  "auto_link": true
}
```

### 시스템 관리 및 최적화
```json
// 데이터베이스 최적화
{
  "operation": "optimize",
  "vacuum_type": "incremental",
  "analyze": true
}

// 낮은 중요도 작업 정리
{
  "operation": "delete",
  "category": "work_memories",
  "delete_criteria": {
    "max_importance_score": 3,
    "older_than_days": 30
  },
  "archive_only": true
}
```

## 프로젝트 구조

```
work-memory-mcp/
├── src/
│   ├── database/          # 데이터베이스 관련 (SQLite, 스키마, 연결)
│   ├── tools/            # MCP 도구 구현 (5개 통합 도구)
│   │   ├── memory.ts     # 메모리 관리 도구
│   │   ├── search.ts     # 검색 및 분석 도구
│   │   ├── session.ts    # 세션 관리 도구
│   │   ├── history.ts    # 이력 관리 도구
│   │   └── system.ts     # 시스템 관리 도구
│   ├── utils/            # 유틸리티 함수
│   ├── types/            # TypeScript 타입 정의
│   ├── session/          # 세션 관리 및 종료 처리
│   ├── progress/         # 진행률 추적 시스템
│   └── index.ts          # 서버 엔트리 포인트
├── tests/               # 테스트 파일
├── docs/                # 문서
├── dist/                # 빌드 결과물
└── work_memory/         # 데이터베이스 파일 저장 디렉토리
```

## 데이터베이스 구조

Work Memory MCP는 SQLite를 사용하여 다음과 같은 테이블 구조를 가집니다:

### work_memories 테이블
- 모든 작업 기억의 메인 데이터 저장
- 내용, 프로젝트, 태그, 중요도, 작업 유형 등

### sessions 테이블
- 프로젝트 세션 정보 관리
- 세션별 메타데이터 및 활동 통계

### work_memory_history 테이블
- 작업 기억 변경 이력 추적
- 버전 관리 및 복원 지원

### search_keywords 테이블
- 검색 최적화를 위한 키워드 인덱스
- 전문 검색 성능 향상

### project_index 테이블
- 프로젝트별 메타데이터 관리
- 프로젝트 통계 및 분석

## 성능 및 최적화

### 검색 성능
- 16개의 복합 인덱스를 통한 빠른 검색
- 키워드 가중치 시스템으로 정확도 향상
- LRU 캐시를 통한 반복 검색 최적화

### 메모리 관리
- 최대 500개 엔트리, 50MB 제한의 LRU 캐시 (하드코딩)
- 자동 메모리 정리 시스템
- 대용량 작업 시 진행률 추적

### 데이터베이스 최적화
- 자동 VACUUM 및 ANALYZE 실행
- 인덱스 커버리지 분석 및 최적화
- 트랜잭션 기반 원자적 작업 보장

## 보안 및 안전성

### 데이터 보안
- 로컬 SQLite 데이터베이스로 외부 유출 방지
- 입력 검증을 통한 SQL 인젝션 방지
- 안전한 파일 시스템 접근 제어

### 데이터 무결성
- 트랜잭션 기반 원자적 작업
- 자동 백업 및 복구 시스템
- 데이터 손상 감지 및 복구

### 프로토콜 준수
- MCP 표준 프로토콜 완전 준수
- JSON-RPC 호환성 보장
- stdout 보호를 통한 통신 안정성

## 개발 환경

### 개발 모드 실행
```bash
npm run dev
```

### 테스트 실행
```bash
# 전체 테스트
npm test

# 단위 테스트
npm run test:unit

# 통합 테스트
npm run test:integration

# 성능 테스트
npm run test:performance

# 커버리지 테스트
npm run test:coverage
```

### 코드 품질 관리
```bash
# 린트 검사
npm run lint

# 린트 자동 수정
npm run lint:fix
```

## 문제 해결

### 일반적인 문제

**MCP 서버 연결 실패**
```bash
# 1. 서버 재시작
npm run build && npm start

# 2. Claude Desktop 재시작
# 3. 설정 파일 경로 확인
```

**데이터베이스 성능 저하**
```json
{
  "operation": "optimize",
  "vacuum_type": "full",
  "analyze": true
}
```

**메모리 사용량 증가**
```json
{
  "operation": "delete",
  "category": "work_memories",
  "delete_criteria": {
    "max_importance_score": 2,
    "older_than_days": 60
  },
  "archive_only": true
}
```

### 디버깅 모드
환경 변수를 설정하여 상세한 로그를 확인할 수 있습니다:
```bash
LOG_LEVEL=debug npm start
```

## 라이선스

MIT License - 자세한 내용은 LICENSE 파일을 참조하세요.

## 기여하기

1. 프로젝트 포크
2. 기능 브랜치 생성 (`git checkout -b feature/새기능`)
3. 변경사항 커밋 (`git commit -am '새 기능 추가'`)
4. 브랜치에 푸시 (`git push origin feature/새기능`)
5. Pull Request 생성

## 지원 및 문의

- 이메일: moontmsai@gmail.com

## ☕ 후원하기
이 프로젝트가 도움이 되셨다면, 커피 한 잔으로 응원해주세요: [https://coff.ee/moontmsai](https://coff.ee/moontmsai)  
여러분의 후원이 지속적인 오픈소스 개발에 큰 힘이 됩니다.
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%E2%98%95-blue?style=flat&logo=buy-me-a-coffee&logoColor=white)](https://coff.ee/moontmsai)

Work Memory MCP를 사용해주셔서 감사합니다. 더 나은 AI 협업 환경을 만들어가는 데 함께해주세요!