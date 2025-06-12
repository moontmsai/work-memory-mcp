/**
 * SessionTerminationHandler - 세션 종료 및 정리 처리 클래스
 * 세션 종료 시 안전한 리소스 정리 및 데이터 최종화를 담당
 */

import { DatabaseConnection } from '../database/connection.js';
import { 
  WorkSession, 
  SessionStatus,
  SessionTerminationResult,
  TerminationReason,
  CleanupOptions 
} from '../types/session.js';

export interface SessionTerminationConfig {
  auto_finalize_incomplete_work: boolean;
  backup_session_data: boolean;
  cleanup_orphaned_memories: boolean;
  force_cleanup_timeout_ms: number;
  preserve_session_history: boolean;
  generate_termination_report: boolean;
}

export interface TerminationContext {
  session_id: string;
  reason: TerminationReason;
  forced: boolean;
  initiated_by: string;
  timestamp: string;
  cleanup_options?: CleanupOptions;
}

export interface CleanupResult {
  success: boolean;
  memories_processed: number;
  links_removed: number;
  resources_freed: number;
  errors: string[];
  warnings: string[];
  execution_time_ms: number;
}

export interface TerminationReport {
  session_summary: {
    duration_ms: number;
    total_memories: number;
    work_completion_ratio: number;
    last_activity: string;
  };
  cleanup_summary: CleanupResult;
  final_status: SessionStatus;
  termination_reason: TerminationReason;
  preservation_actions: string[];
}

export class SessionTerminationHandler {
  private connection: DatabaseConnection;
  private config: SessionTerminationConfig;

  constructor(
    connection: DatabaseConnection,
    config?: Partial<SessionTerminationConfig>
  ) {
    this.connection = connection;
    this.config = {
      auto_finalize_incomplete_work: true,
      backup_session_data: true,
      cleanup_orphaned_memories: false, // 기본적으로 메모리는 보존
      force_cleanup_timeout_ms: 30000,
      preserve_session_history: true,
      generate_termination_report: true,
      ...config
    };
  }

  /**
   * 세션 정상 종료
   */
  async terminateSession(
    sessionId: string,
    reason: TerminationReason = TerminationReason.NORMAL,
    options?: {
      force?: boolean;
      initiated_by?: string;
      cleanup_options?: CleanupOptions;
    }
  ): Promise<SessionTerminationResult> {
    const startTime = Date.now();
    const context: TerminationContext = {
      session_id: sessionId,
      reason,
      forced: options?.force || false,
      initiated_by: options?.initiated_by || 'system',
      timestamp: new Date().toISOString(),
      cleanup_options: options?.cleanup_options
    };

    try {
      // 1. 세션 존재 확인
      const session = await this.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          session_id: sessionId,
          errors: ['Session not found'],
          execution_time_ms: Date.now() - startTime
        };
      }

      // 2. 종료 가능성 검증
      const canTerminate = await this.validateTermination(session, context);
      if (!canTerminate.valid && !context.forced) {
        return {
          success: false,
          session_id: sessionId,
          errors: canTerminate.errors,
          warnings: canTerminate.warnings,
          execution_time_ms: Date.now() - startTime
        };
      }

      // 3. 세션 데이터 백업 (설정된 경우)
      let backupResult: { success: boolean; backup_id?: string; error?: string } = { success: true };
      if (this.config.backup_session_data) {
        backupResult = await this.backupSessionData(session, context);
      }

      // 4. 미완료 작업 마무리
      const finalizationResult = await this.finalizeIncompleteWork(session, context);

      // 5. 리소스 정리
      const cleanupResult = await this.performCleanup(session, context);

      // 6. 세션 상태 업데이트
      const finalStatus = this.determineFinalStatus(reason);
      await this.updateSessionStatus(session, finalStatus, context);

      // 7. 종료 보고서 생성
      let terminationReport: TerminationReport | undefined;
      if (this.config.generate_termination_report) {
        terminationReport = await this.generateTerminationReport(
          session,
          context,
          cleanupResult,
          finalStatus
        );
      }

