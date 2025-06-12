-- work_sessions Table Schema Definition
-- 프로젝트 세션 관리를 위한 테이블

CREATE TABLE IF NOT EXISTS work_sessions (
    -- 기본 식별자
    session_id TEXT PRIMARY KEY,
    
    -- 프로젝트 정보
    project_name TEXT NOT NULL,
    project_path TEXT,
    git_repository TEXT,
    
    -- 세션 시간 관리
    started_at DATETIME NOT NULL DEFAULT (datetime('now')),
    ended_at DATETIME,
    last_activity_at DATETIME DEFAULT (datetime('now')),
    
    -- 세션 상태 관리
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'cancelled')),
    
    -- 메타데이터
    description TEXT,
    auto_created BOOLEAN DEFAULT TRUE,
    tags TEXT, -- JSON 배열 형태로 저장 ["tag1", "tag2"]
    
    -- 추적 정보
    created_by TEXT DEFAULT 'system',
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    
    -- 세션 통계
    activity_count INTEGER DEFAULT 0,
    memory_count INTEGER DEFAULT 0,
    total_work_time INTEGER DEFAULT 0, -- 초 단위로 저장
    
    -- 정규화된 프로젝트명 (검색 최적화)
    project_normalized TEXT GENERATED ALWAYS AS (lower(trim(project_name))) STORED
);

-- 인덱스 정의
CREATE INDEX IF NOT EXISTS idx_work_sessions_project_name ON work_sessions(project_name);
CREATE INDEX IF NOT EXISTS idx_work_sessions_project_normalized ON work_sessions(project_normalized);
CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status);
CREATE INDEX IF NOT EXISTS idx_work_sessions_started_at ON work_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_work_sessions_last_activity ON work_sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_work_sessions_auto_created ON work_sessions(auto_created);

-- 복합 인덱스 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_work_sessions_status_activity ON work_sessions(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_sessions_project_status ON work_sessions(project_name, status);
CREATE INDEX IF NOT EXISTS idx_work_sessions_active_projects ON work_sessions(project_normalized, status) WHERE status = 'active';

-- work_memories 테이블에 session_id 컬럼 추가
-- ALTER TABLE work_memories ADD COLUMN session_id TEXT REFERENCES work_sessions(session_id);

-- session_id 관련 인덱스
-- CREATE INDEX IF NOT EXISTS idx_work_memories_session_id ON work_memories(session_id);
-- CREATE INDEX IF NOT EXISTS idx_work_memories_session_project ON work_memories(session_id, project);

-- Foreign Key 관계 (기존 데이터와의 호환성을 위해 주석 처리)
-- FOREIGN KEY (session_id) REFERENCES work_sessions(session_id) ON DELETE SET NULL