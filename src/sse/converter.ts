/**
 * SSE (Server-Sent Events) 포맷 변환기
 * JSON-RPC 메시지를 SSE 형식으로 변환
 */

import { JsonRpcMessage, SseEvent, SseConvertOptions } from './types'
import { JsonRpcParser } from './parser'

export class SseConverter {
  private static readonly DEFAULT_OPTIONS: Required<SseConvertOptions> = {
    eventName: 'message',
    includeId: true,
    maxRetries: 3,
    queueSize: 100
  }

  /**
   * JSON-RPC 메시지를 SSE 이벤트로 변환
   */
  static convert(message: JsonRpcMessage, options: SseConvertOptions = {}): SseEvent {
    const opts = { ...this.DEFAULT_OPTIONS, ...options }
    
    const event: SseEvent = {
      event: opts.eventName,
      data: JsonRpcParser.stringify(message)
    }

    if (opts.includeId && message.id) {
      event.id = String(message.id)
    }

    return event
  }

  /**
   * SSE 이벤트를 문자열로 직렬화
   */  static formatSseEvent(event: SseEvent): string {
    let output = ''
    
    if (event.id) {
      output += `id: ${event.id}\n`
    }
    
    if (event.event) {
      output += `event: ${event.event}\n`
    }
    
    if (event.retry) {
      output += `retry: ${event.retry}\n`
    }
    
    // 데이터는 여러 줄로 나누어 전송 가능
    const dataLines = event.data.split('\n')
    for (const line of dataLines) {
      output += `data: ${line}\n`
    }
    
    output += '\n' // SSE 메시지 종료
    
    return output
  }

  /**
   * JSON-RPC 메시지를 바로 SSE 문자열로 변환
   */
  static toSseString(message: JsonRpcMessage, options?: SseConvertOptions): string {
    const event = this.convert(message, options)
    return this.formatSseEvent(event)
  }
}