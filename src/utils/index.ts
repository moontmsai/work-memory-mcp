/**
 * 유틸리티 모듈 통합 export
 */

// 파일 시스템 관리
export { FileSystemManager } from './file-system.js';

// 검증 로직
export {
  ValidationError,
  validateWorkMemory,
  validateWorkMemoryDatabase,
  validateSearchIndex,
  validateSettings,
  isValidMemoryId,
  isValidProjectName,
  isValidSearchQuery
} from './validation.js';

// 날짜 처리
export {
  getCurrentISOString,
  formatHumanReadableDate,
  getTimeDifference,
  isWithinDays,
  isAfterDate,
  isBeforeDate,
  getTodayString,
  toFilenameSafeDate,
  getHourOfDay,
  getDayOfWeek,
  getMonth,
  isSameDay,
  sortByDate,
  filterByDateRange,
  toLocalTimeString,
  toLocalDateString
} from './date-utils.js';

// 헬퍼 함수들
export {
  generateMemoryId,
  extractKeywords,
  calculateSimilarity,
  calculateSearchScore,
  isWithinTimeRange,
  getRelevanceLevel
} from './helpers.js';

// 메모리 팩토리는 SQLite 전환으로 더 이상 필요 없음
// MemoryFactory 제거됨

// 고급 검색
export {
  AdvancedSearchEngine,
  type SearchOptions,
  type SearchResultWithContext
} from './advanced-search.js';

// 검색 캐시 시스템 제거됨 - 직접 SQLite 연결 사용

// 인덱스 최적화
// IndexOptimizer 제거 - SQLite 기반 시스템에서는 SearchManager에서 직접 처리

// 검색 매니저
export {
  SearchManager
} from './search-manager.js';

// worked 상태 관리
export {
  getDefaultWorked,
  detectCompletionStatus,
  isValidWorkedStatus,
  determineOptimalWorkedStatus,
  getWorkedEmoji,
  getWorkedDisplayText
} from './worked-utils.js';

