/**
 * BackgroundTaskManager - 백그라운드 작업 관리
 * 대용량 작업을 백그라운드에서 실행하고 진행상황을 추적
 */

import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { globalProgressTracker, ProgressInfo } from './ProgressTracker';
import { v4 as uuidv4 } from 'uuid';

// 백그라운드 작업 타입
export type TaskType = 
  | 'search_work_memory'
  | 'list_work_memories' 
  | 'batch_operations'
  | 'optimize_search_index'
  | 'backup_database'
  | 'export_data';

// 작업 상태
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// 백그라운드 작업 정의
export interface BackgroundTask {
  id: string;
  type: TaskType;
  name: string;
  params: any;
  status: TaskStatus;
  priority: number; // 1-10 (높을수록 우선순위 높음)
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  estimatedDuration?: number; // 예상 소요 시간 (초)
  workerId?: number;
}

// 작업 옵션
export interface TaskOptions {
  priority?: number;
  estimatedDuration?: number;
  enableProgress?: boolean;
  progressUpdateInterval?: number;
}

// 워커 정보
interface WorkerInfo {
  id: number;
  worker: Worker;
  currentTask?: string;
  isAvailable: boolean;
  createdAt: Date;
}

/**
 * 백그라운드 작업 관리자
 */
export class BackgroundTaskManager extends EventEmitter {
  private tasks: Map<string, BackgroundTask> = new Map();
  private taskQueue: string[] = []; // 대기 중인 작업들 (우선순위 순)
  private workers: Map<number, WorkerInfo> = new Map();
  private maxWorkers: number = 3;
  private nextWorkerId: number = 1;

  constructor(maxWorkers: number = 3) {
    super();
    this.maxWorkers = maxWorkers;
    this.initializeWorkerPool();
  }

  /**
   * 새 작업 추가
   */
  addTask(
    type: TaskType,
    name: string,
    params: any,
    options: TaskOptions = {}
  ): string {
    const taskId = uuidv4();
    
    const task: BackgroundTask = {
      id: taskId,
      type,
      name,
      params,
      status: 'pending',
      priority: options.priority || 5,
      createdAt: new Date(),
      estimatedDuration: options.estimatedDuration
    };

    this.tasks.set(taskId, task);
    this.addToQueue(taskId);

    // 진행률 추적 시작 (옵션이 활성화된 경우)
    if (options.enableProgress !== false) {
      globalProgressTracker.startTask({
        taskId,
        updateInterval: options.progressUpdateInterval
      });
    }

    this.emit('taskAdded', task);
    this.processQueue();

    return taskId;
  }

