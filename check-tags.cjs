const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'work_memory', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('복구된 메모리의 태그 상태 확인...');

db.get('SELECT id, tags FROM work_memories WHERE id = ?', ['mem_20250613T080924_7fnvqu'], (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else if (row) {
    console.log('메모리 ID:', row.id);
    console.log('태그 데이터:', row.tags);
    console.log('태그 타입:', typeof row.tags);
    console.log('태그 길이:', row.tags ? row.tags.length : 'null');
    
    // JSON 파싱 시도
    try {
      const parsed = JSON.parse(row.tags);
      console.log('파싱된 태그:', parsed);
      console.log('파싱된 타입:', typeof parsed);
      console.log('배열인가?', Array.isArray(parsed));
    } catch (parseError) {
      console.log('JSON 파싱 실패:', parseError.message);
    }
  } else {
    console.log('메모리를 찾을 수 없습니다.');
  }
  
  db.close();
});
