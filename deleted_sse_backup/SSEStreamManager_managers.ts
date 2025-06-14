/**
 * SSE 스트림 관리자
 * 클라이언트 연결 관리 및 실시간 이벤트 전송
 */

import { Response } from 'express';

export interface SSEClient {
  id: string;
  response: Response;
  connectedAt: Date;
}

export interface ProgressData {
  taskId: string;
  progress: number;
  processed?: number;
  total?: number;
  message?: string;
  details?: string;
  timestamp?: number;
}

export interface TaskStartData {
  taskId: string;
  operation: string;
  metadata?: any;
  timestamp?: number;
}

export interface TaskCompleteData {
  taskId: string;
  result?: any;
  metadata?: any;
  timestamp?: number;
}

export interface TaskErrorData {
  taskId: string;
  error: string;
  metadata?: any;
  timestamp?: number;
}

export class SSEStreamManager {
  private clients: Map<string, SSEClient> = new Map();

  /**
   * 새 클라이언트 추가
   */
  addClient(response: Response): string {
    const clientId = Date.now().toString() + Math.random().toString(36).substring(2);
    
    const client: SSEClient = {
      id: clientId,
      response,
      connectedAt: new Date()
    };

    this.clients.set(clientId, client);
    console.log(`📱 SSE 클라이언트 연결: ${clientId} (총 ${this.clients.size}개)`);
    
    return clientId;
  }

  /**
   * 클라이언트 제거
   */
  removeClient(clientId: string): boolean {
    const removed = this.clients.delete(clientId);
    if (removed) {
      console.log(`📱 SSE 클라이언트 해제: ${clientId} (총 ${this.clients.size}개)`);
    }
    return removed;
  }

  /**
   * 연결된 클라이언트 수 반환
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * 모든 클라이언트에게 이벤트 전송
   */
  private broadcast(event: string, data: any): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    
    const disconnectedClients: string[] = [];

    for (const [clientId, client] of this.clients) {
      try {
        client.response.write(message);
      } catch (error) {
        console.warn(`📱 클라이언트 ${clientId} 전송 실패:`, error);
        disconnectedClients.push(clientId);
      }
    }

    // 연결이 끊어진 클라이언트 정리
    disconnectedClients.forEach(clientId => {
      this.removeClient(clientId);
    });
  }

  /**
   * 진행상황 업데이트 전송
   */
  sendProgress(taskId: string, progress: number, processed?: number, total?: number, message?: string, details?: string): void {
    const data: ProgressData = {
      taskId,
      progress: Math.min(100, Math.max(0, progress)),
      processed,
      total,
      message,
      details,
      timestamp: Date.now()
    };

    this.broadcast('progress', data);
  }

  /**
   * 작업 시작 알림
   */
  sendTaskStart(taskId: string, operation: string, metadata?: any): void {
    const data: TaskStartData = {
      taskId,
      operation,
      metadata,
      timestamp: Date.now()
    };

    this.broadcast('task-start', data);
  }

  /**
   * 작업 완료 알림
   */
  sendTaskComplete(taskId: string, result?: any, metadata?: any): void {
    const data: TaskCompleteData = {
      taskId,
      result,
      metadata,
      timestamp: Date.now()
    };

    this.broadcast('task-complete', data);
  }

  /**
   * 작업 오류 알림
   */
  sendTaskError(taskId: string, error: string, metadata?: any): void {
    const data: TaskErrorData = {
      taskId,
      error,
      metadata,
      timestamp: Date.now()
    };

    this.broadcast('task-error', data);
  }

  /**
   * 일반 메시지 전송
   */
  sendMessage(message: string, data?: any): void {
    this.broadcast('message', {
      message,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * 모든 클라이언트 연결 해제
   */
  disconnectAll(): void {
    for (const client of this.clients.values()) {
      try {
        client.response.end();
      } catch (error) {
        // 이미 연결이 끊어진 경우 무시
      }
    }
    this.clients.clear();
    console.log('📱 모든 SSE 클라이언트 연결 해제됨');
  }

  /**
   * 클라이언트 목록 조회
   */
  getClients(): SSEClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * 특정 클라이언트에게만 메시지 전송
   */
  sendToClient(clientId: string, event: string, data: any): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      client.response.write(message);
      return true;
    } catch (error) {
      console.warn(`📱 클라이언트 ${clientId} 개별 전송 실패:`, error);
      this.removeClient(clientId);
      return false;
    }
  }
}