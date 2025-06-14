/**
 * SSE 통합 인터페이스
 * 모든 SSE 기능을 하나로 통합한 메인 클래스
 */

import { JsonRpcMessage, SseConvertOptions } from './types'
import { JsonRpcParser } from './parser'
import { SseConverter } from './converter'
import { SseStreamManager } from './stream'

export class SseManager {
  private streamManager: SseStreamManager
  private defaultOptions: SseConvertOptions

  constructor(options: {
    queueSize?: number
    maxRetries?: number
    defaultEventName?: string
  } = {}) {
    this.streamManager = new SseStreamManager(
      options.queueSize || 100,
      options.maxRetries || 3
    )
    
    this.defaultOptions = {
      eventName: options.defaultEventName || 'mcp-message',
      includeId: true,
      maxRetries: options.maxRetries || 3,
      queueSize: options.queueSize || 100
    }
  }

  /**
   * JSON-RPC 문자열을 SSE로 변환하여 전송
   */
  processJsonRpcString(input: string, connectionId?: string): string | null {
    const message = JsonRpcParser.parse(input)
    if (!message) {
      return null
    }

    return this.processJsonRpcMessage(message, connectionId)
  }
  /**
   * JSON-RPC 메시지를 SSE로 변환하여 전송
   */
  processJsonRpcMessage(message: JsonRpcMessage, connectionId?: string): string | null {
    if (connectionId) {
      return this.streamManager.sendMessage(connectionId, message, this.defaultOptions)
    } else {
      const results = this.streamManager.broadcast(message, this.defaultOptions)
      return results[0] || null
    }
  }

  /**
   * 새로운 SSE 연결 생성
   */
  createConnection(): string {
    return this.streamManager.createConnection()
  }

  /**
   * 연결 해제
   */
  closeConnection(connectionId: string): boolean {
    return this.streamManager.closeConnection(connectionId)
  }

  /**
   * 모든 연결에 브로드캐스트
   */
  broadcast(message: JsonRpcMessage): string[] {
    return this.streamManager.broadcast(message, this.defaultOptions)
  }

  /**
   * 연결 상태 확인
   */
  isConnected(connectionId: string): boolean {
    return this.streamManager.isConnected(connectionId)
  }
  /**
   * 통계 정보
   */
  getStats() {
    return this.streamManager.getStats()
  }

  /**
   * SSE 매니저 종료
   */
  destroy(): void {
    this.streamManager.destroy()
  }

  /**
   * 정적 유틸리티 메서드들
   */
  static parseJsonRpc(input: string): JsonRpcMessage | null {
    return JsonRpcParser.parse(input)
  }

  static convertToSse(message: JsonRpcMessage, options?: SseConvertOptions): string {
    return SseConverter.toSseString(message, options)
  }
}

// 모든 클래스와 타입을 외부로 export
export * from './types'
export { JsonRpcParser } from './parser'
export { SseConverter } from './converter'
export { MessageQueue } from './queue'
export { SseStreamManager } from './stream'
export { SseManager as default } from './index'