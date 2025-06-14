import { DatabaseConnection } from './connection.js';

// 데이터베이스 스키마 정의
export const SCHEMA_SQL = {
  // 작업 메모리 테이블
  WORK_MEMORIES: `
    CREATE TABLE IF NOT EXISTS work_memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      extracted_content TEXT,
      project TEXT,
      tags TEXT, -- JSON 배열 형태로 저장 ["tag1", "tag2"]
      -- 수치형 중요도 점수 (0-100, 기본값 50)
      importance_score INTEGER DEFAULT 50 CHECK(importance_score >= 0 AND importance_score <= 100),
      created_by TEXT DEFAULT 'unknown',
      created_at TEXT DEFAULT (datetime('now')), -- ISO 8601 형식
      updated_at TEXT DEFAULT (datetime('now')), -- ISO 8601 형식
      access_count INTEGER DEFAULT 0,
      last_accessed_at TEXT DEFAULT (datetime('now')), -- ISO 8601 형식
      is_archived BOOLEAN DEFAULT FALSE,
      -- 할일 관리 확장 필드
      context TEXT, -- 현재 상황, 배경 정보
      requirements TEXT, -- 구체적 요구사항
      result_content TEXT, -- 작업 결과물
      work_type TEXT CHECK(work_type IN ('memory', 'todo')) DEFAULT 'memory', -- 작업 유형
      worked TEXT CHECK(worked IN ('완료', '미완료')), -- 작업 완료 상태
      -- 세션 연동 필드
      session_id TEXT, -- work_sessions 테이블과 연동
      -- 검색 최적화를 위한 추가 필드
      content_length INTEGER GENERATED ALWAYS AS (length(content)) STORED,
      project_normalized TEXT GENERATED ALWAYS AS (lower(trim(project))) STORED,
      FOREIGN KEY (session_id) REFERENCES work_sessions(session_id) ON DELETE SET NULL
    );
  `,

  // 검색 키워드 테이블
  SEARCH_KEYWORDS: `
    CREATE TABLE IF NOT EXISTS search_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      source TEXT CHECK(source IN ('content', 'tags', 'project', 'extracted')) DEFAULT 'content',
      FOREIGN KEY (memory_id) REFERENCES work_memories(id) ON DELETE CASCADE
    );
  `,

  // 프로젝트 인덱스 테이블
  PROJECT_INDEX: `
    CREATE TABLE IF NOT EXISTS project_index (
      project TEXT PRIMARY KEY,
      project_normalized TEXT GENERATED ALWAYS AS (lower(trim(project))) STORED,
      memory_count INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now')),
      -- 프로젝트 통계
      total_importance_score REAL DEFAULT 0.0,
      most_recent_memory_date TEXT,
      most_active_creator TEXT
    );
  `,

  // 시스템 설정 테이블
  SYSTEM_SETTINGS: `
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      value_type TEXT CHECK(value_type IN ('string', 'number', 'boolean', 'json')) DEFAULT 'string',
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `,

  // 프로젝트 세션 테이블
  WORK_SESSIONS: `
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
      tags TEXT, -- JSON 배열 형태로 저장
      
      -- 추적 정보
      created_by TEXT DEFAULT 'system',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      
      -- 세션 통계
      activity_count INTEGER DEFAULT 0,
      memory_count INTEGER DEFAULT 0,
      total_work_time INTEGER DEFAULT 0, -- 초 단위
      
      -- 정규화된 프로젝트명
      project_normalized TEXT GENERATED ALWAYS AS (lower(trim(project_name))) STORED
    );
  `,

  // 변경 히스토리 테이블
  CHANGE_HISTORY: `
    CREATE TABLE IF NOT EXISTS change_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id TEXT NOT NULL,
      action TEXT CHECK(action IN ('created', 'updated', 'deleted', 'archived', 'accessed', 'restored')) NOT NULL,
      old_data TEXT, -- JSON 형태로 이전 상태 저장
      new_data TEXT, -- JSON 형태로 새로운 상태 저장
      timestamp TEXT DEFAULT (datetime('now')),
      details TEXT,
      -- 변경 추적을 위한 추가 필드
      changed_fields TEXT, -- JSON 배열로 변경된 필드명 저장
      user_agent TEXT,
      session_id TEXT
    );
  `,

  // 백업 및 아카이브 테이블
  ARCHIVED_MEMORIES: `
    CREATE TABLE IF NOT EXISTS archived_memories (
      id TEXT PRIMARY KEY,
      original_memory_id TEXT NOT NULL,
      content TEXT NOT NULL,
      original_data TEXT, -- 원본 메모리의 전체 JSON 데이터
      archived_at TEXT DEFAULT (datetime('now')),
      reason TEXT,
      archived_by TEXT DEFAULT 'system',
      -- 복구를 위한 메타데이터
      original_project TEXT,
      original_tags TEXT,
      original_importance TEXT
    );
  `,

  // 메모리 버전 관리 테이블
  MEMORY_VERSIONS: `
    CREATE TABLE IF NOT EXISTS memory_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id TEXT NOT NULL,
      version TEXT NOT NULL,
      data TEXT NOT NULL, -- JSON 형태로 해당 버전의 메모리 전체 데이터
      timestamp TEXT DEFAULT (datetime('now')),
      change_log_id INTEGER,
      size INTEGER,
      description TEXT,
      created_by TEXT DEFAULT 'system',
      FOREIGN KEY (memory_id) REFERENCES work_memories(id) ON DELETE CASCADE,
      FOREIGN KEY (change_log_id) REFERENCES change_history(id) ON DELETE SET NULL,
      UNIQUE (memory_id, version)
    );
  `,

  // 인덱스 생성
  INDEXES: [
    // work_memories 테이블 인덱스
    'CREATE INDEX IF NOT EXISTS idx_work_memories_project ON work_memories(project);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_project_normalized ON work_memories(project_normalized);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_created_at ON work_memories(created_at);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_importance_score ON work_memories(importance_score);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_is_archived ON work_memories(is_archived);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_created_by ON work_memories(created_by);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_content_length ON work_memories(content_length);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_work_type ON work_memories(work_type);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_worked ON work_memories(worked);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_session_id ON work_memories(session_id);',
    
    // search_keywords 테이블 인덱스
    'CREATE INDEX IF NOT EXISTS idx_search_keywords_memory_id ON search_keywords(memory_id);',
    'CREATE INDEX IF NOT EXISTS idx_search_keywords_keyword ON search_keywords(keyword);',
    // keyword_normalized 컬럼이 제거되었으므로 이 인덱스도 제거
    'CREATE INDEX IF NOT EXISTS idx_search_keywords_source ON search_keywords(source);',
    'CREATE INDEX IF NOT EXISTS idx_search_keywords_weight ON search_keywords(weight);',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_search_keywords_unique ON search_keywords(memory_id, keyword);',
    
    // project_index 테이블 인덱스
    'CREATE INDEX IF NOT EXISTS idx_project_index_normalized ON project_index(project_normalized);',
    'CREATE INDEX IF NOT EXISTS idx_project_index_memory_count ON project_index(memory_count);',
    'CREATE INDEX IF NOT EXISTS idx_project_index_last_updated ON project_index(last_updated);',
    
    // change_history 테이블 인덱스
    'CREATE INDEX IF NOT EXISTS idx_change_history_memory_id ON change_history(memory_id);',
    'CREATE INDEX IF NOT EXISTS idx_change_history_timestamp ON change_history(timestamp);',
    'CREATE INDEX IF NOT EXISTS idx_change_history_action ON change_history(action);',
    'CREATE INDEX IF NOT EXISTS idx_change_history_session_id ON change_history(session_id);',
    
    // archived_memories 테이블 인덱스
    'CREATE INDEX IF NOT EXISTS idx_archived_memories_original_id ON archived_memories(original_memory_id);',
    'CREATE INDEX IF NOT EXISTS idx_archived_memories_archived_at ON archived_memories(archived_at);',
    'CREATE INDEX IF NOT EXISTS idx_archived_memories_project ON archived_memories(original_project);',
    
    // memory_versions 테이블 인덱스
    'CREATE INDEX IF NOT EXISTS idx_memory_versions_memory_id ON memory_versions(memory_id);',
    'CREATE INDEX IF NOT EXISTS idx_memory_versions_timestamp ON memory_versions(timestamp);',
    'CREATE INDEX IF NOT EXISTS idx_memory_versions_version ON memory_versions(version);',
    'CREATE INDEX IF NOT EXISTS idx_memory_versions_change_log_id ON memory_versions(change_log_id);',
    
    // work_sessions 테이블 인덱스
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_project_name ON work_sessions(project_name);',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_project_normalized ON work_sessions(project_normalized);',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status);',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_started_at ON work_sessions(started_at);',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_last_activity ON work_sessions(last_activity_at);',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_auto_created ON work_sessions(auto_created);',
    
    // 복합 인덱스 (성능 최적화)
    'CREATE INDEX IF NOT EXISTS idx_work_memories_project_created ON work_memories(project, created_at);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_importance_score_created ON work_memories(importance_score DESC, created_at);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_score_archived ON work_memories(importance_score DESC, is_archived);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_score_project ON work_memories(importance_score DESC, project);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_archived_score_created ON work_memories(is_archived, importance_score DESC, created_at DESC);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_worktype_score ON work_memories(work_type, importance_score DESC);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_worked_score ON work_memories(worked, importance_score DESC);',
    'CREATE INDEX IF NOT EXISTS idx_work_memories_worktype_worked ON work_memories(work_type, worked);',
    'CREATE INDEX IF NOT EXISTS idx_search_keywords_keyword_weight ON search_keywords(keyword, weight);',
    'CREATE INDEX IF NOT EXISTS idx_memory_versions_memory_timestamp ON memory_versions(memory_id, timestamp);',
    
    // work_sessions 복합 인덱스
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_status_activity ON work_sessions(status, last_activity_at DESC);',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_project_status ON work_sessions(project_name, status);',
    'CREATE INDEX IF NOT EXISTS idx_work_sessions_active_projects ON work_sessions(project_normalized, status) WHERE status = \'active\';'
  ]
};

