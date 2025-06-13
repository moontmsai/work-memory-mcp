/**
 * JSON-RPC 2.0 메시지 파서
 * 단순하고 직관적인 파싱 로직
 */

import { JsonRpcMessage, JsonRpcError } from './types'

export class JsonRpcParser {
  /**
   * 문자열을 JSON-RPC 메시지로 파싱
   */
  static parse(input: string): JsonRpcMessage | null {
    try {
      const parsed = JSON.parse(input)
      
      if (!this.isValidJsonRpc(parsed)) {
        return null
      }
      
      return parsed as JsonRpcMessage
    } catch (error) {
      console.error('JSON-RPC 파싱 에러:', error)
      return null
    }
  }

  /**
   * JSON-RPC 2.0 형식 검증
   */
  private static isValidJsonRpc(obj: any): boolean {
    return obj && obj.jsonrpc === '2.0'
  }

  /**
   * 메시지 타입 확인
   */
  static getMessageType(message: JsonRpcMessage): 'request' | 'response' | 'notification' {    if (message.method && message.id !== undefined) {
      return 'request'
    }
    
    if (message.method && message.id === undefined) {
      return 'notification'
    }
    
    if (message.result !== undefined || message.error !== undefined) {
      return 'response'
    }
    
    return 'notification'
  }

  /**
   * 메시지를 문자열로 직렬화
   */
  static stringify(message: JsonRpcMessage): string {
    return JSON.stringify(message)
  }

  /**
   * 에러 메시지 생성
   */
  static createError(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcMessage {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message, data }
    }
  }
}