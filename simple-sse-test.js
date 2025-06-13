// 간단한 SSE 기능 테스트
const { JsonRpcParser } = require('./src/sse/parser');
const { SseConverter } = require('./src/sse/converter');

// 테스트 JSON-RPC 메시지
const testMessage = {
  jsonrpc: '2.0',
  id: 1,
  method: 'add_work_memory',
  params: {
    content: 'SSE 테스트 메시지',
    importance_score: 90
  }
};

console.log('🚀 SSE 변환 테스트');
console.log('================');

console.log('📨 입력 JSON-RPC:');
console.log(JSON.stringify(testMessage, null, 2));

console.log('\n🔄 SSE 변환 결과:');
const sseOutput = SseConverter.toSseString(testMessage);
console.log(sseOutput);

console.log('✅ 테스트 완료');