/**
 * 데이터베이스 스키마 초기화
 */
export async function initializeSchema(connection: DatabaseConnection): Promise<void> {
  try {
    // WAL 모드 설정 (성능 향상)
    await connection.run('PRAGMA journal_mode=WAL;');
    await connection.run('PRAGMA synchronous=NORMAL;');
    await connection.run('PRAGMA cache_size=10000;');
    await connection.run('PRAGMA temp_store=MEMORY;');

    // 자동 공간 회수 설정 (삭제 시 자동으로 파일 크기 축소)
    await connection.run('PRAGMA auto_vacuum=INCREMENTAL;');

    // Foreign Key 제약 조건 활성화
    await connection.run('PRAGMA foreign_keys=ON;');

    // 테이블 생성
    await connection.run(SCHEMA_SQL.WORK_MEMORIES);
    await connection.run(SCHEMA_SQL.SEARCH_KEYWORDS);
    await connection.run(SCHEMA_SQL.PROJECT_INDEX);
    await connection.run(SCHEMA_SQL.SYSTEM_SETTINGS);
    await connection.run(SCHEMA_SQL.WORK_SESSIONS);
    await connection.run(SCHEMA_SQL.CHANGE_HISTORY);
    await connection.run(SCHEMA_SQL.ARCHIVED_MEMORIES);
    await connection.run(SCHEMA_SQL.MEMORY_VERSIONS);

    // 인덱스 생성
    for (const indexSql of SCHEMA_SQL.INDEXES) {
      await connection.run(indexSql);
    }

    // 할일 관리 필드 마이그레이션 (기존 DB 호환성)
    await migrateToDoFields(connection);

    // 기본 설정 삽입
    await insertDefaultSettings(connection);

  } catch (error) {
    throw error;
  }
}

