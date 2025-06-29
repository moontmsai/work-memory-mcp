/**
 * AutoSwitchEngine - 실시간 세션 자동 전환 엔진
 * 경로 변경을 감지하고 조건을 평가하여 자동으로 세션을 전환
 */

import { EventEmitter } from 'events';
import { 
  SessionSwitchManager, 
  SwitchContext, 
  SwitchEvaluation 
} from './SessionSwitchManager.js';
import { 
  SessionSwitchPolicy,
  WorkSession,
  SwitchDecision 
} from '../types/session.js';
import { DatabaseConnection } from '../database/connection.js';
import { logger } from '../utils/logger.js';

export interface AutoSwitchEngineConfig {
  enabled: boolean;
  monitor_interval_ms: number;
  debounce_delay_ms: number;
  auto_switch_threshold: number;
  user_policy: SessionSwitchPolicy;
  allowed_paths: string[];
  excluded_paths: string[];
  max_switches_per_hour: number;
  require_confirmation: boolean;
}

export interface PathChangeEvent {
  old_path: string | null;
  new_path: string;
  timestamp: string;
  detected_project?: string;
  auto_detected: boolean;
}

export interface SwitchEvent extends PathChangeEvent {
  evaluation: SwitchEvaluation;
  action_taken: SwitchDecision;
  target_session?: WorkSession;
  success: boolean;
  error?: string;
}

export interface UserPromptEvent {
  context: SwitchContext;
  evaluation: SwitchEvaluation;
  timeout_ms: number;
  callback: (approved: boolean) => void;
}

export class AutoSwitchEngine extends EventEmitter {
  private config: AutoSwitchEngineConfig;
  private switchManager: SessionSwitchManager;
  private isRunning: boolean = false;
  private currentPath: string | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private monitorTimer: NodeJS.Timeout | null = null;
  private switchHistory: SwitchEvent[] = [];
  private pendingPrompts: Map<string, UserPromptEvent> = new Map();

  constructor(
    connection: DatabaseConnection,
    config?: Partial<AutoSwitchEngineConfig>
  ) {
    super();
    
    this.config = {
      enabled: true,
      monitor_interval_ms: 2000,
      debounce_delay_ms: 1000,
      auto_switch_threshold: 0.8,
      user_policy: SessionSwitchPolicy.AUTO,
      allowed_paths: [],
      excluded_paths: ['/tmp', '/temp', 'node_modules'],
      max_switches_per_hour: 10,
      require_confirmation: false,
      ...config
    };

    this.switchManager = new SessionSwitchManager(connection);
    
    this.setupEventHandlers();
  }

