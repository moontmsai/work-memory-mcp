# SQLite Database Schema Design

## 개요

Work Memory MCP 서버의 SQLite 데이터베이스 스키마 설계 문서입니다. 기존 파일 기반 시스템을 SQLite로 전환하여 동시성 문제를 해결하고 성능을 향상시킵니다.

## 테이블 구조

### 1. work_memories (메인 메모리 테이블)

작업 메모리의 핵심 데이터를 저장하는 메인 테이블입니다.

```sql
CREATE TABLE work_memories (
  id TEXT PRIMARY KEY,                    -- 고유 식별자 (mem_YYYYMMDDTHHMMSS_xxxxx)
  content TEXT NOT NULL,                  -- 원본 작업 내용
  extracted_content TEXT,                 -- AI가 추출한 핵심 내용
  project TEXT,                          -- 프로젝트명
  tags TEXT,                             -- JSON 배열 형태의 태그 ["tag1", "tag2"]
  importance TEXT DEFAULT 'medium',       -- 중요도 (low, medium, high)
  created_by TEXT DEFAULT 'unknown',      -- 작성자 (claude_app, cursor_ai 등)
  created_at TEXT DEFAULT (datetime('now')), -- 생성 시간 (ISO 8601)
  updated_at TEXT DEFAULT (datetime('now')), -- 수정 시간 (ISO 8601)
  access_count INTEGER DEFAULT 0,         -- 접근 횟수
  last_accessed_at TEXT DEFAULT (datetime('now')), -- 마지막 접근 시간
  is_archived BOOLEAN DEFAULT FALSE,      -- 아카이브 여부
  -- 성능 최적화 필드
  content_length INTEGER GENERATED ALWAYS AS (length(content)) STORED,
  project_normalized TEXT GENERATED ALWAYS AS (lower(trim(project))) STORED
);
```

### 2. search_keywords (검색 키워드 테이블)

빠른 검색을 위한 키워드 인덱스 테이블입니다.

```sql
CREATE TABLE search_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,               -- work_memories.id 참조
  keyword TEXT NOT NULL,                 -- 키워드
  keyword_normalized TEXT GENERATED ALWAYS AS (lower(trim(keyword))) STORED,
  weight REAL DEFAULT 1.0,               -- 키워드 가중치
  source TEXT DEFAULT 'content',         -- 키워드 출처 (content, tags, project, extracted)
  FOREIGN KEY (memory_id) REFERENCES work_memories(id) ON DELETE CASCADE
);
```

### 3. project_index (프로젝트 인덱스 테이블)

프로젝트별 통계 및 메타데이터를 관리합니다.

```sql
CREATE TABLE project_index (
  project TEXT PRIMARY KEY,
  project_normalized TEXT GENERATED ALWAYS AS (lower(trim(project))) STORED,
  memory_count INTEGER DEFAULT 0,        -- 메모리 개수
  last_updated TEXT DEFAULT (datetime('now')), -- 마지막 업데이트
  total_importance_score REAL DEFAULT 0.0, -- 총 중요도 점수
  most_recent_memory_date TEXT,          -- 가장 최근 메모리 날짜
  most_active_creator TEXT               -- 가장 활발한 작성자
);
```

### 4. system_settings (시스템 설정 테이블)

시스템 설정 및 구성 정보를 저장합니다.

