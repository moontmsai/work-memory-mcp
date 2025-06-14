/**
 * SSEStreamManager - Server-Sent Events 스트림 관리
 * 실시간 진행률 정보를 클라이언트에게 전송
 */

import { Response } from 'express';
import { ProgressInfo, globalProgressTracker } from './ProgressTracker';

// SSE 클라이언트 연결 정보
export interface SSEClient {
  id: string;
  response: Response;
  taskId?: string;
  connectedAt: Date;
  lastPing: Date;
  isActive: boolean;
}

// SSE 메시지 타입
export interface SSEMessage {
  type: 'progress' | 'complete' | 'error' | 'ping' | 'init';
  data: any;
  timestamp: Date;
}

/**
 * SSE 스트림 관리자
 */
export class SSEStreamManager {
  private clients: Map<string, SSEClient> = new Map();
  private taskClients: Map<string, Set<string>> = new Map(); // taskId -> clientIds
  private pingInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // 정기적인 ping 전송 (30초마다)
    this.pingInterval = setInterval(() => {
      this.sendPingToAllClients();
    }, 30000);

    // 비활성 연결 정리 (5분마다)
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveClients();
    }, 300000);

    // ProgressTracker 이벤트 연결
    this.setupProgressTrackerEvents();
  }

  /**
   * 새 클라이언트 연결 추가
   */
  addClient(clientId: string, response: Response, taskId?: string): void {
    // SSE 헤더 설정
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const client: SSEClient = {
      id: clientId,
      response,
      taskId,
      connectedAt: new Date(),
      lastPing: new Date(),
      isActive: true
    };

    this.clients.set(clientId, client);

    // 작업별 클라이언트 매핑
    if (taskId) {
      if (!this.taskClients.has(taskId)) {
        this.taskClients.set(taskId, new Set());
      }
      this.taskClients.get(taskId)!.add(clientId);

      // 기존 진행률 정보가 있으면 즉시 전송
      const existingTask = globalProgressTracker.getTask(taskId);
      if (existingTask) {
        this.sendToClient(clientId, {
          type: 'progress',
          data: existingTask,
          timestamp: new Date()
        });
      }
    }

    // 연결 확인 메시지
    this.sendToClient(clientId, {
      type: 'init',
      data: { 
        clientId, 
        taskId,
        message: 'SSE 연결이 설정되었습니다',
        serverTime: new Date()
      },
      timestamp: new Date()
    });

    // 연결 종료 처리
    response.on('close', () => {
      this.removeClient(clientId);
    });

    response.on('error', () => {
      this.removeClient(clientId);
    });

    console.log(`SSE 클라이언트 연결: ${clientId}${taskId ? ` (작업: ${taskId})` : ''}`);
  }

  /**
   * 클라이언트 연결 제거
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.isActive = false;

    // 작업별 매핑에서 제거
    if (client.taskId) {
      const taskClients = this.taskClients.get(client.taskId);
      if (taskClients) {
        taskClients.delete(clientId);
        if (taskClients.size === 0) {
          this.taskClients.delete(client.taskId);
        }
      }
    }

    // 응답 스트림 종료
    try {
      if (!client.response.destroyed) {
        client.response.end();
      }
    } catch (error) {
      // 이미 종료된 경우 무시
    }

    this.clients.delete(clientId);
    console.log(`SSE 클라이언트 연결 해제: ${clientId}`);
  }

  /**
   * 특정 클라이언트에게 메시지 전송
   */
  sendToClient(clientId: string, message: SSEMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || !client.isActive || client.response.destroyed) {
      return false;
    }

    try {
      const sseData = this.formatSSEMessage(message);
      client.response.write(sseData);
      client.lastPing = new Date();
      return true;
    } catch (error) {
      console.error(`SSE 전송 오류 (클라이언트 ${clientId}):`, error);
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * 특정 작업의 모든 클라이언트에게 메시지 전송
   */
  sendToTaskClients(taskId: string, message: SSEMessage): number {
    const clientIds = this.taskClients.get(taskId);
    if (!clientIds || clientIds.size === 0) {
      return 0;
    }

    let successCount = 0;
    for (const clientId of clientIds) {
      if (this.sendToClient(clientId, message)) {
        successCount++;
      }
    }

    return successCount;
  }

  /**
   * 모든 클라이언트에게 메시지 전송
   */
  broadcast(message: SSEMessage): number {
    let successCount = 0;
    for (const clientId of this.clients.keys()) {
      if (this.sendToClient(clientId, message)) {
        successCount++;
      }
    }
    return successCount;
  }

  /**
   * SSE 메시지 포맷
   */
  private formatSSEMessage(message: SSEMessage): string {
    const data = JSON.stringify({
      type: message.type,
      data: message.data,
      timestamp: message.timestamp.toISOString()
    });

    return `data: ${data}\n\n`;
  }

  /**
   * 모든 클라이언트에게 ping 전송
   */
  private sendPingToAllClients(): void {
    const pingMessage: SSEMessage = {
      type: 'ping',
      data: { timestamp: new Date() },
      timestamp: new Date()
    };

    this.broadcast(pingMessage);
  }

  /**
   * 비활성 클라이언트 정리
   */
  private cleanupInactiveClients(): void {
    const now = new Date();
    const timeout = 5 * 60 * 1000; // 5분

    for (const [clientId, client] of this.clients.entries()) {
      const timeSinceLastPing = now.getTime() - client.lastPing.getTime();
      
      if (timeSinceLastPing > timeout || client.response.destroyed) {
        console.log(`비활성 SSE 클라이언트 정리: ${clientId}`);
        this.removeClient(clientId);
      }
    }
  }

  /**
   * ProgressTracker 이벤트 연결
   */
  private setupProgressTrackerEvents(): void {
    globalProgressTracker.on('progressUpdate', (progress: ProgressInfo) => {
      const message: SSEMessage = {
        type: 'progress',
        data: progress,
        timestamp: new Date()
      };

      this.sendToTaskClients(progress.taskId, message);
    });

    globalProgressTracker.on('taskCompleted', (progress: ProgressInfo) => {
      const message: SSEMessage = {
        type: 'complete',
        data: progress,
        timestamp: new Date()
      };

      this.sendToTaskClients(progress.taskId, message);
    });

    globalProgressTracker.on('taskFailed', ({ task, error }) => {
      const message: SSEMessage = {
        type: 'error',
        data: { task, error },
        timestamp: new Date()
      };

      this.sendToTaskClients(task.taskId, message);
    });
  }

  /**
   * 통계 정보 조회
   */
  getStats(): {
    totalClients: number;
    activeClients: number;
    taskConnections: number;
    uptime: number;
  } {
    const activeClients = Array.from(this.clients.values())
      .filter(client => client.isActive).length;

    return {
      totalClients: this.clients.size,
      activeClients,
      taskConnections: this.taskClients.size,
      uptime: process.uptime()
    };
  }

  /**
   * 특정 작업의 클라이언트 수 조회
   */
  getTaskClientCount(taskId: string): number {
    const clientIds = this.taskClients.get(taskId);
    return clientIds ? clientIds.size : 0;
  }

  /**
   * 정리
   */
  destroy(): void {
    // 모든 클라이언트 연결 해제
    for (const clientId of this.clients.keys()) {
      this.removeClient(clientId);
    }

    // 타이머 정리
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// 전역 SSE 스트림 관리자 인스턴스
export const globalSSEManager = new SSEStreamManager();
