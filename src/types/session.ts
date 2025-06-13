/**
 * 세션 관리 시스템의 타입 정의
 */

import { WorkMemory } from './memory';

// Session 별칭 추가 (기존 코드와의 호환성을 위해)
export type Session = WorkSession;

// 세션 상태 열거형
export enum SessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused', 
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

// 세션 기본 인터페이스
export interface WorkSession {
  session_id: string;
  project_name: string;
  project_path?: string;
  git_repository?: string;
  started_at: string; // ISO 8601 datetime
  ended_at?: string;
  last_activity_at: string;
  status: SessionStatus;
  description?: string;
  auto_created: boolean;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  activity_count: number;
  memory_count: number;
  total_work_time: number; // 초 단위
  project_normalized: string;
}

// 세션 생성 옵션
export interface CreateSessionOptions {
  project_name: string;
  project_path?: string;
  git_repository?: string;
  description?: string;
  tags?: string[];
  created_by?: string;
  auto_created?: boolean;
}

// 세션 업데이트 옵션
export interface UpdateSessionOptions {
  project_name?: string;
  project_path?: string;
  git_repository?: string;
  description?: string;
  tags?: string[];
  status?: SessionStatus;
  ended_at?: string;
}

// 세션 쿼리 옵션
export interface SessionQueryOptions {
  status?: SessionStatus | SessionStatus[];
  project_name?: string;
  created_by?: string;
  date_range?: {
    start?: string;
    end?: string;
  };
  limit?: number;
  offset?: number;
  sort_by?: 'started_at' | 'last_activity_at' | 'memory_count' | 'total_work_time';
  sort_order?: 'ASC' | 'DESC';
}

// 세션 통계
export interface SessionStats {
  total_sessions: number;
  active_sessions: number;
  completed_sessions: number;
  total_work_time: number;
  average_session_duration: number;
  most_active_project: string | null;
  session_by_status: Record<SessionStatus, number>;
}

// 세션-메모리 연결 정보
export interface SessionMemoryLink {
  session_id: string;
  memory_id: string;
  linked_at: string;
  created_by: string;
}

// 세션 활동 로그
export interface SessionActivity {
  session_id: string;
  activity_type: 'memory_added' | 'memory_removed' | 'status_changed' | 'updated';
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// 세션 상태 전환 규칙
export interface StateTransition {
  from: SessionStatus;
  to: SessionStatus;
  allowed: boolean;
  conditions?: string[];
}

// 세션 팩토리 설정
export interface SessionFactoryConfig {
  default_created_by: string;
  auto_start: boolean;
  generate_description: boolean;
  default_tags: string[];
}

// 세션 검증 결과
export interface SessionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// 확장된 세션 정보 (메모리 포함)
export interface SessionWithMemories extends WorkSession {
  memories: any[];  // MemoryItem 배열이지만 순환 참조 방지를 위해 any 사용
  memory_stats: SessionMemoryStats;
}

// 세션 요약 정보
export interface SessionSummary {
  session_id: string;
  project_name: string;
  status: SessionStatus;
  memory_count: number;
  duration: number; // 초 단위
  last_activity: string;
}

// 세션 생성 결과
export interface CreateSessionResult {
  session: WorkSession;
  created: boolean;
  errors?: string[];
}

// 세션 상태 변경 결과  
export interface StateChangeResult {
  success: boolean;
  previous_status: SessionStatus;
  new_status: SessionStatus;
  timestamp: string;
  errors?: string[];
}


// === Session-Memory Linking 관련 타입들 ===

// 메모리 링크 옵션
export interface MemoryLinkOptions {
  force_relink?: boolean;  // 이미 연결된 메모리를 강제로 재연결
  reason?: string;        // 연결 이유
  validate_rules?: boolean; // 검증 규칙 적용 여부
}

// 메모리 링크 결과
export interface MemoryLinkResult {
  success: boolean;
  linked_count: number;    // 성공적으로 연결된 메모리 수
  failed_count: number;    // 실패한 메모리 수
  errors: string[];        // 오류 메시지들
  warnings?: string[];     // 경고 메시지들
  operation_id: string;    // 작업 고유 ID
}

// 링크 검증 결과
export interface LinkValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// 세션 메모리 통계
export interface SessionMemoryStats {
  total_count: number;
  by_importance: {
    critical: number;      // 90점 이상
    high: number;         // 70-89점
    medium: number;       // 30-69점
    low: number;          // 10-29점
    minimal: number;      // 0-9점
  };
  by_type: {
    memory: number;
    todo: number;
  };
  recent_count: number;    // 최근 24시간 내 메모리
  average_importance: number;
  oldest_memory: string | null;  // ISO timestamp
  newest_memory: string | null;  // ISO timestamp
}



// === Session Switch Manager 관련 타입들 ===

// 세션 전환 정책
export enum SessionSwitchPolicy {
  AUTO = 'auto',           // 자동 전환
  MANUAL = 'manual',       // 수동 전환만
  PROMPT = 'prompt',       // 전환 전 확인
  DISABLED = 'disabled'    // 전환 비활성화
}

// 전환 결정 유형
export enum SwitchDecision {
  NO_ACTION = 'no_action',                    // 아무 작업 없음
  CREATE_NEW = 'create_new',                  // 새 세션 생성
  REACTIVATE_EXISTING = 'reactivate_existing' // 기존 세션 재활성화
}

// 세션 전환 결과
export interface SessionSwitchResult {
  success: boolean;
  switched: boolean;
  decision: SwitchDecision;
  target_session?: WorkSession;
  changes?: string[];
  confidence?: number;
  reasons?: string[];
  errors?: string[];
}

// 전환 규칙 엔진 인터페이스
export interface SwitchRuleEngine {
  evaluate(input: {
    context: SwitchContext;
    current_state: any;
    existing_sessions: WorkSession[];
    project_context?: any;
  }): SwitchEvaluation;
}

// 전환 컨텍스트 (재정의용, 기본은 SessionSwitchManager에서 정의)
export interface SwitchContext {
  project_path: string;
  project_name: string;
  git_repository?: string;
  metadata?: Record<string, any>;
  user_preference?: SessionSwitchPolicy;
  force_create?: boolean;
}

// 전환 평가 결과
export interface SwitchEvaluation {
  decision: SwitchDecision;
  target_session?: WorkSession;
  create_new: boolean;
  pause_sessions: WorkSession[];
  complete_sessions: WorkSession[];
  confidence: number;
  reasons: string[];
}

// === Session Termination 관련 타입들 ===

// 종료 이유
export enum TerminationReason {
  NORMAL = 'normal',                    // 정상 종료
  USER_REQUESTED = 'user_requested',    // 사용자 요청
  ERROR = 'error',                      // 오류로 인한 종료
  TIMEOUT = 'timeout',                  // 타임아웃
  FORCE_TERMINATED = 'force_terminated' // 강제 종료
}

// 정리 옵션
export interface CleanupOptions {
  skip_validation?: boolean;
  immediate_cleanup?: boolean;
  ignore_errors?: boolean;
  cleanup_orphaned_memories?: boolean;
  preserve_backup?: boolean;
}

// 세션 종료 결과
export interface SessionTerminationResult {
  success: boolean;
  session_id: string;
  final_status?: SessionStatus;
  cleanup_result?: any; // CleanupResult 타입은 구현부에서 정의
  termination_report?: any; // TerminationReport 타입은 구현부에서 정의
  backup_id?: string;
  execution_time_ms: number;
  errors?: string[];
  warnings?: string[];
}
