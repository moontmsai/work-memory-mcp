const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'work_memory', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('데이터베이스 스키마 확인...');

db.all('PRAGMA table_info(work_memories)', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('work_memories 테이블 스키마:');
    console.log(JSON.stringify(rows, null, 2));
  }
  
  db.close();
});
