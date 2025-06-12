# 🛠️ Work Memory MCP API 레퍼런스

Work Memory MCP Server의 모든 도구와 API에 대한 상세한 문서입니다.

## 📋 도구 목록

### 메모리 관리
- [`add_work_memory`](#add_work_memory) - 메모리 추가
- [`search_work_memory`](#search_work_memory) - 메모리 검색
- [`list_work_memories`](#list_work_memories) - 메모리 목록 조회
- [`delete_work_memory`](#delete_work_memory) - 메모리 삭제

### 검색 & 분석
- [`get_related_keywords`](#get_related_keywords) - 관련 키워드 조회
- [`get_search_stats`](#get_search_stats) - 검색 통계
- [`optimize_search_index`](#optimize_search_index) - 검색 인덱스 최적화

### 히스토리 & 버전 관리
- [`get_work_memory_history`](#get_work_memory_history) - 변경 히스토리 조회
- [`get_work_memory_versions`](#get_work_memory_versions) - 버전 목록 조회
- [`restore_memory_version`](#restore_memory_version) - 버전 복구
- [`list_memory_versions`](#list_memory_versions) - 간단한 버전 목록

### 시스템
- [`get_server_status`](#get_server_status) - 서버 상태 조회

---

## 메모리 관리

### `add_work_memory`

새로운 작업 메모리를 저장합니다.

**파라미터:**
- `content` (string, 필수): 메모리 내용
- `project` (string, 선택): 프로젝트 이름
- `tags` (array\<string\>, 선택): 태그 배열
- `importance` (number, 선택): 중요도 (1-10, 기본값: 5)
- `creator` (string, 선택): 생성자 (기본값: "user")

**예시:**
```json
{
  "content": "React ecommerce 프로젝트의 상품 목록 컴포넌트 개발 중. Redux로 상태 관리하고 Material-UI로 스타일링.",
  "project": "ecommerce-web",
  "tags": ["react", "redux", "material-ui", "components"],
  "importance": 8,
  "creator": "developer"
}
```

**응답:**
```
✅ 메모리가 성공적으로 저장되었습니다.
📝 ID: mem_20241201_001
🏷️ 태그: react, redux, material-ui, components
📊 중요도: 8/10
📁 프로젝트: ecommerce-web
```

---

### `search_work_memory`

저장된 메모리를 검색합니다.

**파라미터:**
- `query` (string, 필수): 검색 쿼리
- `limit` (number, 선택): 결과 개수 제한 (기본값: 10)
- `project_filter` (string, 선택): 프로젝트로 필터링
- `tag_filter` (array\<string\>, 선택): 태그로 필터링
- `min_importance` (number, 선택): 최소 중요도 (1-10)
- `max_importance` (number, 선택): 최대 중요도 (1-10)
- `creator_filter` (string, 선택): 생성자로 필터링
- `sort_by` (string, 선택): 정렬 기준 (timestamp, importance, relevance)
- `date_from` (string, 선택): 시작 날짜 (YYYY-MM-DD)
- `date_to` (string, 선택): 종료 날짜 (YYYY-MM-DD)

**예시:**
```json
{
  "query": "React 컴포넌트",
  "limit": 5,
  "project_filter": "ecommerce-web",
  "tag_filter": ["react"],
  "min_importance": 7,
  "sort_by": "importance"
}
```

**응답:**
```
🔍 검색 결과: 3개 발견

📝 [mem_20241201_001] React ecommerce 프로젝트 컴포넌트 개발
📊 중요도: 8/10 | 📁 ecommerce-web | 🏷️ react, components
💭 React ecommerce 프로젝트의 상품 목록 컴포넌트 개발 중...

📝 [mem_20241130_045] React 훅 최적화 작업  
📊 중요도: 7/10 | 📁 ecommerce-web | 🏷️ react, hooks
💭 useState와 useEffect 최적화로 성능 개선...

🔍 검색 완료: 3개 결과 (45ms)
```

---

### `list_work_memories`

저장된 메모리 목록을 조회합니다.

**파라미터:**
- `limit` (number, 선택): 결과 개수 제한 (기본값: 20)
- `sort_by` (string, 선택): 정렬 기준 (timestamp, importance, title)
- `sort_order` (string, 선택): 정렬 순서 (asc, desc, 기본값: desc)
- `format` (string, 선택): 출력 형식 (summary, detailed, minimal, 기본값: summary)
- `project_filter` (string, 선택): 프로젝트 필터
- `tag_filter` (array\<string\>, 선택): 태그 필터
- `creator_filter` (string, 선택): 생성자 필터
- `importance_range` (object, 선택): 중요도 범위 {min: number, max: number}

**예시:**
```json
{
  "limit": 10,
  "sort_by": "importance",
  "format": "detailed",
  "project_filter": "ecommerce-web"
}
```

---

### `delete_work_memory`

메모리를 삭제하거나 아카이브합니다.

**파라미터:**
- `memory_id` (string, 필수): 삭제할 메모리 ID
- `archive_only` (boolean, 선택): 아카이브만 수행 (기본값: false)
- `confirm` (boolean, 선택): 삭제 확인 (기본값: false)

**예시:**
```json
{
  "memory_id": "mem_20241201_001",
  "archive_only": true,
  "confirm": true
}
```

---

## 검색 & 분석

### `get_related_keywords`

특정 키워드와 관련된 키워드들을 조회합니다.

**파라미터:**
- `keyword` (string, 필수): 기준 키워드
- `limit` (number, 선택): 결과 개수 제한 (기본값: 10)
- `similarity_threshold` (number, 선택): 유사도 임계값 (0.0-1.0, 기본값: 0.3)

**예시:**
```json
{
  "keyword": "react",
  "limit": 5,
  "similarity_threshold": 0.4
}
```

**응답:**
```
🔗 'react' 관련 키워드

📊 연관 키워드:
1. components (0.85) - 7개 메모리
2. hooks (0.72) - 5개 메모리  
3. redux (0.68) - 4개 메모리
4. jsx (0.61) - 6개 메모리
5. state (0.58) - 8개 메모리

💡 추천 검색어:
- "react components 최적화"
- "react hooks 패턴"
- "react redux 연동"
```

---

### `get_search_stats`

검색 시스템의 통계 정보를 조회합니다.

**파라미터:**
- `include_projects` (boolean, 선택): 프로젝트별 통계 포함 (기본값: true)
- `include_tags` (boolean, 선택): 태그별 통계 포함 (기본값: true)
- `include_performance` (boolean, 선택): 성능 통계 포함 (기본값: false)

**응답:**
```
📊 검색 시스템 통계

📚 메모리 현황:
- 총 메모리: 156개
- 활성 메모리: 142개
- 아카이브: 14개

🏷️ 인기 태그 TOP 5:
1. react (23개)
2. javascript (18개)
3. optimization (15개)
4. api (12개)
5. database (10개)

📁 프로젝트별 분포:
- ecommerce-web: 45개
- mobile-app: 32개
- admin-panel: 28개
- others: 37개

🔍 인덱스 상태:
- 키워드 인덱스: 1,247개 항목
- 마지막 최적화: 2024-12-01 09:30:00
```

---

### `optimize_search_index`

검색 인덱스를 최적화합니다.

**파라미터:**
- `force_rebuild` (boolean, 선택): 강제 재구성 (기본값: false)
- `cleanup_orphaned` (boolean, 선택): 고아 인덱스 정리 (기본값: true)

**응답:**
```
🔧 검색 인덱스 최적화 완료

📊 최적화 결과:
- 처리된 메모리: 156개
- 인덱스 항목: 1,247개 → 1,203개 (-44개)
- 고아 인덱스 정리: 15개 제거
- 소요 시간: 2.3초

✅ 성능 개선:
- 평균 검색 시간: 120ms → 85ms (-29%)
- 인덱스 크기: 2.1MB → 1.8MB (-14%)
```

---

## 히스토리 & 버전 관리

### `get_work_memory_history`

메모리 변경 히스토리를 조회합니다.

**파라미터:**
- `memory_id` (string, 선택): 특정 메모리 ID (미지정시 전체 히스토리)
- `limit` (number, 선택): 결과 개수 제한 (기본값: 50)
- `change_type` (string, 선택): 변경 유형 필터 (CREATE, UPDATE, DELETE, ARCHIVE)
- `date_from` (string, 선택): 시작 날짜
- `date_to` (string, 선택): 종료 날짜
- `project_filter` (string, 선택): 프로젝트 필터
- `creator_filter` (string, 선택): 생성자 필터

---


---

### `restore_memory_version`

메모리를 이전 버전으로 복구합니다.

**파라미터:**
- `memory_id` (string, 필수): 복구할 메모리 ID
- `target_version` (string, 선택): 대상 버전 (미지정시 최근 이전 버전)
- `restore_mode` (string, 선택): 복구 모드 (full, selective, preview)
- `selective_fields` (array, 선택): 선택적 복구 필드
- `create_backup` (boolean, 선택): 백업 생성 여부
- `auto_version` (boolean, 선택): 자동 버전 생성 여부
- `description` (string, 선택): 복구 설명
- `confirm_restore` (boolean, 선택): 복구 확인 (실제 복구 시 필수)

**예시:**
```json
{
  "memory_id": "mem_20241201_001",
  "target_version": "1.2",
  "restore_mode": "full",
  "create_backup": true,
  "confirm_restore": true,
  "description": "잘못된 수정 내용 롤백"
}
```

---

## 시스템

### `get_server_status`

MCP 서버의 상태 정보를 조회합니다.

**파라미터:**
- `include_performance` (boolean, 선택): 성능 정보 포함
- `include_statistics` (boolean, 선택): 통계 정보 포함
- `include_health_check` (boolean, 선택): 헬스 체크 포함

**응답:**
```
🧠 Work Memory MCP Server v0.1.0

🔋 서버 상태: 정상 운영
⏱️ 가동 시간: 2시간 34분
💾 메모리 사용량: 45.2MB / 512MB (8.8%)

📊 시스템 통계:
- 총 메모리: 156개
- 총 요청: 1,247건
- 평균 응답 시간: 85ms
- 오류율: 0.2%

🔧 구성요소 상태:
✅ 데이터베이스: 정상
✅ 검색 인덱스: 정상  
✅ 파일 시스템: 정상
✅ 백업 시스템: 정상
```

---

## 🔄 응답 형식

### 성공 응답
모든 도구는 성공 시 사용자 친화적인 텍스트 형식으로 응답합니다.

### 오류 응답
오류 발생 시 `❌` 이모지와 함께 명확한 오류 메시지를 제공합니다.

```
❌ 메모리 ID 'invalid_id'를 찾을 수 없습니다.
💡 사용 가능한 메모리 목록을 확인하려면 list_work_memories를 사용하세요.
```

### 데이터 형식

#### 날짜/시간
- ISO 8601 형식: `2024-12-01T09:30:00.000Z`
- 로컬 표시: `2024-12-01 18:30:00`

#### 메모리 ID
- 형식: `mem_YYYYMMDD_XXX`
- 예시: `mem_20241201_001`

#### 중요도
- 범위: 1-10 (1: 매우 낮음, 10: 매우 높음)
- 기본값: 5

---

## 🚀 성능 고려사항

### 검색 최적화
- 정기적인 인덱스 최적화 권장 (`optimize_search_index`)
- 대량 검색 시 `limit` 파라미터 활용
- 구체적인 검색어 사용으로 정확도 향상

### 메모리 관리
- 중복 메모리 방지를 위한 검색 후 저장
- 불필요한 메모리는 아카이브 활용
- 정기적인 정리 작업 수행

### 버전 관리
- 자동 버전 생성으로 변경 이력 추적
- 중요한 변경 전 수동 백업 생성
- 복구 시 미리보기 모드로 변경사항 확인