/**
 * 할일 관리 필드 마이그레이션 (기존 DB 호환성)
 */
async function migrateToDoFields(connection: DatabaseConnection): Promise<void> {
  try {
    // 필드가 이미 존재하는지 확인하고 없으면 추가
    const tableInfo = await connection.all("PRAGMA table_info(work_memories)");
    const existingColumns = tableInfo.map((col: any) => col.name);
    
    if (!existingColumns.includes('context')) {
      await connection.run('ALTER TABLE work_memories ADD COLUMN context TEXT;');
    }
    
    if (!existingColumns.includes('requirements')) {
      await connection.run('ALTER TABLE work_memories ADD COLUMN requirements TEXT;');
    }
    
    if (!existingColumns.includes('result_content')) {
      await connection.run('ALTER TABLE work_memories ADD COLUMN result_content TEXT;');
    }
    
    if (!existingColumns.includes('work_type')) {
      await connection.run('ALTER TABLE work_memories ADD COLUMN work_type TEXT CHECK(work_type IN (\'memory\', \'todo\')) DEFAULT \'memory\';');
    }

    if (!existingColumns.includes('worked')) {
      await connection.run('ALTER TABLE work_memories ADD COLUMN worked TEXT CHECK(worked IN (\'완료\', \'미완료\'));');
    }

    if (!existingColumns.includes('session_id')) {
      await connection.run('ALTER TABLE work_memories ADD COLUMN session_id TEXT;');
    }

    // importance 필드를 importance_score로 마이그레이션
    await migrateImportanceToScore(connection, existingColumns);

    // work_type 인덱스 추가
    await connection.run('CREATE INDEX IF NOT EXISTS idx_work_memories_work_type ON work_memories(work_type);');
    
    // worked 인덱스 추가
    await connection.run('CREATE INDEX IF NOT EXISTS idx_work_memories_worked ON work_memories(worked);');
    await connection.run('CREATE INDEX IF NOT EXISTS idx_work_memories_worked_score ON work_memories(worked, importance_score DESC);');
    await connection.run('CREATE INDEX IF NOT EXISTS idx_work_memories_worktype_worked ON work_memories(work_type, worked);');
    
    // session_id 인덱스 추가
    await connection.run('CREATE INDEX IF NOT EXISTS idx_work_memories_session_id ON work_memories(session_id);');
    
  } catch (error) {
    // 마이그레이션 실패는 경고만 출력하고 계속 진행
    console.warn('Migration warning:', error);
  }
}