  /**
   * 엔진 시작
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!this.config.enabled) {
      this.emit('warning', 'Auto switch engine is disabled');
      return;
    }

    this.isRunning = true;
    this.emit('started', { timestamp: new Date().toISOString() });

    // 현재 경로 초기화
    this.currentPath = await this.getCurrentWorkingPath();
    
    // 모니터링 시작
    this.startPathMonitoring();
    
    this.emit('info', `Auto switch engine started, monitoring every ${this.config.monitor_interval_ms}ms`);
  }

  /**
   * 엔진 중지
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    // 타이머 정리
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // 대기 중인 프롬프트 정리
    this.pendingPrompts.clear();

    this.emit('stopped', { timestamp: new Date().toISOString() });
    this.emit('info', 'Auto switch engine stopped');
  }

  /**
   * 경로 모니터링 시작
   */
  private startPathMonitoring(): void {
    this.monitorTimer = setInterval(async () => {
      try {
        await this.checkPathChange();
      } catch (error) {
        this.emit('error', `Path monitoring error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, this.config.monitor_interval_ms);
  }

  /**
   * 경로 변경 확인
   */
  private async checkPathChange(): Promise<void> {
    const newPath = await this.getCurrentWorkingPath();
    
    if (newPath !== this.currentPath) {
      const pathChangeEvent: PathChangeEvent = {
        old_path: this.currentPath,
        new_path: newPath,
        timestamp: new Date().toISOString(),
        auto_detected: true
      };

      this.emit('path_changed', pathChangeEvent);
      
      // 디바운스 적용
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      
      this.debounceTimer = setTimeout(async () => {
        await this.handlePathChange(pathChangeEvent);
      }, this.config.debounce_delay_ms);
      
      this.currentPath = newPath;
    }
  }

  /**
   * 경로 변경 처리
   */
  private async handlePathChange(pathEvent: PathChangeEvent): Promise<void> {
    try {
      // 경로 검증
      if (!this.isPathAllowed(pathEvent.new_path)) {
        this.emit('info', `Path excluded from monitoring: ${pathEvent.new_path}`);
        return;
      }

      // 시간당 전환 제한 확인
      if (!this.canSwitchBasedOnRateLimit()) {
        this.emit('warning', `Switch rate limit exceeded (${this.config.max_switches_per_hour}/hour)`);
        return;
      }

      // 프로젝트 컨텍스트 생성
      const context = await this.createSwitchContext(pathEvent.new_path);
      
      if (!context) {
        this.emit('info', `No project detected at path: ${pathEvent.new_path}`);
        return;
      }

      // 전환 조건 평가
      const evaluation = await this.switchManager.testSwitchConditions(context);
      
      // 사용자 정책에 따른 처리
      await this.processSwitchDecision(pathEvent, context, evaluation);

    } catch (error) {
      this.emit('error', `Failed to handle path change: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 전환 결정 처리
   */
  private async processSwitchDecision(
    pathEvent: PathChangeEvent,
    context: SwitchContext,
    evaluation: SwitchEvaluation
  ): Promise<void> {
    const shouldAutoSwitch = this.shouldAutoSwitch(evaluation);

    switch (this.config.user_policy) {
      case SessionSwitchPolicy.AUTO:
        if (shouldAutoSwitch) {
          await this.executeAutoSwitch(pathEvent, context, evaluation);
        } else {
          this.emit('info', `Auto switch skipped - confidence too low: ${evaluation.confidence}`);
        }
        break;

      case SessionSwitchPolicy.PROMPT:
        if (shouldAutoSwitch || this.config.require_confirmation) {
          await this.promptUserForSwitch(pathEvent, context, evaluation);
        }
        break;

      case SessionSwitchPolicy.MANUAL:
        this.emit('switch_suggestion', {
          context,
          evaluation,
          message: `Detected project change to ${context.project_name}. Manual switch required.`
        });
        break;

      case SessionSwitchPolicy.DISABLED:
        // 아무것도 하지 않음
        break;
    }
  }

  /**
   * 자동 전환 실행
   */
  private async executeAutoSwitch(
    pathEvent: PathChangeEvent,
    context: SwitchContext,
    evaluation: SwitchEvaluation
  ): Promise<void> {
    try {
      const result = await this.switchManager.switchSession(context);
      
      const switchEvent: SwitchEvent = {
        ...pathEvent,
        evaluation,
        action_taken: result.decision,
        target_session: result.target_session,
        success: result.success,
        error: result.errors?.join(', ')
      };

      this.addToSwitchHistory(switchEvent);

      if (result.success) {
        this.emit('switch_completed', switchEvent);
        this.emit('info', `Auto switched to ${context.project_name} (${result.decision})`);
      } else {
        this.emit('switch_failed', switchEvent);
        this.emit('error', `Auto switch failed: ${result.errors?.join(', ')}`);
      }

    } catch (error) {
      const switchEvent: SwitchEvent = {
        ...pathEvent,
        evaluation,
        action_taken: SwitchDecision.NO_ACTION,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };

      this.addToSwitchHistory(switchEvent);
      this.emit('switch_failed', switchEvent);
      this.emit('error', `Auto switch execution failed: ${switchEvent.error}`);
    }
  }

  /**
   * 사용자 전환 확인 프롬프트
   */
  private async promptUserForSwitch(
    pathEvent: PathChangeEvent,
    context: SwitchContext,
    evaluation: SwitchEvaluation
  ): Promise<void> {
    const promptId = `prompt_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const timeoutMs = 30000; // 30초 타임아웃

    const promptEvent: UserPromptEvent = {
      context,
      evaluation,
      timeout_ms: timeoutMs,
      callback: async (approved: boolean) => {
        this.pendingPrompts.delete(promptId);
        
        if (approved) {
          await this.executeAutoSwitch(pathEvent, context, evaluation);
        } else {
          this.emit('switch_cancelled', {
            context,
            evaluation,
            reason: 'User declined'
          });
        }
      }
    };

    this.pendingPrompts.set(promptId, promptEvent);
    this.emit('user_prompt_required', { promptId, ...promptEvent });

    // 타임아웃 설정
    setTimeout(() => {
      if (this.pendingPrompts.has(promptId)) {
        this.pendingPrompts.delete(promptId);
        this.emit('switch_cancelled', {
          context,
          evaluation,
          reason: 'Prompt timeout'
        });
      }
    }, timeoutMs);
  }

  /**
   * 사용자 프롬프트 응답 처리
   */
  async respondToPrompt(promptId: string, approved: boolean): Promise<boolean> {
    const prompt = this.pendingPrompts.get(promptId);
    
    if (!prompt) {
      return false;
    }

    prompt.callback(approved);
    return true;
  }

  /**
   * 경로가 허용되는지 확인
   */
  private isPathAllowed(path: string): boolean {
    // 제외 경로 확인
    for (const excludedPath of this.config.excluded_paths) {
      if (path.includes(excludedPath)) {
        return false;
      }
    }

    // 허용 경로가 설정된 경우 확인
    if (this.config.allowed_paths.length > 0) {
      return this.config.allowed_paths.some(allowedPath => 
        path.startsWith(allowedPath)
      );
    }

    return true;
  }

  /**
   * 시간당 전환 제한 확인
   */
  private canSwitchBasedOnRateLimit(): boolean {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentSwitches = this.switchHistory.filter(
      event => event.timestamp > oneHourAgo && event.success
    );
    
    return recentSwitches.length < this.config.max_switches_per_hour;
  }

  /**
   * 자동 전환 여부 결정
   */
  private shouldAutoSwitch(evaluation: SwitchEvaluation): boolean {
    return evaluation.confidence >= this.config.auto_switch_threshold &&
           evaluation.decision !== SwitchDecision.NO_ACTION;
  }

  /**
   * 스위치 컨텍스트 생성
   */
  private async createSwitchContext(path: string): Promise<SwitchContext | null> {
    try {
      // 프로젝트 패턴 감지 (간단한 구현)
      const projectName = this.extractProjectName(path);
      
      if (!projectName) {
        return null;
      }

      // Git 저장소 확인 (간단한 구현)
      const gitRepository = await this.detectGitRepository(path);

      return {
        project_path: path,
        project_name: projectName,
        git_repository: gitRepository,
        metadata: {
          detected_at: new Date().toISOString(),
          auto_detected: true
        }
      };

    } catch (error) {
      this.emit('error', `Failed to create switch context: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * 프로젝트명 추출
   */
  private extractProjectName(path: string): string | null {
    // 간단한 프로젝트명 추출 로직
    const parts = path.replace(/\\/g, '/').split('/');
    const projectName = parts[parts.length - 1] || parts[parts.length - 2];
    
    // 유효한 프로젝트명인지 확인
    if (!projectName || projectName.length < 2 || projectName.startsWith('.')) {
      return null;
    }

    return projectName;
  }

  /**
   * Git 저장소 감지
   */
  private async detectGitRepository(path: string): Promise<string | undefined> {
    try {
      // 실제 구현에서는 .git 폴더 확인 및 remote URL 추출
      // 여기서는 간단한 구현만 제공
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 현재 작업 경로 얻기
   */
  private async getCurrentWorkingPath(): Promise<string> {
    // 실제 구현에서는 IDE/에디터 API나 시스템 API 사용
    // 테스트용으로는 process.cwd() 사용
    return process.cwd();
  }

  /**
   * 전환 히스토리에 추가
   */
  private addToSwitchHistory(event: SwitchEvent): void {
    this.switchHistory.push(event);
    
    // 최대 100개 이벤트만 유지
    if (this.switchHistory.length > 100) {
      this.switchHistory.shift();
    }
  }

  /**
   * 이벤트 핸들러 설정
   */
  private setupEventHandlers(): void {
    this.on('error', (error) => {
      logger.error('auto-switch-engine', 'Engine error', { error: typeof error === 'string' ? error : error instanceof Error ? error.message : String(error) });
    });

    this.on('info', (message) => {
      logger.info('auto-switch-engine', 'Engine info', { message: typeof message === 'string' ? message : String(message) });
    });

    this.on('warning', (message) => {
      logger.warn('auto-switch-engine', 'Engine warning', { message: typeof message === 'string' ? message : String(message) });
    });
  }

  /**
   * 엔진 상태 조회
   */
  getStatus(): {
    running: boolean;
    current_path: string | null;
    config: AutoSwitchEngineConfig;
    pending_prompts: number;
    recent_switches: SwitchEvent[];
    statistics: {
      total_switches: number;
      successful_switches: number;
      failed_switches: number;
      switches_last_hour: number;
    };
  } {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentSwitches = this.switchHistory.filter(
      event => event.timestamp > oneHourAgo
    );

    return {
      running: this.isRunning,
      current_path: this.currentPath,
      config: { ...this.config },
      pending_prompts: this.pendingPrompts.size,
      recent_switches: this.switchHistory.slice(-10),
      statistics: {
        total_switches: this.switchHistory.length,
        successful_switches: this.switchHistory.filter(e => e.success).length,
        failed_switches: this.switchHistory.filter(e => !e.success).length,
        switches_last_hour: recentSwitches.length
      }
    };
  }

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig: Partial<AutoSwitchEngineConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config_updated', this.config);
    
    // 엔진이 실행 중이고 비활성화된 경우 중지
    if (this.isRunning && !this.config.enabled) {
      this.stop();
    }
  }

  /**
   * 수동 경로 변경 트리거
   */
  async triggerPathChange(newPath: string): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Engine is not running');
    }

    const pathChangeEvent: PathChangeEvent = {
      old_path: this.currentPath,
      new_path: newPath,
      timestamp: new Date().toISOString(),
      auto_detected: false
    };

    this.currentPath = newPath;
    this.emit('path_changed', pathChangeEvent);
    
    await this.handlePathChange(pathChangeEvent);
  }

  /**
   * 스위치 히스토리 조회
   */
  getSwitchHistory(limit: number = 50): SwitchEvent[] {
    return this.switchHistory.slice(-limit);
  }

  /**
   * 스위치 히스토리 초기화
   */
  clearSwitchHistory(): void {
    this.switchHistory = [];
    this.emit('history_cleared', { timestamp: new Date().toISOString() });
  }

  /**
   * 강제 전환 (정책 무시)
   */
  async forceSwitch(context: SwitchContext): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Engine is not running');
    }

    context.force_create = true;
    const result = await this.switchManager.switchSession(context);
    
    const switchEvent: SwitchEvent = {
      old_path: this.currentPath,
      new_path: context.project_path,
      timestamp: new Date().toISOString(),
      auto_detected: false,
      evaluation: {
        decision: result.decision,
        create_new: true,
        pause_sessions: [],
        complete_sessions: [],
        confidence: 1.0,
        reasons: ['Force switch requested']
      },
      action_taken: result.decision,
      target_session: result.target_session,
      success: result.success,
      error: result.errors?.join(', ')
    };

    this.addToSwitchHistory(switchEvent);

    if (result.success) {
      this.emit('switch_completed', switchEvent);
    } else {
      this.emit('switch_failed', switchEvent);
    }
  }
}

// 기본 엔진 생성 헬퍼
export function createAutoSwitchEngine(
  connection: DatabaseConnection,
  config?: Partial<AutoSwitchEngineConfig>
): AutoSwitchEngine {
  return new AutoSwitchEngine(connection, config);
}
