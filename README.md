# Work Memory MCP Server

업무 작업 기억을 Claude와 Cursor AI 간에 공유하기 위한 MCP (Model Context Protocol) 서버입니다.

## 주요 기능

### 핵심 기능
- **통합 메모리 관리**: 프로젝트별 작업 내용, 중요도, 태그 관리
- **할일 관리**: 작업 상태(완료/미완료) 추적 및 자동화
- **고급 검색**: 키워드, 프로젝트, 중요도, 세션 기반 다차원 검색
- **세션 연동**: 프로젝트 세션별 작업 기억 연동 및 관리
- **이력 추적**: 작업 기억 수정 이력 및 버전 관리

### 고급 기능
- **일괄 처리**: 대용량 데이터 일괄 작업 및 삭제
- **자동 아카이브**: 오래된 저중요도 기억 자동 정리
- **검색 최적화**: 키워드 인덱싱 및 가중치 시스템
- **진행률 추적**: 대용량 작업시 실시간 진행률 표시
- **성능 모니터링**: 데이터베이스 및 시스템 성능 추적
- **오류 복구**: 데이터 손상시 자동 복구 시스템

## 통합 도구 (5개)

### 1. 🧠 **Memory** - 메모리 통합 관리
모든 작업 기억 관리 기능을 통합한 핵심 도구

**주요 작업:**
- `add`: 새로운 작업 기억 추가
- `update`: 기존 작업 기억 수정  
- `get`: 특정 작업 기억 상세 조회
- `list`: 작업 기억 목록 조회 (페이징 지원)
- `delete`: 작업 기억 삭제/아카이브 (일괄 삭제 지원)
- `archive`: 작업 기억 아카이브
- `batch`: 대량 작업 일괄 처리

**사용 예시:**
```json
{
  "operation": "add",
  "content": "React 컴포넌트 최적화 방법 정리",
  "project": "frontend-optimization",
  "tags": ["React", "성능", "최적화"],
  "importance_score": 85,
  "work_type": "memory"
}
```

**일괄 삭제 예시:**
```json
{
  "operation": "delete",
  "max_importance_score": 30,
  "archive_only": true,
  "confirm": true
}
```

### 2. 🔍 **Search** - 고급 검색
다차원 검색 및 필터링 기능

**주요 작업:**
- `basic`: 키워드 기반 기본 검색
- `advanced`: 복합 조건 고급 검색
- `by_importance`: 중요도별 검색
- `by_project`: 프로젝트별 검색
- `by_session`: 세션별 검색
- `fuzzy`: 유사 검색
- `optimize_index`: 검색 인덱스 최적화

**사용 예시:**
```json
{
  "operation": "advanced",
  "query": "React 최적화",
  "filters": {
    "project": "frontend-optimization",
    "min_importance": 80,
    "work_type": "memory",
    "session_id": "session_123"
  }
}
```

### 3. 📂 **Session** - 세션 관리
프로젝트 세션 생명주기 관리

**주요 작업:**
- `create`: 새 프로젝트 세션 생성
- `list`: 세션 목록 조회
- `get`: 세션 상세 정보 조회
- `update`: 세션 정보 수정
- `delete_session`: 세션만 삭제 (메모리 보존)
- `delete_session_cascade`: 세션과 모든 관련 메모리 삭제
- `get_memories`: 세션별 작업 기억 조회
- `terminate`: 세션 종료 및 정리

**사용 예시:**
```json
{
  "operation": "create",
  "project_name": "새 프로젝트",
  "description": "프로젝트 설명",
  "auto_created": false
}
```

### 4. 📜 **History** - 이력 및 버전 관리
변경 이력 추적 및 버전 관리

**주요 작업:**
- `create_version`: 작업 기억 버전 생성
- `list_versions`: 버전 이력 조회
- `restore_version`: 이전 버전 복원
- `compare_versions`: 버전간 비교
- `get_changes`: 변경 이력 조회
- `cleanup_versions`: 오래된 버전 정리
- `backup`: 수동 백업 생성

**사용 예시:**
```json
{
  "operation": "create_version",
  "memory_id": "mem_123",
  "description": "중요 내용 업데이트"
}
```

### 5. ⚙️ **System** - 시스템 관리
서버 상태, 성능 모니터링, 최적화

**주요 작업:**
- `status`: 서버 상태 조회
- `monitor`: 연결 상태 모니터링  
- `optimize`: 데이터베이스 최적화
- `batch`: 일괄 작업 처리
- `delete`: 시스템 일괄 삭제 (강화된 삭제 기능)

**사용 예시:**
```json
{
  "operation": "delete",
  "delete_criteria": {
    "combined_criteria": {
      "project": "old_project",
      "importance_range": { "max": 25 },
      "work_type": "todo",
      "worked": "완료",
      "older_than_days": 30
    }
  },
  "archive_only": true,
  "confirm": true
}
```

## 🚀 강화된 일괄 삭제 기능

### 지원하는 삭제 조건
- **단일/복수 ID**: 특정 메모리 지정 삭제
- **프로젝트별**: 특정 프로젝트 모든 메모리
- **세션별**: 특정 세션 모든 메모리
- **중요도 점수**: 점수 범위 기반 삭제
- **작업 유형**: memory/todo 유형별 삭제
- **완료 상태**: 완료/미완료 상태별 삭제
- **날짜 기준**: 지정 일수보다 오래된 것
- **복합 조건**: 여러 조건 동시 적용

