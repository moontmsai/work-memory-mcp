/**
 * SSE 스트림 관리자
 * 연결 관리와 메시지 전송 처리
 */

import { SseConnection, JsonRpcMessage, SseConvertOptions } from './types'
import { SseConverter } from './converter'
import { MessageQueue } from './queue'

export class SseStreamManager {
  private connections: Map<string, SseConnection> = new Map()
  private messageQueue: MessageQueue
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(queueSize: number = 100, maxRetries: number = 3) {
    this.messageQueue = new MessageQueue(queueSize, maxRetries)
    this.startCleanupTimer()
  }

  /**
   * 새로운 SSE 연결 생성
   */
  createConnection(connectionId?: string): string {
    const id = connectionId || this.generateConnectionId()
    
    const connection: SseConnection = {
      id,
      connected: true,
      lastActivity: Date.now(),
      messageQueue: []
    }

    this.connections.set(id, connection)
    return id
  }
  /**
   * 연결 해제
   */
  closeConnection(connectionId: string): boolean {
    const connection = this.connections.get(connectionId)
    if (connection) {
      connection.connected = false
      this.connections.delete(connectionId)
      return true
    }
    return false
  }

  /**
   * 메시지를 특정 연결로 전송
   */
  sendMessage(connectionId: string, message: JsonRpcMessage, options?: SseConvertOptions): string | null {
    const connection = this.connections.get(connectionId)
    if (!connection || !connection.connected) {
      return null
    }

    const messageId = this.messageQueue.enqueue(message)
    const sseData = SseConverter.toSseString(message, options)
    
    // 실제 전송 로직은 구현체에서 처리
    connection.lastActivity = Date.now()
    
    return sseData
  }

  /**
   * 모든 연결에 브로드캐스트
   */
  broadcast(message: JsonRpcMessage, options?: SseConvertOptions): string[] {
    const results: string[] = []
    
    for (const [connectionId] of this.connections) {
      const result = this.sendMessage(connectionId, message, options)
      if (result) {
        results.push(result)
      }
    }
    
    return results
  }
  /**
   * 연결 상태 확인
   */
  isConnected(connectionId: string): boolean {
    const connection = this.connections.get(connectionId)
    return connection?.connected || false
  }

  /**
   * 연결 ID 생성
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 비활성 연결 정리
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      const maxInactivity = 30 * 60 * 1000 // 30분

      for (const [id, connection] of this.connections) {
        if (!connection.connected || now - connection.lastActivity > maxInactivity) {
          this.connections.delete(id)
        }
      }
    }, 5 * 60 * 1000) // 5분마다 정리
  }

  /**
   * 스트림 매니저 종료
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.connections.clear()
    this.messageQueue.clear()
  }

  /**
   * 연결 통계
   */
  getStats() {
    return {
      activeConnections: this.connections.size,
      queueStatus: this.messageQueue.getStatus()
    }
  }
}