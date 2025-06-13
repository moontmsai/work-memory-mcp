const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'work_memory', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('change_history 테이블 스키마 업데이트 중...');

// CHECK 제약 조건을 수정하기 위해 새 테이블 생성 후 데이터 이전
const updateSchema = `
BEGIN TRANSACTION;

-- 1. 새 테이블 생성 (restored 액션 추가)
CREATE TABLE change_history_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,
  action TEXT CHECK(action IN ('created', 'updated', 'deleted', 'archived', 'accessed', 'restored')) NOT NULL,
  old_data TEXT,
  new_data TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  details TEXT,
  changed_fields TEXT,
  user_agent TEXT,
  session_id TEXT
);

-- 2. 기존 데이터 복사
INSERT INTO change_history_new (id, memory_id, action, old_data, new_data, timestamp, details, changed_fields, user_agent, session_id)
SELECT id, memory_id, action, old_data, new_data, timestamp, details, changed_fields, user_agent, session_id
FROM change_history;

-- 3. 기존 테이블 삭제
DROP TABLE change_history;

-- 4. 새 테이블을 원래 이름으로 변경
ALTER TABLE change_history_new RENAME TO change_history;

COMMIT;
`;

db.exec(updateSchema, (err) => {
  if (err) {
    console.error('스키마 업데이트 실패:', err);
  } else {
    console.log('✅ change_history 테이블 스키마 업데이트 완료 - restored 액션 추가됨');
  }
  
  db.close();
});