/**
 * importance 필드를 importance_score로 마이그레이션
 */
async function migrateImportanceToScore(connection: DatabaseConnection, existingColumns: string[]): Promise<void> {
  try {
    // importance_score 필드가 없으면 추가
    if (!existingColumns.includes('importance_score')) {
      await connection.run('ALTER TABLE work_memories ADD COLUMN importance_score INTEGER DEFAULT 50 CHECK(importance_score >= 0 AND importance_score <= 100);');
    }

    // 기존 importance 필드가 있으면 값을 변환
    if (existingColumns.includes('importance')) {
      // importance 값을 importance_score로 변환
      await connection.run(`
        UPDATE work_memories 
        SET importance_score = CASE 
          WHEN importance = 'high' THEN 80
          WHEN importance = 'medium' THEN 50  
          WHEN importance = 'low' THEN 20
          ELSE 50
        END
        WHERE importance_score IS NULL OR importance_score = 50
      `);

      // 기존 importance 필드 제거 (SQLite에서는 DROP COLUMN이 제한적이므로 무시)
      // await connection.run('ALTER TABLE work_memories DROP COLUMN importance;');
    }
    
  } catch (error) {
    console.warn('Importance migration warning:', error);
  }
}

/**
 * 기본 시스템 설정 삽입
 */
async function insertDefaultSettings(connection: DatabaseConnection): Promise<void> {
  const defaultSettings = [
    { key: 'version', value: '1.0.0', type: 'string', description: 'Database schema version' },
    { key: 'max_memories_per_project', value: '1000', type: 'number', description: 'Maximum memories per project' },
    { key: 'cleanup_interval_days', value: '30', type: 'number', description: 'Days before cleanup old memories' },
    { key: 'max_keywords_per_memory', value: '10', type: 'number', description: 'Maximum keywords per memory' },
    { key: 'enable_history', value: 'true', type: 'boolean', description: 'Enable change history tracking' },
    { key: 'enable_auto_archive', value: 'true', type: 'boolean', description: 'Enable automatic archiving' },
    { key: 'auto_vacuum_enabled', value: 'true', type: 'boolean', description: 'Enable automatic space reclamation' },
    { key: 'auto_vacuum_interval_hours', value: '1', type: 'number', description: 'Automatic vacuum interval in hours' },
    { key: 'incremental_vacuum_threshold', value: '50', type: 'number', description: 'MB threshold for incremental vacuum' },
    { key: 'search_exact_match_score', value: '10', type: 'number', description: 'Score for exact keyword matches' },
    { key: 'search_partial_match_score', value: '5', type: 'number', description: 'Score for partial keyword matches' },
    { key: 'search_tag_match_score', value: '3', type: 'number', description: 'Score for tag matches' },
    { key: 'search_max_results', value: '20', type: 'number', description: 'Maximum search results to return' },
    { key: 'enable_versioning', value: 'true', type: 'boolean', description: 'Enable memory versioning' },
    { key: 'max_versions_per_memory', value: '20', type: 'number', description: 'Maximum versions to keep per memory' },
    { key: 'auto_version_on_update', value: 'true', type: 'boolean', description: 'Automatically create version on memory update' },
    { key: 'version_cleanup_interval_days', value: '90', type: 'number', description: 'Days before cleaning up old versions' }
  ];

  for (const setting of defaultSettings) {
    try {
      await connection.run(
        'INSERT OR IGNORE INTO system_settings (key, value, value_type, description) VALUES (?, ?, ?, ?)',
        [setting.key, setting.value, setting.type, setting.description]
      );
    } catch (error) {
      // Silently ignore individual setting insertion failures
    }
  }
}

/**
 * 스키마 버전 확인 및 마이그레이션
 */
export async function checkAndMigrateSchema(connection: DatabaseConnection): Promise<void> {
  try {
    // 현재 스키마 버전 확인
    const versionResult = await connection.get(
      'SELECT value FROM system_settings WHERE key = ?',
      ['schema_version']
    );

    const currentVersion = versionResult?.value || '0.0.0';
    const targetVersion = '1.0.0';

    if (currentVersion !== targetVersion) {
      // 필요한 경우 마이그레이션 로직 추가
      // await performMigration(connection, currentVersion, targetVersion);
      
      // 버전 업데이트
      await connection.run(
        'INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)',
        ['schema_version', targetVersion]
      );
    }
  } catch (error) {
    throw error;
  }
} 