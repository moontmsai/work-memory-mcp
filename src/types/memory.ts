/**
 * 업무 메모리 시스템의 핵심 타입 정의
 */

export interface WorkMemory {
  id: string;
  content: string;
  project?: string | undefined;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: 'claude_app' | 'cursor_ai' | string;
  last_accessed_by?: string | undefined;
  access_count: number;
  importance_score: number; // 0-100 범위의 중요도 점수
}

export interface MemoryStats {
  total_memories: number;
  active_projects: string[];
  most_active_project: string | null;
}

export interface WorkMemoryDatabase {
  version: string;
  last_updated: string;
  memories: WorkMemory[];
  stats: MemoryStats;
}

export interface SearchIndex {
  keywords: Record<string, string[]>;
  projects: Record<string, string[]>;
  last_updated: string;
  last_optimized?: string;
  version?: string;
}

export interface SearchResult {
  memory: WorkMemory;
  score: number;
  relevance: 'high' | 'medium' | 'low';
  combined_score?: number; // relevance_score + importance_score 조합
  importance_level?: ImportanceLevel; // 중요도 레벨
}

export interface SearchQuery {
  query: string;
  project?: string;
  limit?: number;
  time_range?: 'today' | 'week' | 'month' | 'all';
}

export interface Settings {
  version: string;
  max_memories: number;
  auto_cleanup_days: number;
  max_keywords_per_memory: number;
  enable_history: boolean;
  enable_auto_archive: boolean;
  search: {
    exact_match_score: number;
    partial_match_score: number;
    tag_match_score: number;
    max_results: number;
  };
}

export interface CreateMemoryOptions {
  content: string;
  project?: string | undefined;
  tags?: string[];
  created_by: 'claude_app' | 'cursor_ai' | string;
  importance_score?: number; // 0-100 범위의 중요도 점수, 기본값 50
}

export interface UpdateMemoryOptions {
  content?: string | undefined;
  project?: string | undefined;
  tags?: string[] | undefined;
  importance_score?: number | undefined; // 0-100 범위의 중요도 점수
  accessed_by?: string | undefined;
}

// 중요도 점수 관련 타입과 상수
export const IMPORTANCE_SCORE = {
  MIN: 0,
  MAX: 100,
  DEFAULT: 50,
  HIGH: 80,
  MEDIUM: 50,
  LOW: 20
} as const;

export type ImportanceLevel = 'critical' | 'high' | 'medium' | 'low' | 'minimal';

// 중요도 점수를 레벨로 변환하는 헬퍼 타입
export interface ImportanceThresholds {
  critical: number; // 90-100
  high: number;     // 70-89
  medium: number;   // 30-69
  low: number;      // 10-29
  minimal: number;  // 0-9
}

// 검색 및 필터링을 위한 확장된 옵션
export interface AdvancedSearchOptions extends SearchQuery {
  min_importance_score?: number;
  max_importance_score?: number;
  importance_weight?: number; // 검색 결과에서 중요도 가중치
}