```sql
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT DEFAULT 'string',      -- string, number, boolean, json
  description TEXT,                      -- 설정 설명
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 5. change_history (변경 히스토리 테이블)

모든 변경 사항을 추적하여 감사 로그를 제공합니다.

```sql
CREATE TABLE change_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,               -- 대상 메모리 ID
  action TEXT NOT NULL,                  -- created, updated, deleted, archived, accessed
  old_data TEXT,                         -- 이전 상태 (JSON)
  new_data TEXT,                         -- 새로운 상태 (JSON)
  timestamp TEXT DEFAULT (datetime('now')),
  details TEXT,                          -- 추가 세부사항
  changed_fields TEXT,                   -- 변경된 필드 목록 (JSON 배열)
  user_agent TEXT,                       -- 사용자 에이전트
  session_id TEXT                        -- 세션 ID
);
```

### 6. archived_memories (아카이브 테이블)

삭제되거나 아카이브된 메모리의 백업을 저장합니다.

```sql
CREATE TABLE archived_memories (
  id TEXT PRIMARY KEY,
  original_memory_id TEXT NOT NULL,      -- 원본 메모리 ID
  content TEXT NOT NULL,                 -- 원본 내용
  original_data TEXT,                    -- 원본 메모리의 전체 JSON 데이터
  archived_at TEXT DEFAULT (datetime('now')),
  reason TEXT,                           -- 아카이브 사유
  archived_by TEXT DEFAULT 'system',     -- 아카이브 실행자
  -- 복구를 위한 메타데이터
  original_project TEXT,
  original_tags TEXT,
  original_importance TEXT
);
```

## 인덱스 전략

### 기본 인덱스
- 각 테이블의 PRIMARY KEY
- FOREIGN KEY 제약 조건

### 성능 최적화 인덱스

#### work_memories 테이블
```sql
CREATE INDEX idx_work_memories_project ON work_memories(project);
CREATE INDEX idx_work_memories_project_normalized ON work_memories(project_normalized);
CREATE INDEX idx_work_memories_created_at ON work_memories(created_at);
CREATE INDEX idx_work_memories_importance ON work_memories(importance);
CREATE INDEX idx_work_memories_is_archived ON work_memories(is_archived);
CREATE INDEX idx_work_memories_created_by ON work_memories(created_by);
CREATE INDEX idx_work_memories_content_length ON work_memories(content_length);
```

#### search_keywords 테이블
```sql
CREATE INDEX idx_search_keywords_memory_id ON search_keywords(memory_id);
CREATE INDEX idx_search_keywords_keyword_normalized ON search_keywords(keyword_normalized);
CREATE INDEX idx_search_keywords_source ON search_keywords(source);
CREATE INDEX idx_search_keywords_weight ON search_keywords(weight);
CREATE UNIQUE INDEX idx_search_keywords_unique ON search_keywords(memory_id, keyword);
```

#### 복합 인덱스 (성능 최적화)
```sql
CREATE INDEX idx_work_memories_project_created ON work_memories(project, created_at);
CREATE INDEX idx_work_memories_importance_created ON work_memories(importance, created_at);
CREATE INDEX idx_search_keywords_keyword_weight ON search_keywords(keyword_normalized, weight);
```

## 데이터 타입 및 제약 조건

### 날짜/시간 처리
- 모든 날짜/시간 필드는 TEXT 타입으로 ISO 8601 형식 저장
- SQLite의 `datetime('now')` 함수 사용으로 일관성 보장

### JSON 데이터 저장
- tags: JSON 배열 형태 `["tag1", "tag2", "tag3"]`
- old_data/new_data: 전체 객체의 JSON 직렬화
- changed_fields: 변경된 필드명의 JSON 배열

### 정규화된 필드
- GENERATED ALWAYS AS 컬럼을 사용하여 자동 정규화
- 대소문자 구분 없는 검색 및 정렬 지원

## 성능 최적화 설정

### SQLite PRAGMA 설정
```sql
PRAGMA journal_mode=WAL;        -- Write-Ahead Logging 모드
PRAGMA synchronous=NORMAL;      -- 동기화 레벨 조정
PRAGMA cache_size=10000;        -- 캐시 크기 증가
PRAGMA temp_store=MEMORY;       -- 임시 저장소를 메모리에
PRAGMA foreign_keys=ON;         -- 외래 키 제약 조건 활성화
```

## 마이그레이션 전략

### 기존 파일 시스템에서 SQLite로 전환
1. `current_work.json` → `work_memories` 테이블
2. `search_index.json` → `search_keywords` 테이블
3. `settings.json` → `system_settings` 테이블
4. `history/*.json` → `change_history` 테이블
5. 아카이브 데이터 → `archived_memories` 테이블

### 데이터 무결성 보장
- 트랜잭션을 사용한 원자적 마이그레이션
- 백업 생성 후 마이그레이션 실행
- 검증 단계를 통한 데이터 정합성 확인

## 확장성 고려사항

### 향후 확장 가능한 설계
- 스키마 버전 관리 시스템
- 플러그인 시스템을 위한 확장 테이블 구조
- 분산 환경을 고려한 ID 생성 전략

### 성능 모니터링
- 쿼리 성능 추적
- 인덱스 사용률 모니터링
- 데이터베이스 크기 및 성장률 추적 