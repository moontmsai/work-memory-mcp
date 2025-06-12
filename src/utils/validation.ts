import { WorkMemory, WorkMemoryDatabase, SearchIndex, Settings } from '../types/memory.js';

/**
 * 데이터 검증 유틸리티
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * WorkMemory 객체 검증
 */
export function validateWorkMemory(memory: any): WorkMemory {
  if (!memory || typeof memory !== 'object') {
    throw new ValidationError('Memory must be an object');
  }

  // 필수 필드 검증
  if (!memory.id || typeof memory.id !== 'string') {
    throw new ValidationError('Memory ID is required and must be a string');
  }

  if (!memory.content || typeof memory.content !== 'string') {
    throw new ValidationError('Memory content is required and must be a string');
  }

  if (!memory.created_at || !isValidISODate(memory.created_at)) {
    throw new ValidationError('Memory created_at is required and must be a valid ISO date');
  }

  if (!memory.updated_at || !isValidISODate(memory.updated_at)) {
    throw new ValidationError('Memory updated_at is required and must be a valid ISO date');
  }

  if (!memory.created_by || typeof memory.created_by !== 'string') {
    throw new ValidationError('Memory created_by is required and must be a string');
  }

  // 선택적 필드 검증
  if (memory.project !== undefined && typeof memory.project !== 'string') {
    throw new ValidationError('Memory project must be a string if provided');
  }

  if (!Array.isArray(memory.tags)) {
    throw new ValidationError('Memory tags must be an array');
  }

  if (memory.tags.some((tag: any) => typeof tag !== 'string')) {
    throw new ValidationError('All memory tags must be strings');
  }

  if (memory.access_count !== undefined && (typeof memory.access_count !== 'number' || memory.access_count < 0)) {
    throw new ValidationError('Memory access_count must be a non-negative number');
  }

  if (memory.importance && !['high', 'medium', 'low'].includes(memory.importance)) {
    throw new ValidationError('Memory importance must be one of: high, medium, low');
  }

  // 내용 길이 제한
  if (memory.content.length > 10000) {
    throw new ValidationError('Memory content must be less than 10000 characters');
  }

  // 태그 개수 제한
  if (memory.tags.length > 20) {
    throw new ValidationError('Memory cannot have more than 20 tags');
  }

  // 검증된 객체 반환
  return {
    id: memory.id,
    content: memory.content.trim(),
    project: memory.project?.trim(),
    tags: memory.tags.map((tag: string) => tag.trim().toLowerCase()),
    created_at: memory.created_at,
    updated_at: memory.updated_at,
    created_by: memory.created_by,
    last_accessed_by: memory.last_accessed_by,
    access_count: memory.access_count || 0,
    importance_score: memory.importance_score || 50
  };
}

/**
 * WorkMemoryDatabase 객체 검증
 */
export function validateWorkMemoryDatabase(db: any): WorkMemoryDatabase {
  if (!db || typeof db !== 'object') {
    throw new ValidationError('Database must be an object');
  }

  if (!db.version || typeof db.version !== 'string') {
    throw new ValidationError('Database version is required and must be a string');
  }

  if (!db.last_updated || !isValidISODate(db.last_updated)) {
    throw new ValidationError('Database last_updated is required and must be a valid ISO date');
  }

  if (!Array.isArray(db.memories)) {
    throw new ValidationError('Database memories must be an array');
  }

  if (!db.stats || typeof db.stats !== 'object') {
    throw new ValidationError('Database stats is required and must be an object');
  }

  // 메모리들 개별 검증
  const validatedMemories = db.memories.map(validateWorkMemory);

  // 통계 검증
  const stats = db.stats;
  if (typeof stats.total_memories !== 'number' || stats.total_memories < 0) {
    throw new ValidationError('Stats total_memories must be a non-negative number');
  }

  if (!Array.isArray(stats.active_projects)) {
    throw new ValidationError('Stats active_projects must be an array');
  }

  if (stats.most_active_project !== null && typeof stats.most_active_project !== 'string') {
    throw new ValidationError('Stats most_active_project must be null or a string');
  }

  return {
    version: db.version,
    last_updated: db.last_updated,
    memories: validatedMemories,
    stats: {
      total_memories: stats.total_memories,
      active_projects: stats.active_projects,
      most_active_project: stats.most_active_project
    }
  };
}

/**
 * SearchIndex 객체 검증
 */
