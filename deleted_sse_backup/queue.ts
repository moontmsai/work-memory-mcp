/**
 * 메시지 큐 관리자
 * SSE 메시지 큐잉과 재전송 처리
 */

import { QueuedMessage, JsonRpcMessage } from './types'

export class MessageQueue {
  private queue: QueuedMessage[] = []
  private maxSize: number
  private maxRetries: number

  constructor(maxSize: number = 100, maxRetries: number = 3) {
    this.maxSize = maxSize
    this.maxRetries = maxRetries
  }

  /**
   * 메시지를 큐에 추가
   */
  enqueue(message: JsonRpcMessage): string {
    const id = this.generateId()
    
    const queuedMessage: QueuedMessage = {
      id,
      message,
      timestamp: Date.now(),
      retryCount: 0
    }

    this.queue.push(queuedMessage)
    this.trimQueue()
    
    return id
  }
  /**
   * 메시지를 큐에서 제거
   */
  dequeue(): QueuedMessage | null {
    return this.queue.shift() || null
  }

  /**
   * 특정 ID의 메시지 제거
   */
  remove(id: string): boolean {
    const index = this.queue.findIndex(item => item.id === id)
    if (index !== -1) {
      this.queue.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * 재시도 처리
   */
  retry(id: string): boolean {
    const item = this.queue.find(msg => msg.id === id)
    if (item && item.retryCount < this.maxRetries) {
      item.retryCount++
      item.timestamp = Date.now()
      return true
    }
    return false
  }

  /**
   * 큐 크기 제한
   */
  private trimQueue(): void {
    while (this.queue.length > this.maxSize) {
      this.queue.shift()
    }
  }
  /**
   * ID 생성
   */
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 큐 상태 정보
   */
  getStatus() {
    return {
      size: this.queue.length,
      maxSize: this.maxSize,
      oldestMessage: this.queue[0]?.timestamp || null,
      newestMessage: this.queue[this.queue.length - 1]?.timestamp || null
    }
  }

  /**
   * 큐 비우기
   */
  clear(): void {
    this.queue = []
  }

  /**
   * 모든 메시지 가져오기
   */
  getAll(): QueuedMessage[] {
    return [...this.queue]
  }
}