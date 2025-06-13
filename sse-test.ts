/**
 * SSE 기능 테스트 예제
 * 실제 사용법을 보여주는 간단한 예제
 */

import SseManager from './src/sse'
import { JsonRpcMessage } from './src/sse/types'

// SSE 매니저 초기화
const sseManager = new SseManager({
  queueSize: 50,
  maxRetries: 3,
  defaultEventName: 'work-memory-event'
})

// 테스트 JSON-RPC 메시지들
const testMessages = [
  // 요청 메시지
  {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'add_work_memory',
    params: {
      content: '테스트 메모리 추가',
      importance_score: 80
    }
  },
  
  // 응답 메시지
  {
    jsonrpc: '2.0' as const,
    id: 1,
    result: {
      success: true,
      memory_id: 'mem_test_12345'
    }
  },
  
  // 알림 메시지
  {
    jsonrpc: '2.0' as const,
    method: 'memory_updated',
    params: {
      memory_id: 'mem_test_12345',
      status: 'completed'
    }
  }
]

// 테스트 실행
function runSseTest() {
  console.log('🚀 SSE 기능 테스트 시작')
  
  // 연결 생성
  const connectionId = sseManager.createConnection()
  console.log(`📡 연결 생성: ${connectionId}`)
  
  // 메시지 변환 및 전송 테스트
  testMessages.forEach((message, index) => {
    console.log(`\n📨 메시지 ${index + 1} 처리:`)
    console.log('Input:', JSON.stringify(message, null, 2))
    
    const sseOutput = sseManager.processJsonRpcMessage(message, connectionId)
    console.log('SSE Output:')
    console.log(sseOutput)
  })
  
  // 통계 확인
  console.log('\n📊 통계 정보:')
  console.log(sseManager.getStats())
  
  // 정리
  sseManager.closeConnection(connectionId)
  sseManager.destroy()
  
  console.log('✅ 테스트 완료')
}

// 모듈로 실행 시 테스트 실행
if (require.main === module) {
  runSseTest()
}

export { runSseTest }