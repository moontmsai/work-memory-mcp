/**
 * SSE (Server-Sent Events) 관련 타입 정의
 * 모듈식 구조로 직관적이고 단순하게 설계
 */

// JSON-RPC 2.0 표준 메시지 타입
export interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: string | number | null
  method?: string
  params?: unknown
  result?: unknown
  error?: JsonRpcError
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

// SSE 이벤트 타입
export interface SseEvent {
  id?: string
  event?: string
  data: string
  retry?: number
}

// 메시지 큐 아이템
export interface QueuedMessage {
  id: string
  message: JsonRpcMessage
  timestamp: number
  retryCount: number
}

// SSE 연결 정보
export interface SseConnection {
  id: string
  connected: boolean
  lastActivity: number
  messageQueue: QueuedMessage[]
}

// SSE 변환 옵션
export interface SseConvertOptions {
  eventName?: string
  includeId?: boolean
  maxRetries?: number
  queueSize?: number
}
