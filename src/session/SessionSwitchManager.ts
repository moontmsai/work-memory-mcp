/**
 * SessionSwitchManager - 세션 전환 관리 클래스
 * 감지된 프로젝트 패스를 기반으로 세션 생성/재활성화를 관리
 */

import { 
  WorkSession, 
  SessionStatus,
  CreateSessionOptions,
  SessionSwitchResult,
  SessionSwitchPolicy,
  SwitchDecision,
  SwitchRuleEngine
} from '../types/session.js';
import { DatabaseConnection } from '../database/connection.js';
import { SessionFactory } from './SessionFactory.js';
import { SessionStateManager } from './SessionStateManager.js';
import { SessionQueryManager, QueryResult } from './SessionQueryManager.js';
import { ProjectContextAnalyzer } from './ProjectContextAnalyzer.js';

export interface SwitchManagerConfig {
  max_active_sessions: number;
  auto_pause_previous: boolean;
  auto_complete_after_hours: number;
  prefer_recent_sessions: boolean;
  similarity_threshold: number;
  default_policy: SessionSwitchPolicy;
}

export interface SwitchContext {
  project_path: string;
  project_name: string;
  git_repository?: string;
  metadata?: Record<string, any>;
  user_preference?: SessionSwitchPolicy;
  force_create?: boolean;
}

export interface SwitchEvaluation {
  decision: SwitchDecision;
  target_session?: WorkSession;
  create_new: boolean;
  pause_sessions: WorkSession[];
  complete_sessions: WorkSession[];
  confidence: number;
  reasons: string[];
}

export class SessionSwitchManager {
  private connection: DatabaseConnection;
  private sessionFactory: SessionFactory;
  private stateManager: SessionStateManager;
  private queryManager: SessionQueryManager;
  private contextAnalyzer: ProjectContextAnalyzer;
  private config: SwitchManagerConfig;
  private ruleEngine: SwitchRuleEngine;

  constructor(
    connection: DatabaseConnection,
    config?: Partial<SwitchManagerConfig>,
    contextAnalyzer?: ProjectContextAnalyzer
  ) {
    this.connection = connection;
    this.sessionFactory = new SessionFactory();
    this.stateManager = new SessionStateManager();
    this.queryManager = new SessionQueryManager(connection);
    this.contextAnalyzer = contextAnalyzer || new ProjectContextAnalyzer();
    
    this.config = {
      max_active_sessions: 3,
      auto_pause_previous: true,
      auto_complete_after_hours: 24,
      prefer_recent_sessions: true,
      similarity_threshold: 0.8,
      default_policy: SessionSwitchPolicy.AUTO,
      ...config
    };

    this.ruleEngine = this.createRuleEngine();
  }