export function validateSearchIndex(index: any): SearchIndex {
  if (!index || typeof index !== 'object') {
    throw new ValidationError('Search index must be an object');
  }

  if (!index.keywords || typeof index.keywords !== 'object') {
    throw new ValidationError('Search index keywords must be an object');
  }

  if (!index.projects || typeof index.projects !== 'object') {
    throw new ValidationError('Search index projects must be an object');
  }

  if (!index.last_updated || !isValidISODate(index.last_updated)) {
    throw new ValidationError('Search index last_updated is required and must be a valid ISO date');
  }

  // 키워드 인덱스 검증
  for (const [keyword, memoryIds] of Object.entries(index.keywords)) {
    if (typeof keyword !== 'string') {
      throw new ValidationError('Search index keyword keys must be strings');
    }
    if (!Array.isArray(memoryIds)) {
      throw new ValidationError('Search index keyword values must be arrays');
    }
    if (memoryIds.some((id: any) => typeof id !== 'string')) {
      throw new ValidationError('Search index memory IDs must be strings');
    }
  }

  // 프로젝트 인덱스 검증
  for (const [project, memoryIds] of Object.entries(index.projects)) {
    if (typeof project !== 'string') {
      throw new ValidationError('Search index project keys must be strings');
    }
    if (!Array.isArray(memoryIds)) {
      throw new ValidationError('Search index project values must be arrays');
    }
    if (memoryIds.some((id: any) => typeof id !== 'string')) {
      throw new ValidationError('Search index memory IDs must be strings');
    }
  }

  return index as SearchIndex;
}

/**
 * Settings 객체 검증
 */
export function validateSettings(settings: any): Settings {
  if (!settings || typeof settings !== 'object') {
    throw new ValidationError('Settings must be an object');
  }

  if (!settings.version || typeof settings.version !== 'string') {
    throw new ValidationError('Settings version is required and must be a string');
  }

  if (typeof settings.max_memories !== 'number' || settings.max_memories <= 0) {
    throw new ValidationError('Settings max_memories must be a positive number');
  }

  if (typeof settings.auto_cleanup_days !== 'number' || settings.auto_cleanup_days <= 0) {
    throw new ValidationError('Settings auto_cleanup_days must be a positive number');
  }

  if (typeof settings.max_keywords_per_memory !== 'number' || settings.max_keywords_per_memory <= 0) {
    throw new ValidationError('Settings max_keywords_per_memory must be a positive number');
  }

  if (typeof settings.enable_history !== 'boolean') {
    throw new ValidationError('Settings enable_history must be a boolean');
  }

  if (typeof settings.enable_auto_archive !== 'boolean') {
    throw new ValidationError('Settings enable_auto_archive must be a boolean');
  }

  if (!settings.search || typeof settings.search !== 'object') {
    throw new ValidationError('Settings search must be an object');
  }

  const search = settings.search;
  if (typeof search.exact_match_score !== 'number' || search.exact_match_score <= 0) {
    throw new ValidationError('Search exact_match_score must be a positive number');
  }

  if (typeof search.partial_match_score !== 'number' || search.partial_match_score <= 0) {
    throw new ValidationError('Search partial_match_score must be a positive number');
  }

  if (typeof search.tag_match_score !== 'number' || search.tag_match_score <= 0) {
    throw new ValidationError('Search tag_match_score must be a positive number');
  }

  if (typeof search.max_results !== 'number' || search.max_results <= 0) {
    throw new ValidationError('Search max_results must be a positive number');
  }

  return settings as Settings;
}

/**
 * ISO 날짜 문자열 유효성 검증
 */
function isValidISODate(dateString: string): boolean {
  if (typeof dateString !== 'string') {
    return false;
  }
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && date.toISOString() === dateString;
}

/**
 * 메모리 ID 유효성 검증
 */
export function isValidMemoryId(id: string): boolean {
  if (typeof id !== 'string') {
    return false;
  }
  
  // mem_YYYYMMDDTHHMMSSSSSS_XXXXXX 형식 확인
  const pattern = /^mem_\d{8}T\d{6}\d{3}_[a-z0-9]{6}$/;
  return pattern.test(id);
}

/**
 * 프로젝트명 유효성 검증
 */
export function isValidProjectName(project: string): boolean {
  if (typeof project !== 'string') {
    return false;
  }
  
  // 길이 제한 및 특수문자 제한
  return project.length >= 1 && project.length <= 100 && /^[a-zA-Z0-9가-힣\-_\s]+$/.test(project);
}

/**
 * 검색 쿼리 유효성 검증
 */
export function isValidSearchQuery(query: string): boolean {
  if (typeof query !== 'string') {
    return false;
  }
  
  // 최소 길이 및 최대 길이 확인
  return query.trim().length >= 1 && query.length <= 500;
}