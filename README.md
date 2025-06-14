# Work Memory MCP Server

AI 도구 간 전환 시 업무 컨텍스트를 유지하는 메모리 관리 시스템입니다.

## 목적

Claude와 Cursor AI 등 다양한 AI 도구를 오가며 작업할 때 발생하는 컨텍스트 손실 문제를 해결합니다.

**문제**: Claude에서 "React 프로젝트 설계 중" → Cursor로 전환 → "뭘 하고 있었지?"  
**해결**: Claude에서 작업 내용 저장 → Cursor에서 즉시 컨텍스트 복구

## 주요 기능

- **작업 메모리 저장**: 진행 중인 작업과 완료된 작업을 체계적으로 관리
- **할일 관리**: 미완료 작업을 todo로 분류하여 추적
- **지능형 검색**: 키워드 기반 메모리 검색으로 빠른 컨텍스트 복구
- **서머리 시스템**: 긴 내용을 요약하여 토큰 사용량 최적화
- **버전 관리**: 메모리 변경 이력 추적 및 이전 버전 복원

## 설치 및 설정

### 1. 설치

```bash
git clone <repository-url>
cd work-memory-mcp
npm install
npm run build
```

### 2. Claude Desktop 설정

Claude Desktop 설정 파일에 MCP 서버를 추가하세요:

**설정 파일 위치**:
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**설정 내용**:
```json
{
  "mcpServers": {
    "work-memory": {
      "command": "node",
      "args": ["path/dist/index.js"],
      "env": {
        "WORK_MEMORY_DIR": "path/work_memory"
      }
    }
  }
}
```

### 3. Cursor AI 설정

Cursor AI의 MCP 설정에 동일한 설정을 추가하세요.

## 도구 목록

### 메모리 관리
- `add_work_memory` - 새로운 작업 메모리나 할일 저장
- `update_work_memory` - 기존 메모리 내용 수정 및 완료 처리
- `delete_work_memory` - 메모리 삭제 (단일/복수/일괄)

### 검색 및 조회
- `search_work_memory` - 키워드 기반 메모리 검색
- `list_work_memories` - 메모리 목록 조회 (필터링 지원)
- `get_related_keywords` - 연관 키워드 추천

### 히스토리 및 버전 관리
- `get_work_memory_history` - 메모리 변경 이력 조회
- `get_work_memory_versions` - 버전 정보 조회 및 비교
- `list_memory_versions` - 모든 버전 목록 조회
- `restore_memory_version` - 이전 버전으로 복원

### 시스템 관리
- `get_search_stats` - 검색 시스템 통계 조회
- `optimize_search_index` - 검색 인덱스 최적화
- `get_server_status` - 서버 상태 및 진단 정보
- `batch_operations` - 여러 작업 일괄 처리
- `connection_monitor` - 데이터베이스 연결 상태 모니터링
- `optimize_database` - 데이터베이스 최적화 (VACUUM)

## 기본 사용법

### 작업 메모리 저장
```javascript
// 완료된 작업 저장
add_work_memory({
  content: "React 라우팅 설정 완료",
  importance_score: 80,
  project: "frontend-app",
  tags: ["완료", "라우팅"]
})

// 할일 등록
add_work_memory({
  content: "API 연동 테스트 작성",
  work_type: "todo",
  importance_score: 75
})
```

### 메모리 검색
```javascript
// 키워드로 검색
search_work_memory({ query: "React API" })

// 프로젝트별 검색
search_work_memory({
  query: "테스트",
  project: "frontend-app",
  min_importance_score: 70
})
```

### 작업 완료 처리
```javascript
update_work_memory({
  memory_id: "mem_123456",
  content: "API 테스트 완료",
  result_content: "모든 테스트 케이스 통과",
  worked: "완료"
})
```

## 워크플로우

1. **작업 시작**: `add_work_memory`로 현재 작업 저장
2. **진행 중**: 중요한 결정이나 변경사항 추가 저장
3. **AI 전환**: `search_work_memory`로 컨텍스트 조회
4. **작업 완료**: `update_work_memory`로 결과 업데이트

## 성능 최적화

- **서머리 시스템**: 긴 내용을 자동 요약하여 토큰 사용량 80% 절약
- **지능형 검색**: 관련도와 중요도를 결합한 정확한 검색 결과
- **인덱스 최적화**: 주기적인 인덱스 정리로 검색 속도 향상

## 문제 해결

### 서버 연결 실패
1. 경로가 올바른지 확인
2. Node.js가 설치되어 있는지 확인
3. 빌드가 완료되었는지 확인: `npm run build`

### 검색 결과 없음
1. 인덱스 최적화: `optimize_search_index()`
2. 서버 상태 확인: `get_server_status()`

### 성능 저하
1. 데이터베이스 최적화: `optimize_database()`
2. 오래된 메모리 정리: 90일 이상 된 항목 삭제

## 추천 사용자 설정

Claude Desktop 또는 Cursor AI에서 Work Memory MCP를 더 효율적으로 사용하기 위한 권장 설정입니다.

### 세션 시작 시 자동 브리핑

세션이 처음 시작될 때 다음과 같이 설정하면 이전 작업 내용을 자동으로 확인할 수 있습니다:

```
# [세션 시작 시 1회만 실행]
1. 세션이 처음 시작될 때만 다음을 실행하세요:
   - "기억을 찾아보는 중..." 이라고 말합니다.
   - 작업기억 mcp에서 최신 작업기억 3개 조회합니다.
   - 중요도 높은 미완료 할일 3개 조회합니다.
   - 조회한 작업기억과 할일은 사용자에게 브리핑합니다.
```

### 대화 중 자동 저장

대화가 진행되는 동안 중요한 내용을 자동으로 저장하도록 설정:

```
# [일반 대화 중 반복적으로 수행]
2. 대화가 진행되는 동안에는 다음 원칙만 따릅니다:
   - 모든 응답은 중요도를 판단하여, 40점 이상일 경우 작업기억 mcp에 저장합니다.
   - 기존 기억을 기반으로만 판단하고 반복 조회하지 않습니다.
```

이 설정을 Claude Desktop이나 Cursor AI의 사용자 설정(User Preferences)에 추가하면, 매번 수동으로 메모리를 관리할 필요 없이 자동으로 작업 컨텍스트가 유지됩니다.

## 라이센스

MIT License