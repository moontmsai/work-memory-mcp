/**
 * 업무 메모리 시스템의 핵심 타입 정의
 */

export interface WorkMemory {
  id: string;
  content: string;
  context?: string | undefined;
  requirements?: string | undefined;
  result_content?: string | undefined;
  work_type: 'memory' | 'todo';
  project?: string | undefined;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: 'claude_app' | 'cursor_ai' | string;
  last_accessed_by?: string | undefined;
  access_count: number;
  importance: 'high' | 'medium' | 'low';
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
  context?: string | undefined;
  requirements?: string | undefined;
  result_content?: string | undefined;
  work_type?: 'memory' | 'todo';
  project?: string | undefined;
  tags?: string[];
  created_by: 'claude_app' | 'cursor_ai' | string;
  importance?: 'high' | 'medium' | 'low';
}

export interface UpdateMemoryOptions {
  content?: string | undefined;
  context?: string | undefined;
  requirements?: string | undefined;
  result_content?: string | undefined;
  work_type?: 'memory' | 'todo' | undefined;
  project?: string | undefined;
  tags?: string[] | undefined;
  importance?: 'high' | 'medium' | 'low' | undefined;
  accessed_by?: string | undefined;
}