  /**
   * 메인 세션 전환 로직
   */
  async switchSession(context: SwitchContext): Promise<SessionSwitchResult> {
    try {
      // 1. 현재 상태 분석
      const currentState = await this.analyzeCurrentState();
      
      // 2. 프로젝트 컨텍스트 분석 (optional)
      let projectContext: any = {};
      try {
        if (this.contextAnalyzer && (this.contextAnalyzer as any).analyzeProjectContext) {
          projectContext = await this.contextAnalyzer.analyzeProjectContext(context.project_path);
        }
      } catch (error) {
        // 컨텍스트 분석이 실패해도 계속 진행
        projectContext = {};
      }
      
      // 3. 기존 세션 검색
      const existingSessions = await this.findRelatedSessions(context);
      
      // 4. 전환 결정 평가
      const evaluation = await this.evaluateSwitch(
        context, 
        currentState, 
        existingSessions,
        projectContext
      );
      
      // 5. 전환 실행
      const result = await this.executeSwitch(evaluation, context);
      
      return result;

    } catch (error) {
      return {
        success: false,
        switched: false,
        decision: SwitchDecision.NO_ACTION,
        errors: [`Switch failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * 현재 활성 세션 상태 분석
   */
  private async analyzeCurrentState(): Promise<{
    active_sessions: WorkSession[];
    paused_sessions: WorkSession[];
    recent_activity: WorkSession[];
    needs_cleanup: boolean;
  }> {
    const [activeSessions, pausedSessions] = await Promise.all([
      this.queryManager.findSessions({ 
        filter: { status: SessionStatus.ACTIVE },
        limit: 10 
      }),
      this.queryManager.findSessions({ 
        filter: { status: SessionStatus.PAUSED },
        limit: 10,
        order_by: 'last_activity_at',
        order_direction: 'DESC'
      })
    ]);

    // 최근 활동 세션 (24시간 이내)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentActivity = await this.queryManager.findSessions({
      filter: {
        date_range: {
          start: oneDayAgo,
          field: 'last_activity_at'
        }
      },
      limit: 5
    });

    return {
      active_sessions: activeSessions.data,
      paused_sessions: pausedSessions.data,
      recent_activity: recentActivity.data,
      needs_cleanup: activeSessions.data.length > this.config.max_active_sessions
    };
  }

  /**
   * 관련 세션 검색
   */
  private async findRelatedSessions(context: SwitchContext): Promise<WorkSession[]> {
    const searches: Promise<QueryResult<WorkSession>>[] = [];

    // 1. 프로젝트명으로 검색
    searches.push(
      this.queryManager.findSessions({
        filter: { project_name: context.project_name },
        order_by: 'last_activity_at',
        order_direction: 'DESC',
        limit: 5
      })
    );

    // 2. 프로젝트 경로로 검색 (정확히 일치하는 경우)
    if (context.project_path) {
      searches.push(
        this.queryManager.findSessions({
          filter: { project_path: context.project_path },
          order_by: 'last_activity_at',
          order_direction: 'DESC',
          limit: 5
        })
      );
    }

    // 3. Git 저장소로 검색
    if (context.git_repository) {
      searches.push(
        this.queryManager.findSessions({
          filter: { git_repository: context.git_repository },
          order_by: 'last_activity_at',
          order_direction: 'DESC',
          limit: 5
        })
      );
    }

    const results = await Promise.all(searches);
    
    // 중복 제거 및 병합
    const allSessions = results.flatMap(result => result.data);
    const uniqueSessions = this.deduplicateSessions(allSessions);
    
    // 관련성 점수로 정렬
    return this.rankSessionsByRelevance(uniqueSessions, context);
  }

  /**
   * 세션 전환 결정 평가
   */
  private async evaluateSwitch(
    context: SwitchContext,
    currentState: any,
    existingSessions: WorkSession[],
    projectContext: any
  ): Promise<SwitchEvaluation> {
    
    // 강제 생성 요청
    if (context.force_create) {
      return {
        decision: SwitchDecision.CREATE_NEW,
        create_new: true,
        pause_sessions: currentState.active_sessions,
        complete_sessions: [],
        confidence: 1.0,
        reasons: ['Force create new session requested']
      };
    }

    // 규칙 엔진 실행
    const ruleResult = this.ruleEngine.evaluate({
      context,
      current_state: currentState,
      existing_sessions: existingSessions,
      project_context: projectContext
    });

    return ruleResult;
  }

  /**
   * 전환 실행
   */
  private async executeSwitch(
    evaluation: SwitchEvaluation, 
    context: SwitchContext
  ): Promise<SessionSwitchResult> {
    const changes: string[] = [];
    let targetSession: WorkSession | null = null;

    try {
      // 1. 기존 세션 정리
      if (evaluation.pause_sessions.length > 0) {
        for (const session of evaluation.pause_sessions) {
          const pauseResult = this.stateManager.pauseSession(session, {
            reason: 'Auto-paused by session switch',
            updated_by: 'session_switch_manager'
          });
          
          if (pauseResult.success) {
            await this.updateSessionInDatabase(session);
            changes.push(`Paused session: ${session.session_id}`);
          }
        }
      }

      if (evaluation.complete_sessions.length > 0) {
        for (const session of evaluation.complete_sessions) {
          const completeResult = this.stateManager.completeSession(session, {
            reason: 'Auto-completed by session switch',
            updated_by: 'session_switch_manager'
          });
          
          if (completeResult.success) {
            await this.updateSessionInDatabase(session);
            changes.push(`Completed session: ${session.session_id}`);
          }
        }
      }

      // 2. 대상 세션 처리
      if (evaluation.decision === SwitchDecision.REACTIVATE_EXISTING && evaluation.target_session) {
        targetSession = evaluation.target_session;
        
        const activateResult = this.stateManager.activateSession(targetSession, {
          reason: 'Reactivated by session switch',
          updated_by: 'session_switch_manager'
        });
        
        if (activateResult.success) {
          await this.updateSessionInDatabase(targetSession);
          changes.push(`Reactivated session: ${targetSession.session_id}`);
        }

      } else if (evaluation.decision === SwitchDecision.CREATE_NEW && evaluation.create_new) {
        // 새 세션 생성
        const createOptions: CreateSessionOptions = {
          project_name: context.project_name,
          project_path: context.project_path,
          git_repository: context.git_repository,
          description: `Auto-created session for ${context.project_name}`,
          auto_created: true,
          created_by: 'session_switch_manager',
          tags: ['auto-switch']
        };

        const createResult = this.sessionFactory.createSession(createOptions);
        
        if (createResult.created && createResult.session) {
          targetSession = createResult.session;
          await this.insertSessionToDatabase(targetSession);
          changes.push(`Created new session: ${targetSession.session_id}`);
        } else {
          throw new Error(`Failed to create session: ${createResult.errors?.join(', ')}`);
        }
      }

      return {
        success: true,
        switched: changes.length > 0,
        decision: evaluation.decision,
        target_session: targetSession || undefined,
        changes,
        confidence: evaluation.confidence,
        reasons: evaluation.reasons
      };

    } catch (error) {
      return {
        success: false,
        switched: false,
        decision: evaluation.decision,
        errors: [`Switch execution failed: ${error instanceof Error ? error.message : String(error)}`],
        changes
      };
    }
  }

  /**
   * 규칙 엔진 생성
   */
  private createRuleEngine(): SwitchRuleEngine {
    return {
      evaluate: (input) => {
        const { context, current_state, existing_sessions } = input;
        
        // 기본 결정
        let decision = SwitchDecision.NO_ACTION;
        let targetSession: WorkSession | undefined;
        let confidence = 0.5;
        let reasons: string[] = [];
        let pauseSessions: WorkSession[] = [];
        let completeSessions: WorkSession[] = [];

        // Rule 1: 정확히 일치하는 활성 세션이 있는 경우
        const exactActiveMatch = current_state.active_sessions.find((s: WorkSession) => 
          s.project_path === context.project_path || 
          s.project_name === context.project_name
        );

        if (exactActiveMatch) {
          decision = SwitchDecision.NO_ACTION;
          confidence = 0.9;
          reasons.push('Already working on matching active session');
          return { decision, create_new: false, pause_sessions: [], complete_sessions: [], confidence, reasons };
        }

        // Rule 2: 최근 관련 세션이 있는 경우 재활성화
        const recentSession = existing_sessions.find(s => 
          this.calculateSessionSimilarity(s, context) >= this.config.similarity_threshold &&
          (s.status === SessionStatus.PAUSED || s.status === SessionStatus.COMPLETED)
        );

        if (recentSession && this.config.prefer_recent_sessions) {
          decision = SwitchDecision.REACTIVATE_EXISTING;
          targetSession = recentSession;
          confidence = 0.8;
          reasons.push(`Reactivating recent session with high similarity (${this.calculateSessionSimilarity(recentSession, context).toFixed(2)})`);
          
          if (this.config.auto_pause_previous) {
            pauseSessions = current_state.active_sessions;
          }
          
          return { 
            decision, 
            target_session: targetSession,
            create_new: false, 
            pause_sessions: pauseSessions, 
            complete_sessions: completeSessions, 
            confidence, 
            reasons 
          };
        }

        // Rule 3: 활성 세션이 너무 많은 경우 정리
        if (current_state.needs_cleanup) {
          // 오래된 세션들 완료 처리
          const oldSessions = current_state.active_sessions
            .filter((s: WorkSession) => {
              const hoursSinceActivity = (Date.now() - new Date(s.last_activity_at).getTime()) / (1000 * 60 * 60);
              return hoursSinceActivity > this.config.auto_complete_after_hours;
            });
          
          completeSessions = oldSessions;
        }

        // Rule 4: 새 세션 생성
        decision = SwitchDecision.CREATE_NEW;
        confidence = 0.9; // 새 프로젝트는 높은 신뢰도로 전환
        reasons.push('No suitable existing session found, creating new session');
        
        if (this.config.auto_pause_previous) {
          pauseSessions = current_state.active_sessions.filter((s: WorkSession) => !completeSessions.includes(s));
        }

        return { 
          decision, 
          create_new: true, 
          pause_sessions: pauseSessions, 
          complete_sessions: completeSessions, 
          confidence, 
          reasons 
        };
      }
    };
  }

  /**
   * 세션 유사도 계산
   */
  private calculateSessionSimilarity(session: WorkSession, context: SwitchContext): number {
    let score = 0;

    // 프로젝트명 비교 (가중치 0.4)
    if (session.project_name === context.project_name) {
      score += 0.4;
    } else if (session.project_name.toLowerCase().includes(context.project_name.toLowerCase()) ||
               context.project_name.toLowerCase().includes(session.project_name.toLowerCase())) {
      score += 0.2;
    }

    // 프로젝트 경로 비교 (가중치 0.4)
    if (session.project_path && context.project_path) {
      if (session.project_path === context.project_path) {
        score += 0.4;
      } else if (session.project_path.includes(context.project_path) || 
                 context.project_path.includes(session.project_path)) {
        score += 0.2;
      }
    }

    // Git 저장소 비교 (가중치 0.2)
    if (session.git_repository && context.git_repository) {
      if (session.git_repository === context.git_repository) {
        score += 0.2;
      }
    }

    return Math.min(score, 1.0); // 최대값 1.0으로 제한
  }

  /**
   * 세션 중복 제거
   */
  private deduplicateSessions(sessions: WorkSession[]): WorkSession[] {
    const seen = new Set<string>();
    return sessions.filter(session => {
      if (seen.has(session.session_id)) {
        return false;
      }
      seen.add(session.session_id);
      return true;
    });
  }

  /**
   * 관련성으로 세션 순위 매기기
   */
  private rankSessionsByRelevance(sessions: WorkSession[], context: SwitchContext): WorkSession[] {
    return sessions
      .map(session => ({
        session,
        relevance: this.calculateSessionSimilarity(session, context),
        recency: this.calculateRecencyScore(session)
      }))
      .sort((a, b) => {
        // 관련성 우선, 그 다음 최신성
        const relevanceDiff = b.relevance - a.relevance;
        if (Math.abs(relevanceDiff) > 0.1) {
          return relevanceDiff;
        }
        return b.recency - a.recency;
      })
      .map(item => item.session);
  }

  /**
   * 최신성 점수 계산
   */
  private calculateRecencyScore(session: WorkSession): number {
    const now = Date.now();
    const lastActivity = new Date(session.last_activity_at).getTime();
    const daysSinceActivity = (now - lastActivity) / (1000 * 60 * 60 * 24);
    
    // 7일 이내는 높은 점수, 30일 이후는 낮은 점수
    if (daysSinceActivity <= 1) return 1.0;
    if (daysSinceActivity <= 7) return 0.8;
    if (daysSinceActivity <= 30) return 0.5;
    return 0.2;
  }

  /**
   * 데이터베이스 세션 업데이트
   */
  private async updateSessionInDatabase(session: WorkSession): Promise<void> {
    const sql = `
      UPDATE work_sessions 
      SET status = ?, updated_at = ?, last_activity_at = ?, ended_at = ?
      WHERE session_id = ?
    `;
    
    await this.connection.run(sql, [
      session.status,
      session.updated_at,
      session.last_activity_at,
      session.ended_at,
      session.session_id
    ]);
  }

  /**
   * 데이터베이스에 새 세션 삽입
   */
  private async insertSessionToDatabase(session: WorkSession): Promise<void> {
    const sql = `
      INSERT INTO work_sessions (
        session_id, project_name, project_path, git_repository,
        started_at, ended_at, last_activity_at, status, description,
        auto_created, tags, created_by, created_at, updated_at,
        activity_count, memory_count, total_work_time, project_normalized
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.connection.run(sql, [
      session.session_id,
      session.project_name,
      session.project_path,
      session.git_repository,
      session.started_at,
      session.ended_at,
      session.last_activity_at,
      session.status,
      session.description,
      session.auto_created ? 1 : 0,
      JSON.stringify(session.tags || []),
      session.created_by,
      session.created_at,
      session.updated_at,
      session.activity_count,
      session.memory_count,
      session.total_work_time,
      session.project_normalized
    ]);
  }

  /**
   * 현재 활성 세션 조회
   */
  async getCurrentActiveSession(): Promise<WorkSession | null> {
    const result = await this.queryManager.findSessions({
      filter: { status: SessionStatus.ACTIVE },
      order_by: 'last_activity_at',
      order_direction: 'DESC',
      limit: 1
    });
    
    return result.data.length > 0 ? result.data[0] : null;
  }

  /**
   * 프로젝트별 세션 히스토리 조회
   */
  async getProjectSessionHistory(projectName: string): Promise<WorkSession[]> {
    const result = await this.queryManager.findSessions({
      filter: { project_name: projectName },
      order_by: 'last_activity_at',
      order_direction: 'DESC',
      limit: 10
    });
    
    return result.data;
  }

  /**
   * 자동 전환 조건 테스트
   */
  async testSwitchConditions(context: SwitchContext): Promise<SwitchEvaluation> {
    const currentState = await this.analyzeCurrentState();
    const existingSessions = await this.findRelatedSessions(context);
    let projectContext: any = {};
    
    try {
      if (this.contextAnalyzer && (this.contextAnalyzer as any).analyzeProjectContext) {
        projectContext = await this.contextAnalyzer.analyzeProjectContext(context.project_path);
      }
    } catch (error) {
      projectContext = {};
    }
    
    return this.evaluateSwitch(context, currentState, existingSessions, projectContext);
  }

  /**
   * 전환 정책 업데이트
   */
  updatePolicy(policy: Partial<SwitchManagerConfig>): void {
    this.config = { ...this.config, ...policy };
    this.ruleEngine = this.createRuleEngine(); // 규칙 엔진 재생성
  }

  /**
   * 현재 설정 조회
   */
  getConfig(): SwitchManagerConfig {
    return { ...this.config };
  }

  /**
   * 세션 전환 통계
   */
  async getSwitchStats(): Promise<{
    total_active_sessions: number;
    total_paused_sessions: number;
    recent_switches: number;
    avg_session_duration: number;
  }> {
    const [activeCount, pausedCount] = await Promise.all([
      this.queryManager.countSessions({ status: SessionStatus.ACTIVE }),
      this.queryManager.countSessions({ status: SessionStatus.PAUSED })
    ]);

    // 최근 24시간 전환 수 (생성된 auto-switch 태그 세션 수로 추정)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentSwitches = await this.queryManager.findSessions({
      filter: {
        tags: 'auto-switch',
        date_range: {
          start: oneDayAgo,
          field: 'created_at'
        }
      },
      limit: 100
    });

    // 평균 세션 지속 시간 계산 (완료된 세션들만)
    const completedSessions = await this.queryManager.findSessions({
      filter: { status: SessionStatus.COMPLETED },
      limit: 50,
      order_by: 'ended_at',
      order_direction: 'DESC'
    });

    let avgDuration = 0;
    if (completedSessions.data.length > 0) {
      const totalDuration = completedSessions.data.reduce((sum, session) => {
        if (session.ended_at) {
          const duration = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
          return sum + duration;
        }
        return sum;
      }, 0);
      avgDuration = totalDuration / completedSessions.data.length / (1000 * 60 * 60); // 시간 단위
    }

    return {
      total_active_sessions: activeCount,
      total_paused_sessions: pausedCount,
      recent_switches: recentSwitches.data.length,
      avg_session_duration: avgDuration
    };
  }
}

// 기본 세션 전환 관리자 생성 헬퍼
export function createSessionSwitchManager(
  connection: DatabaseConnection,
  config?: Partial<SwitchManagerConfig>
): SessionSwitchManager {
  return new SessionSwitchManager(connection, config);
}
