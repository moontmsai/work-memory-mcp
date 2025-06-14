/**
 * MCP 도구들 통합 내보내기
 */

import { optimizeDatabaseTool, handleOptimizeDatabase } from './optimize-database.js';
import { performanceAnalysisTool, handlePerformanceAnalysis } from './performance-analysis.js';

// 메모리 추가 도구
export * from './add-work-memory.js';

// 메모리 목록 및 삭제 도구
export * from './list-work-memories.js';
export * from './delete-work-memory.js';

// 검색 관련 도구들
export * from './search-work-memory.js';
export * from './get-related-keywords.js';
export { 
  getSearchStatsTool,
  handleGetSearchStats,
  GetSearchStatsArgs,
  formatSearchStats as formatSearchStatsMain
} from './get-search-stats.js';
export * from './optimize-search-index.js';

// 레거시 검색 유틸리티 (하위 호환성)
export * from './search-utils.js';

// 히스토리 및 버전 관리 도구들
export * from './get-work-memory-history.js';
export * from './get-work-memory-versions.js';

// 세션 컨텍스트 관리 도구들
export * from './session-context-tools.js';
export * from './continue-work-session.js';
import { 
  setActiveSessionTool,
  handleSetActiveSession,
  detectActiveSessionTool,
  handleDetectActiveSession,
  getSessionContextTool,
  handleGetSessionContext,
  setAutoLinkTool,
  handleSetAutoLink,
  clearActiveSessionTool,
  handleClearActiveSession
} from './session-context-tools.js';
import {
  continueWorkSessionTool,
  handleContinueWorkSession
} from './continue-work-session.js';

export const allTools = {
  // ... (기존 도구 매핑)
  [optimizeDatabaseTool.name]: optimizeDatabaseTool,
  [performanceAnalysisTool.name]: performanceAnalysisTool,
  
  // 세션 컨텍스트 관리 도구들
  [setActiveSessionTool.name]: setActiveSessionTool,
  [detectActiveSessionTool.name]: detectActiveSessionTool,
  [getSessionContextTool.name]: getSessionContextTool,
  [setAutoLinkTool.name]: setAutoLinkTool,
  [clearActiveSessionTool.name]: clearActiveSessionTool,
  [continueWorkSessionTool.name]: continueWorkSessionTool,
};

export const allToolHandlers = {
  // ... (기존 핸들러 매핑)
  [optimizeDatabaseTool.name]: handleOptimizeDatabase,
  [performanceAnalysisTool.name]: handlePerformanceAnalysis,
  
  // 세션 컨텍스트 관리 도구들
  [setActiveSessionTool.name]: handleSetActiveSession,
  [detectActiveSessionTool.name]: handleDetectActiveSession,
  [getSessionContextTool.name]: handleGetSessionContext,
  [setAutoLinkTool.name]: handleSetAutoLink,
  [clearActiveSessionTool.name]: handleClearActiveSession,
  [continueWorkSessionTool.name]: handleContinueWorkSession,
};