  /**
   * 작업 취소
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'running') {
      // 실행 중인 작업은 워커에게 취소 신호 전송
      const worker = this.getWorkerByTaskId(taskId);
      if (worker) {
        worker.worker.postMessage({ type: 'cancel', taskId });
      }
    } else if (task.status === 'pending') {
      // 대기 중인 작업은 큐에서 제거
      const queueIndex = this.taskQueue.indexOf(taskId);
      if (queueIndex > -1) {
        this.taskQueue.splice(queueIndex, 1);
      }
    }

    task.status = 'cancelled';
    task.completedAt = new Date();

    globalProgressTracker.failTask(taskId, '작업이 취소되었습니다');
    this.emit('taskCancelled', task);

    return true;
  }

  /**
   * 작업 정보 조회
   */
  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 모든 작업 조회
   */
  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 활성 작업 조회
   */
  getActiveTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === 'running' || task.status === 'pending');
  }

  /**
   * 대기열 상태 조회
   */
  getQueueStatus(): {
    pending: number;
    running: number;
    availableWorkers: number;
    totalWorkers: number;
  } {
    const pendingTasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'pending').length;
    const runningTasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'running').length;
    const availableWorkers = Array.from(this.workers.values())
      .filter(worker => worker.isAvailable).length;

    return {
      pending: pendingTasks,
      running: runningTasks,
      availableWorkers,
      totalWorkers: this.workers.size
    };
  }

  /**
   * 워커 풀 초기화
   */
  private initializeWorkerPool(): void {
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker();
    }
  }

  /**
   * 새 워커 생성
   */
  private createWorker(): void {
    const workerId = this.nextWorkerId++;
    
    // 워커 스크립트 경로 (실제 구현 시 적절한 경로로 수정)
    const worker = new Worker(__dirname + '/background-worker.js');
    
    const workerInfo: WorkerInfo = {
      id: workerId,
      worker,
      isAvailable: true,
      createdAt: new Date()
    };

    // 워커 메시지 처리
    worker.on('message', (message) => {
      this.handleWorkerMessage(workerId, message);
    });

    worker.on('error', (error) => {
      console.error(`워커 ${workerId} 오류:`, error);
      this.handleWorkerError(workerId, error);
    });

    worker.on('exit', (code) => {
      console.log(`워커 ${workerId} 종료 (코드: ${code})`);
      this.handleWorkerExit(workerId);
    });

    this.workers.set(workerId, workerInfo);
    console.log(`백그라운드 워커 ${workerId} 생성됨`);
  }

  /**
   * 작업을 우선순위 큐에 추가
   */
  private addToQueue(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // 우선순위에 따라 삽입 위치 결정
    let insertIndex = this.taskQueue.length;
    for (let i = 0; i < this.taskQueue.length; i++) {
      const queuedTask = this.tasks.get(this.taskQueue[i]);
      if (queuedTask && task.priority > queuedTask.priority) {
        insertIndex = i;
        break;
      }
    }

    this.taskQueue.splice(insertIndex, 0, taskId);
  }

  /**
   * 대기열 처리
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0) {
      const availableWorker = this.getAvailableWorker();
      if (!availableWorker) break;

      const taskId = this.taskQueue.shift()!;
      const task = this.tasks.get(taskId);
      if (!task || task.status !== 'pending') continue;

      this.assignTaskToWorker(taskId, availableWorker.id);
    }
  }

  /**
   * 사용 가능한 워커 조회
   */
  private getAvailableWorker(): WorkerInfo | undefined {
    return Array.from(this.workers.values())
      .find(worker => worker.isAvailable);
  }

  /**
   * 특정 작업을 실행 중인 워커 조회
   */
  private getWorkerByTaskId(taskId: string): WorkerInfo | undefined {
    return Array.from(this.workers.values())
      .find(worker => worker.currentTask === taskId);
  }

  /**
   * 작업을 워커에 할당
   */
  private assignTaskToWorker(taskId: string, workerId: number): void {
    const worker = this.workers.get(workerId);
    const task = this.tasks.get(taskId);
    
    if (!worker || !task) return;

    worker.isAvailable = false;
    worker.currentTask = taskId;
    
    task.status = 'running';
    task.startedAt = new Date();
    task.workerId = workerId;

    // 워커에게 작업 전송
    worker.worker.postMessage({
      type: 'execute',
      taskId,
      taskType: task.type,
      taskName: task.name,
      params: task.params
    });

    this.emit('taskStarted', task);
    console.log(`작업 ${taskId} → 워커 ${workerId} 할당`);
  }

  /**
   * 워커 메시지 처리
   */
  private handleWorkerMessage(workerId: number, message: any): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    switch (message.type) {
      case 'progress':
        this.handleProgressUpdate(message);
        break;
      case 'completed':
        this.handleTaskCompleted(workerId, message);
        break;
      case 'failed':
        this.handleTaskFailed(workerId, message);
        break;
      case 'ready':
        console.log(`워커 ${workerId} 준비됨`);
        break;
    }
  }

  /**
   * 진행률 업데이트 처리
   */
  private handleProgressUpdate(message: any): void {
    const { taskId, progress, stage, details, itemsProcessed } = message;
    
    globalProgressTracker.updateProgress(
      taskId,
      progress,
      stage,
      details,
      itemsProcessed
    );
  }

  /**
   * 작업 완료 처리
   */
  private handleTaskCompleted(workerId: number, message: any): void {
    const { taskId, result } = message;
    const worker = this.workers.get(workerId);
    const task = this.tasks.get(taskId);

    if (!worker || !task) return;

    task.status = 'completed';
    task.completedAt = new Date();
    task.result = result;

    worker.isAvailable = true;
    worker.currentTask = undefined;

    globalProgressTracker.completeTask(taskId, '작업 완료');
    this.emit('taskCompleted', task);

    console.log(`작업 ${taskId} 완료 (워커 ${workerId})`);
    
    // 다음 작업 처리
    this.processQueue();
  }

  /**
   * 작업 실패 처리
   */
  private handleTaskFailed(workerId: number, message: any): void {
    const { taskId, error } = message;
    const worker = this.workers.get(workerId);
    const task = this.tasks.get(taskId);

    if (!worker || !task) return;

    task.status = 'failed';
    task.completedAt = new Date();
    task.error = error;

    worker.isAvailable = true;
    worker.currentTask = undefined;

    globalProgressTracker.failTask(taskId, error);
    this.emit('taskFailed', task);

    console.error(`작업 ${taskId} 실패 (워커 ${workerId}):`, error);
    
    // 다음 작업 처리
    this.processQueue();
  }

  /**
   * 워커 오류 처리
   */
  private handleWorkerError(workerId: number, error: Error): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // 현재 작업이 있으면 실패로 처리
    if (worker.currentTask) {
      this.handleTaskFailed(workerId, {
        taskId: worker.currentTask,
        error: error.message
      });
    }

    // 워커 재생성
    this.workers.delete(workerId);
    this.createWorker();
  }

  /**
   * 워커 종료 처리
   */
  private handleWorkerExit(workerId: number): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // 현재 작업이 있으면 실패로 처리
    if (worker.currentTask) {
      this.handleTaskFailed(workerId, {
        taskId: worker.currentTask,
        error: '워커가 예상치 못하게 종료됨'
      });
    }

    this.workers.delete(workerId);
    
    // 필요하면 새 워커 생성
    if (this.workers.size < this.maxWorkers) {
      this.createWorker();
    }
  }

  /**
   * 정리
   */
  destroy(): void {
    // 모든 워커 종료
    for (const worker of this.workers.values()) {
      worker.worker.terminate();
    }
    this.workers.clear();
    this.taskQueue.length = 0;
  }
}

// 전역 백그라운드 작업 관리자 인스턴스
export const globalTaskManager = new BackgroundTaskManager();
