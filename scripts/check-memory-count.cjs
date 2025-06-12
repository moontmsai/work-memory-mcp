const fs = require('fs');

try {
    const data = JSON.parse(fs.readFileSync('./work_memory/current_work.json', 'utf8'));
    console.log('=== 메모리 파일 상태 확인 ===');
    console.log('실제 메모리 개수:', data.memories.length);
    console.log('stats.total_memories:', data.stats.total_memories);
    console.log('파일 크기:', fs.statSync('./work_memory/current_work.json').size, 'bytes');
    
    if (data.memories.length > 0) {
        console.log('\n=== 메모리 목록 ===');
        data.memories.forEach((mem, i) => {
            console.log(`${i+1}. ${mem.id} - ${mem.project || '프로젝트 없음'}`);
        });
    }
} catch (error) {
    console.error('파일 읽기 오류:', error.message);
} 