      // 8. 종료 로그 기록
      await this.logTermination(session, context, cleanupResult);

      return {
        success: true,
        session_id: sessionId,
        final_status: finalStatus,
        cleanup_result: cleanupResult,
        termination_report: terminationReport,
        backup_id: backupResult.backup_id,
        execution_time_ms: Date.now() - startTime,
        warnings: [
          ...canTerminate.warnings,
          ...(backupResult.success ? [] : [backupResult.error!]),
          ...finalizationResult.warnings
        ]
      };

    } catch (error) {
      return {
        success: false,
        session_id: sessionId,
        errors: [`Termination failed: ${error instanceof Error ? error.message : String(error)}`],
        execution_time_ms: Date.now() - startTime
      };
    }
  }

  /**
   * 강제 세션 종료 (응급 상황용)
   */
  async forceTerminateSession(
    sessionId: string,
    reason: TerminationReason = TerminationReason.FORCE_TERMINATED
  ): Promise<SessionTerminationResult> {
    return this.terminateSession(sessionId, reason, {
      force: true,
      initiated_by: 'force_termination',
      cleanup_options: {
        skip_validation: true,
        immediate_cleanup: true,
        ignore_errors: true
      }
    });
  }

  /**
   * 여러 세션 일괄 종료
   */
  async terminateMultipleSessions(
    sessionIds: string[],
    reason: TerminationReason,
    options?: {
      parallel?: boolean;
      max_concurrent?: number;
      stop_on_error?: boolean;
    }
  ): Promise<{
    results: SessionTerminationResult[];
    summary: {
      total: number;
      successful: number;
      failed: number;
      execution_time_ms: number;
    };
  }> {
    const startTime = Date.now();
    const results: SessionTerminationResult[] = [];
    const maxConcurrent = options?.max_concurrent || 5;

    if (options?.parallel && sessionIds.length > 1) {
      // 병렬 처리 (제한된 동시성)
      const chunks = this.chunkArray(sessionIds, maxConcurrent);
      
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(sessionId => 
          this.terminateSession(sessionId, reason)
        );
        
        const chunkResults = await Promise.allSettled(chunkPromises);
        
        for (const result of chunkResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              success: false,
              session_id: 'unknown',
              errors: [result.reason?.message || 'Unknown error'],
              execution_time_ms: 0
            });
          }
          
          // 오류 시 중단 옵션
          if (options?.stop_on_error && result.status === 'rejected') {
            break;
          }
        }
      }
    } else {
      // 순차 처리
      for (const sessionId of sessionIds) {
        const result = await this.terminateSession(sessionId, reason);
        results.push(result);
        
        if (options?.stop_on_error && !result.success) {
          break;
        }
      }
    }

    return {
      results,
      summary: {
        total: sessionIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        execution_time_ms: Date.now() - startTime
      }
    };
  }

  /**
   * 세션 존재 확인
   */
  private async getSession(sessionId: string): Promise<WorkSession | null> {
    try {
      const session = await this.connection.get(
        'SELECT * FROM work_sessions WHERE session_id = ?',
        [sessionId]
      );
      return session as WorkSession | null;
    } catch (error) {
      throw new Error(`Failed to get session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 종료 가능성 검증
   */
  private async validateTermination(
    session: WorkSession,
    context: TerminationContext
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 이미 종료된 세션인지 확인
    if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.CANCELLED) {
      errors.push(`Session is already terminated with status: ${session.status}`);
    }

    // 최근 활동 확인
    const lastActivity = new Date(session.last_activity_at);
    const timeSinceActivity = Date.now() - lastActivity.getTime();
    const recentActivityThreshold = 5 * 60 * 1000; // 5분

    if (timeSinceActivity < recentActivityThreshold && !context.forced) {
      warnings.push(`Session has recent activity (${Math.round(timeSinceActivity / 1000)}s ago). Consider delaying termination.`);
    }

    // 미완료 메모리 확인
    const incompleteMemories = await this.connection.get(
      'SELECT COUNT(*) as count FROM work_memories WHERE session_id = ? AND work_type = "todo"',
      [session.session_id]
    );

    if (incompleteMemories?.count > 0) {
      warnings.push(`Session has ${incompleteMemories.count} incomplete TODO items`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 세션 데이터 백업
   */
  private async backupSessionData(
    session: WorkSession,
    context: TerminationContext
  ): Promise<{ success: boolean; backup_id?: string; error?: string }> {
    try {
      const backupId = `backup_${session.session_id}_${Date.now()}`;
      
      // 세션 데이터 백업
      await this.connection.query(`
        INSERT INTO session_backups (
          backup_id, original_session_id, session_data, 
          memories_data, backup_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        backupId,
        session.session_id,
        JSON.stringify(session),
        await this.getSessionMemoriesForBackup(session.session_id),
        context.reason,
        context.timestamp
      ]);

      return { success: true, backup_id: backupId };
    } catch (error) {
      return { 
        success: false, 
        error: `Backup failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * 백업용 세션 메모리 데이터 조회
   */
  private async getSessionMemoriesForBackup(sessionId: string): Promise<string> {
    try {
      const memories = await this.connection.all(
        'SELECT * FROM work_memories WHERE session_id = ?',
        [sessionId]
      );
      return JSON.stringify(memories);
    } catch {
      return '[]';
    }
  }

  /**
   * 미완료 작업 마무리
   */
  private async finalizeIncompleteWork(
    session: WorkSession,
    context: TerminationContext
  ): Promise<{ warnings: string[] }> {
    const warnings: string[] = [];

    if (!this.config.auto_finalize_incomplete_work) {
      return { warnings };
    }

    try {
      // TODO 타입 메모리들을 완료 처리하거나 일반 메모리로 전환
      const todoMemories = await this.connection.all(
        'SELECT * FROM work_memories WHERE session_id = ? AND work_type = "todo"',
        [session.session_id]
      );

      for (const memory of todoMemories) {
        // TODO를 일반 메모리로 전환하고 미완료 표시 추가
        const updatedContent = `${memory.content}\n\n[자동 종료시 미완료 상태로 기록됨 - ${context.timestamp}]`;
        
        await this.connection.query(
          'UPDATE work_memories SET work_type = "memory", content = ?, updated_at = ? WHERE id = ?',
          [updatedContent, context.timestamp, memory.id]
        );
      }

      if (todoMemories.length > 0) {
        warnings.push(`Converted ${todoMemories.length} incomplete TODO items to regular memories`);
      }

    } catch (error) {
      warnings.push(`Failed to finalize incomplete work: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { warnings };
  }

  /**
   * 리소스 정리 수행
   */
  private async performCleanup(
    session: WorkSession,
    context: TerminationContext
  ): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      success: true,
      memories_processed: 0,
      links_removed: 0,
      resources_freed: 0,
      errors: [],
      warnings: [],
      execution_time_ms: 0
    };

    try {
      // 1. 메모리 링크 정리 (옵션에 따라)
      if (this.config.cleanup_orphaned_memories || context.cleanup_options?.cleanup_orphaned_memories) {
        const orphanedResult = await this.cleanupOrphanedMemories(session.session_id);
        result.memories_processed += orphanedResult.processed;
        result.errors.push(...orphanedResult.errors);
      }

      // 2. 세션-메모리 링크 제거 (연결만 제거, 메모리는 보존)
      const linksRemoved = await this.connection.query(
        'DELETE FROM session_memory_links WHERE session_id = ?',
        [session.session_id]
      );
      result.links_removed = linksRemoved.changes || 0;

      // 3. 임시 데이터 정리
      await this.cleanupTemporaryData(session.session_id);
      result.resources_freed++;

      // 4. 캐시 정리
      await this.clearSessionCache(session.session_id);
      result.resources_freed++;

    } catch (error) {
      result.success = false;
      result.errors.push(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    result.execution_time_ms = Date.now() - startTime;
    return result;
  }

  /**
   * 고아 메모리 정리
   */
  private async cleanupOrphanedMemories(sessionId: string): Promise<{
    processed: number;
    errors: string[];
  }> {
    try {
      // 다른 세션에서 참조되지 않는 메모리들 찾기
      const orphanedMemories = await this.connection.all(`
        SELECT wm.* FROM work_memories wm
        WHERE wm.session_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM session_memory_links sml 
          WHERE sml.memory_id = wm.id AND sml.session_id != ?
        )
      `, [sessionId, sessionId]);

      // 고아 메모리들을 아카이브하거나 삭제
      for (const memory of orphanedMemories) {
        await this.connection.query(
          'UPDATE work_memories SET archived = 1, updated_at = ? WHERE id = ?',
          [new Date().toISOString(), memory.id]
        );
      }

      return {
        processed: orphanedMemories.length,
        errors: []
      };
    } catch (error) {
      return {
        processed: 0,
        errors: [`Failed to cleanup orphaned memories: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * 임시 데이터 정리
   */
  private async cleanupTemporaryData(sessionId: string): Promise<void> {
    try {
      // 임시 세션 데이터 삭제
      await this.connection.query(
        'DELETE FROM session_temp_data WHERE session_id = ?',
        [sessionId]
      );
    } catch (error) {
      // 임시 데이터 정리 실패는 치명적이지 않음
      console.warn(`Failed to cleanup temporary data for session ${sessionId}:`, error);
    }
  }

  /**
   * 세션 캐시 정리
   */
  private async clearSessionCache(sessionId: string): Promise<void> {
    try {
      // 세션 관련 캐시 엔트리 삭제
      await this.connection.query(
        'DELETE FROM session_cache WHERE session_id = ?',
        [sessionId]
      );
    } catch (error) {
      // 캐시 정리 실패는 치명적이지 않음
      console.warn(`Failed to clear session cache for ${sessionId}:`, error);
    }
  }

  /**
   * 세션 상태 업데이트
   */
  private async updateSessionStatus(
    session: WorkSession,
    finalStatus: SessionStatus,
    context: TerminationContext
  ): Promise<void> {
    const endedAt = context.timestamp;
    const totalWorkTime = this.calculateTotalWorkTime(session, endedAt);

    await this.connection.query(`
      UPDATE work_sessions 
      SET status = ?, ended_at = ?, updated_at = ?, total_work_time = ?
      WHERE session_id = ?
    `, [
      finalStatus,
      endedAt,
      endedAt,
      totalWorkTime,
      session.session_id
    ]);
  }

  /**
   * 총 작업 시간 계산
   */
  private calculateTotalWorkTime(session: WorkSession, endedAt: string): number {
    const startTime = new Date(session.started_at).getTime();
    const endTime = new Date(endedAt).getTime();
    return Math.round((endTime - startTime) / 1000); // 초 단위
  }

  /**
   * 최종 상태 결정
   */
  private determineFinalStatus(reason: TerminationReason): SessionStatus {
    switch (reason) {
      case TerminationReason.NORMAL:
      case TerminationReason.USER_REQUESTED:
        return SessionStatus.COMPLETED;
      
      case TerminationReason.ERROR:
      case TerminationReason.TIMEOUT:
      case TerminationReason.FORCE_TERMINATED:
        return SessionStatus.CANCELLED;
      
      default:
        return SessionStatus.COMPLETED;
    }
  }

  /**
   * 종료 보고서 생성
   */
  private async generateTerminationReport(
    session: WorkSession,
    context: TerminationContext,
    cleanupResult: CleanupResult,
    finalStatus: SessionStatus
  ): Promise<TerminationReport> {
    const sessionDuration = this.calculateTotalWorkTime(session, context.timestamp) * 1000; // 밀리초
    
    // 세션 메모리 통계 조회
    const memoryStats = await this.connection.get(`
      SELECT 
        COUNT(*) as total_memories,
        COUNT(CASE WHEN work_type = 'todo' THEN 1 END) as todo_count,
        COUNT(CASE WHEN work_type = 'memory' THEN 1 END) as memory_count
      FROM work_memories 
      WHERE session_id = ?
    `, [session.session_id]);

    const workCompletionRatio = memoryStats?.todo_count > 0 
      ? (memoryStats.memory_count / (memoryStats.memory_count + memoryStats.todo_count))
      : 1.0;

    return {
      session_summary: {
        duration_ms: sessionDuration,
        total_memories: memoryStats?.total_memories || 0,
        work_completion_ratio: workCompletionRatio,
        last_activity: session.last_activity_at
      },
      cleanup_summary: cleanupResult,
      final_status: finalStatus,
      termination_reason: context.reason,
      preservation_actions: [
        'Session data preserved in work_sessions table',
        'Memory data preserved in work_memories table',
        ...(this.config.backup_session_data ? ['Session backup created'] : []),
        ...(this.config.preserve_session_history ? ['Session history preserved'] : [])
      ]
    };
  }

  /**
   * 종료 로그 기록
   */
  private async logTermination(
    session: WorkSession,
    context: TerminationContext,
    cleanupResult: CleanupResult
  ): Promise<void> {
    try {
      await this.connection.query(`
        INSERT INTO session_termination_log (
          session_id, termination_reason, initiated_by, 
          forced, cleanup_success, memories_processed,
          links_removed, execution_time_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        session.session_id,
        context.reason,
        context.initiated_by,
        context.forced ? 1 : 0,
        cleanupResult.success ? 1 : 0,
        cleanupResult.memories_processed,
        cleanupResult.links_removed,
        cleanupResult.execution_time_ms,
        context.timestamp
      ]);
    } catch (error) {
      // 로그 기록 실패는 치명적이지 않음
      console.warn(`Failed to log termination for session ${session.session_id}:`, error);
    }
  }

  /**
   * 배열을 청크로 나누기
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 종료 핸들러 설정 업데이트
   */
  updateConfig(newConfig: Partial<SessionTerminationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 현재 설정 조회
   */
  getConfig(): SessionTerminationConfig {
    return { ...this.config };
  }

  /**
   * 종료 통계 조회
   */
  async getTerminationStats(): Promise<{
    total_terminations: number;
    by_reason: Record<string, number>;
    success_rate: number;
    avg_cleanup_time_ms: number;
  }> {
    try {
      const stats = await this.connection.all(`
        SELECT 
          termination_reason,
          COUNT(*) as count,
          AVG(execution_time_ms) as avg_execution_time,
          AVG(CASE WHEN cleanup_success = 1 THEN 1.0 ELSE 0.0 END) as success_rate
        FROM session_termination_log 
        GROUP BY termination_reason
      `);

      const totalTerminations = stats.reduce((sum, stat) => sum + stat.count, 0);
      const byReason: Record<string, number> = {};
      let totalSuccessRate = 0;
      let totalAvgTime = 0;

      for (const stat of stats) {
        byReason[stat.termination_reason] = stat.count;
        totalSuccessRate += stat.success_rate * stat.count;
        totalAvgTime += stat.avg_execution_time * stat.count;
      }

      return {
        total_terminations: totalTerminations,
        by_reason: byReason,
        success_rate: totalTerminations > 0 ? totalSuccessRate / totalTerminations : 0,
        avg_cleanup_time_ms: totalTerminations > 0 ? totalAvgTime / totalTerminations : 0
      };
    } catch (error) {
      throw new Error(`Failed to get termination stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// 기본 종료 핸들러 생성 헬퍼
export function createSessionTerminationHandler(
  connection: DatabaseConnection,
  config?: Partial<SessionTerminationConfig>
): SessionTerminationHandler {
  return new SessionTerminationHandler(connection, config);
}
