/**
 * ProgressTracker - 작업 진행률 실시간 추적 시스템
 * SSE를 통한 실시간 모니터링 지원
 */

import { EventEmitter } from 'events';

// SSE 기능이 제거되었습니다 - 진행률 추적은 EventEmitter를 통해서만 제공됩니다

// 진행률 정보 인터페이스
export interface ProgressInfo {
  taskId: string;
  progress: number;        // 0-100 진행률
  stage: string;          // 현재 단계 설명
  details?: string;       // 세부 정보
  itemsProcessed?: number; // 처리된 항목 수
  totalItems?: number;    // 전체 항목 수
  estimatedTimeLeft?: number; // 예상 남은 시간 (초)
  startTime: Date;
  lastUpdate: Date;
}

// 진행률 업데이트 옵션
export interface ProgressOptions {
  taskId: string;
  totalItems?: number;
  updateInterval?: number; // 업데이트 간격 (ms)
  minProgressDelta?: number; // 최소 진행률 변화 (%)
  enableTimeEstimation?: boolean;
}

// 진행률 콜백 함수 타입
export type ProgressCallback = (progress: ProgressInfo) => void;

/**
 * 진행률 추적 관리자
 */
export class ProgressTracker extends EventEmitter {
  private tasks: Map<string, ProgressInfo> = new Map();
  private callbacks: Map<string, ProgressCallback[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly MAX_TASKS = 100; // 최대 동시 작업 수
  private readonly CLEANUP_INTERVAL = 3600000; // 1시간마다 정리
  
  constructor() {
    super();
    // 주기적 정리 스케줄러 시작
    this.startPeriodicCleanup();
  }

  // SSE 연동 기능이 제거되었습니다

  /**
   * 새 작업 시작
   */
  startTask(options: ProgressOptions): void {
    // 작업 수 제한 확인
    if (this.tasks.size >= this.MAX_TASKS) {
      this.cleanupOldestTasks(10); // 오래된 작업 10개 정리
    }

    const taskInfo: ProgressInfo = {
      taskId: options.taskId,
      progress: 0,
      stage: '작업 시작',
      startTime: new Date(),
      lastUpdate: new Date(),
      totalItems: options.totalItems
    };

    this.tasks.set(options.taskId, taskInfo);
    this.emit('taskStarted', taskInfo);
    
    // 초기 진행률 전송
    this.notifyProgress(options.taskId);
  }

  /**
   * 진행률 업데이트
   */
  updateProgress(
    taskId: string, 
    progress: number, 
    stage?: string, 
    details?: string,
    itemsProcessed?: number
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`Task ${taskId} not found`);
      return;
    }

    const previousProgress = task.progress;
    const now = new Date();

    // 진행률 업데이트
    task.progress = Math.min(100, Math.max(0, progress));
    task.lastUpdate = now;
    
    if (stage) task.stage = stage;
    if (details) task.details = details;
    if (itemsProcessed !== undefined) task.itemsProcessed = itemsProcessed;

    // 예상 남은 시간 계산
    if (task.progress > 0 && task.progress < 100) {
      const elapsedTime = (now.getTime() - task.startTime.getTime()) / 1000;
      const progressRate = task.progress / elapsedTime;
      task.estimatedTimeLeft = Math.round((100 - task.progress) / progressRate);
    }