### 안전 장치
- **1000개 이상**: 확인 필수 (`confirm=true`)
- **5000개 이상**: 완전 차단 (배치 분할 요구)
- **아카이브 모드**: 안전한 소프트 삭제 지원
- **트랜잭션 보호**: 실패시 자동 롤백

## 설치 및 설정

### 1. 의존성 설치
```bash
npm install
```

### 2. 프로젝트 빌드
```bash
npm run build
```

### 3. 서버 실행
```bash
npm start
```

### 4. Claude Desktop 설정
Claude Desktop의 설정 파일에 다음을 추가하세요:

```json
{
  "mcpServers": {
    "work-memory": {
      "command": "node",
      "args": ["C:/path/to/your/work-memory-mcp/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 사용 예시

### 작업 기억 추가
```json
{
  "operation": "add",
  "content": "React 컴포넌트 최적화 방법 정리",
  "project": "frontend-optimization", 
  "tags": ["React", "성능", "최적화"],
  "importance_score": 85,
  "work_type": "memory"
}
```

### 할일 관리
```json
{
  "operation": "add",
  "content": "API 문서 작성 완료하기",
  "project": "documentation",
  "tags": ["문서", "API"],
  "importance_score": 70,
  "work_type": "todo",
  "worked": "미완료"
}
```

### 고급 검색
```json
{
  "operation": "advanced",
  "query": "React 최적화",
  "filters": {
    "project": "frontend-optimization",
    "min_importance": 80,
    "work_type": "memory",
    "session_id": "session_123"
  }
}
```

### 세션 기반 작업
```json
// 새 세션 생성
{
  "operation": "create",
  "project_name": "새 프로젝트",
  "description": "프로젝트 설명"
}

// 세션에 작업 기억 추가  
{
  "operation": "add",
  "content": "프로젝트 초기 설정",
  "session_id": "session_123",
  "project": "새 프로젝트"
}
```

### 시스템 일괄 작업
```json
// 중요도 점수 기반 정리
{
  "operation": "delete",
  "delete_criteria": {
    "max_importance_score": 30
  },
  "archive_only": true,
  "confirm": true
}

// 완료된 할일 정리
{
  "operation": "delete", 
  "delete_criteria": {
    "work_type": "todo",
    "worked": "완료",
    "older_than_days": 7
  },
  "archive_only": false
}

// 복합 조건 고급 정리
{
  "operation": "delete",
  "delete_criteria": {
    "combined_criteria": {
      "project": "legacy_project",
      "importance_range": { "max": 25 },
      "older_than_days": 60
    }
  },
  "archive_only": true
}
```

## 데이터베이스

- **SQLite** 기반 로컬 데이터베이스
- **better-sqlite3** 사용으로 고성능 보장
- 자동 백업 및 복구 시스템
- 버전 관리 및 이력 추적
- 세션 관리 테이블 지원

## 성능 최적화

- 인덱스 기반 빠른 검색 (16개 복합 인덱스)
- 키워드 가중치 시스템
- 자동 공간 회수 (VACUUM)
- 연결 풀링 및 캐싱
- LRU 캐시 (최대 500개 엔트리/50MB)
- 대량 작업 배치 처리

## 보안 및 안전성

- 로컬 데이터베이스로 외부 유출 방지
- 입력 검증 및 SQL 인젝션 방지
- 안전한 파일 시스템 접근
- 트랜잭션 기반 원자적 작업
- 한글/UTF-8 안전 JSON 처리
- MCP 프로토콜 준수 (stdout 보호)

## 개발 및 기여

### 개발 환경 설정
```bash
# 개발 모드 실행
npm run dev

# 테스트 실행  
npm test

# 린트 검사
npm run lint

# 빌드
npm run build
```

### 프로젝트 구조
```
src/
├── database/          # 데이터베이스 관련 (SQLite, 스키마, 연결)
├── tools/            # MCP 도구 구현 (5개 통합 도구)
├── utils/            # 유틸리티 함수 (JSON 안전성, 성능 최적화)
├── types/            # TypeScript 타입 정의
├── session/          # 세션 관리 및 종료 처리
├── progress/         # 진행률 추적 시스템
└── index.ts          # 서버 엔트리 포인트
```

## 주요 개선사항

### v0.1.1 주요 업데이트
- **5개 통합 도구**: 18개 도구를 5개로 통합하여 사용성 극대화
- **강화된 일괄 삭제**: 세션, 중요도 점수, 복합 조건 기반 삭제
- **안전성 강화**: 대량 작업 보호, 트랜잭션 안전성, 롤백 지원
- **메모리 최적화**: LRU 캐시, 진행률 추적 메모리 관리
- **한글 지원 완성**: 안전한 JSON 처리, UTF-8 인코딩 보장
- **MCP 프로토콜 준수**: stdout 보호, JSON-RPC 호환성

## 라이선스

MIT License

## 문제 해결

일반적인 문제와 해결 방법:

### MCP 서버 연결 문제
```bash
# 서버 재시작
npm run build && npm start

# 설정 파일 확인
# Claude Desktop 설정의 경로가 정확한지 확인
```

### 대용량 작업 실패
```json
// 배치 크기 줄이기
{
  "operation": "delete",
  "delete_criteria": { "project": "large_project" },
  "confirm": true,
  "archive_only": true  // 안전한 아카이브 모드 사용
}
```

### 성능 최적화
```json
{
  "operation": "optimize",
  "vacuum_type": "incremental",
  "analyze": true
}
```

더 자세한 정보는 [GitHub Issues](https://github.com/your-repo/work-memory-mcp/issues)를 참조하세요.