    // 의미있는 변화만 알림 (최적화)
    const progressDelta = Math.abs(task.progress - previousProgress);
    if (progressDelta >= 5 || task.progress === 0 || task.progress === 100) {
      this.notifyProgress(taskId);
    }
  }

  /**
   * 작업 완료
   */
  completeTask(taskId: string, finalMessage?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.progress = 100;
    task.stage = finalMessage || '작업 완료';
    task.lastUpdate = new Date();

    this.notifyProgress(taskId);
    this.emit('taskCompleted', task);

    // 진행률 완료는 EventEmitter 이벤트로만 제공됩니다

    // 정리
    this.cleanupTask(taskId);
  }

  /**
   * 작업 실패
   */
  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.stage = `오류 발생: ${error}`;
    task.lastUpdate = new Date();

    this.notifyProgress(taskId);
    this.emit('taskFailed', { task, error });

    // 진행률 오류는 EventEmitter 이벤트로만 제공됩니다

    // 정리
    this.cleanupTask(taskId);
  }

  /**
   * 진행률 콜백 등록
   */
  onProgress(taskId: string, callback: ProgressCallback): void {
    if (!this.callbacks.has(taskId)) {
      this.callbacks.set(taskId, []);
    }
    this.callbacks.get(taskId)!.push(callback);
  }

  /**
   * 진행률 콜백 제거
   */
  offProgress(taskId: string, callback: ProgressCallback): void {
    const callbacks = this.callbacks.get(taskId);
    if (!callbacks) return;

    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  /**
   * 작업 정보 조회
   */
  getTask(taskId: string): ProgressInfo | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 모든 활성 작업 조회
   */
  getAllTasks(): ProgressInfo[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 진행률 알림 전송
   */
  private notifyProgress(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const callbacks = this.callbacks.get(taskId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(task);
        } catch (error) {
          console.error('Progress callback error:', error);
        }
      });
    }

    // 진행률은 EventEmitter 이벤트로만 제공됩니다

    // 이벤트 발생
    this.emit('progressUpdate', task);
  }

  /**
   * 작업 정리
   */
  private cleanupTask(taskId: string): void {
    // 5초 후 정리 (클라이언트가 최종 상태를 받을 시간 제공)
    setTimeout(() => {
      this.tasks.delete(taskId);
      this.callbacks.delete(taskId);
      
      const timer = this.timers.get(taskId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(taskId);
      }
    }, 5000);
  }

  /**
   * 검색 진행률 업데이트 (검색 작업용)
   */
  updateSearchProgress(
    taskId: string,
    phase: 'scanning' | 'matching' | 'filtering' | 'sorting' | 'formatting',
    progress: number,
    foundItems?: number,
    scannedItems?: number
  ): void {
    const phaseNames = {
      scanning: '메모리 스캔',
      matching: '키워드 매칭',
      filtering: '필터링',
      sorting: '정렬',
      formatting: '결과 포맷팅'
    };

    let details = '';
    if (foundItems !== undefined) {
      details += `${foundItems}개 발견`;
    }
    if (scannedItems !== undefined) {
      details += details ? `, ${scannedItems}개 스캔` : `${scannedItems}개 스캔`;
    }

    this.updateProgress(
      taskId,
      progress,
      `${phaseNames[phase]} 중...`,
      details
    );
  }

  /**
   * 주기적 정리 스케줄러 시작
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      this.performPeriodicCleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * 주기적 정리 수행
   */
  private performPeriodicCleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - this.CLEANUP_INTERVAL;
    
    let cleanedCount = 0;
    
    for (const [taskId, task] of this.tasks.entries()) {
      // 1시간 이상 된 완료된 작업 정리
      if (task.lastUpdate.getTime() < oneHourAgo && task.progress === 100) {
        this.tasks.delete(taskId);
        this.callbacks.delete(taskId);
        
        const timer = this.timers.get(taskId);
        if (timer) {
          clearTimeout(timer);
          this.timers.delete(taskId);
        }
        
        cleanedCount++;
      }
    }
    
    // 메모리 사용량 경고
    if (this.tasks.size > this.MAX_TASKS * 0.8) {
      console.warn(`ProgressTracker: High memory usage - ${this.tasks.size} active tasks`);
    }
  }

  /**
   * 가장 오래된 작업들 정리
   */
  private cleanupOldestTasks(count: number): void {
    const taskEntries = Array.from(this.tasks.entries())
      .sort(([, a], [, b]) => a.lastUpdate.getTime() - b.lastUpdate.getTime());
    
    for (let i = 0; i < Math.min(count, taskEntries.length); i++) {
      const [taskId] = taskEntries[i];
      this.tasks.delete(taskId);
      this.callbacks.delete(taskId);
      
      const timer = this.timers.get(taskId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(taskId);
      }
    }
  }

  /**
   * 메모리 사용량 조회
   */
  getMemoryUsage(): {
    activeTasks: number;
    activeCallbacks: number;
    activeTimers: number;
    memoryEstimate: string;
  } {
    const taskSize = this.tasks.size * 500; // 작업당 약 500바이트 추정
    const callbackSize = Array.from(this.callbacks.values()).reduce((sum, arr) => sum + arr.length, 0) * 100;
    const timerSize = this.timers.size * 50;
    
    return {
      activeTasks: this.tasks.size,
      activeCallbacks: Array.from(this.callbacks.values()).reduce((sum, arr) => sum + arr.length, 0),
      activeTimers: this.timers.size,
      memoryEstimate: `${Math.round((taskSize + callbackSize + timerSize) / 1024)}KB`
    };
  }
}

// 전역 진행률 추적기 인스턴스
export const globalProgressTracker = new ProgressTracker();
