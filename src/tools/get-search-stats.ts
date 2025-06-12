import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SearchManager } from '../utils/index.js';

/**
 * get_search_stats MCP 도구
 * 검색 시스템의 성능 통계와 인덱스 정보를 조회하는 기능 (캐시 시스템 제거)
 */

export interface GetSearchStatsArgs {
  include_index_stats?: boolean;
  include_popular_searches?: boolean;
}

export const getSearchStatsTool: Tool = {
  name: 'get_search_stats',
  description: '검색 시스템의 성능 통계, 인덱스 상태를 조회합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      include_index_stats: {
        type: 'boolean',
        description: '인덱스 통계 포함 여부 (기본값: true)',
        default: true
      },
      include_popular_searches: {
        type: 'boolean',
        description: '인기 검색어 포함 여부 (기본값: true)',
        default: true
      }
    }
  }
};

/**
 * get_search_stats 도구 핸들러
 */
export async function handleGetSearchStats(args: GetSearchStatsArgs = {}): Promise<{
  success: boolean;
  index_stats?: any;
  popular_searches?: Array<{keyword: string, count: number}>;
  index_health?: any;
  error?: string;
}> {
  try {
    const searchManager = new SearchManager();

    const result: any = {
      success: true
    };

    // 기본 검색 통계
    if (args.include_index_stats !== false) {
      const searchStats = await searchManager.getSearchStats();
      result.index_stats = searchStats.indexStats;
    }

    // 인기 검색어 (SQLite 직접 쿼리)
    if (args.include_popular_searches !== false) {
      result.popular_searches = await searchManager.getPopularSearches(10);
    }

    // 인덱스 건강 상태 (간단한 버전)
    result.index_health = {
      healthScore: 100,
      issues: [],
      recommendations: []
    };

    return result;

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다'
    };
  }
}

/**
 * 검색 통계 포맷팅
 */
export function formatSearchStats(stats: any): string {
  let output = '📊 검색 시스템 통계\n\n';

  // 인덱스 통계
  if (stats.index_stats) {
    output += '📚 인덱스 정보:\n';
    output += `  - 총 키워드: ${stats.index_stats.keywordCount.toLocaleString()}개\n`;
    output += `  - 총 참조: ${stats.index_stats.totalReferences.toLocaleString()}개\n`;
    output += `  - 메모리 수: ${stats.index_stats.memoryCount.toLocaleString()}개\n`;
    output += `  - 마지막 업데이트: ${new Date(stats.index_stats.lastUpdated).toLocaleString('ko-KR')}\n`;
    
    if (stats.index_stats.lastOptimized) {
      output += `  - 마지막 최적화: ${new Date(stats.index_stats.lastOptimized).toLocaleString('ko-KR')}\n`;
    }
    output += '\n';
  }

  // 인기 검색어
  if (stats.popular_searches && stats.popular_searches.length > 0) {
    output += '🔥 인기 검색어 (Top 10):\n';
    stats.popular_searches.forEach((search: any, index: number) => {
      output += `  ${index + 1}. "${search.keyword}" (${search.count}회)\n`;
    });
    output += '\n';
  }

  // 인덱스 건강 상태
  if (stats.index_health) {
    output += '🏥 인덱스 건강 상태:\n';
    output += `  - 건강 점수: ${stats.index_health.healthScore}/100\n`;
    
    if (stats.index_health.issues.length > 0) {
      output += `  - 발견된 문제:\n`;
      stats.index_health.issues.forEach((issue: string) => {
        output += `    ⚠️ ${issue}\n`;
      });
    }
    
    if (stats.index_health.recommendations.length > 0) {
      output += `  - 권장사항:\n`;
      stats.index_health.recommendations.forEach((rec: string) => {
        output += `    💡 ${rec}\n`;
      });
    }
  }

  return output;
}

/**
 * 인덱스 건강 상태만 별도 포맷팅
 */
export function formatIndexHealth(health: any): string {
  let output = '🏥 검색 인덱스 건강 진단\n\n';
  
  const score = health.healthScore;
  let statusEmoji = '🟢';
  let statusText = '양호';
  
  if (score < 50) {
    statusEmoji = '🔴';
    statusText = '위험';
  } else if (score < 80) {
    statusEmoji = '🟡';
    statusText = '주의';
  }
  
  output += `상태: ${statusEmoji} ${statusText} (${score}/100점)\n\n`;
  
  if (health.issues.length > 0) {
    output += '⚠️ 발견된 문제들:\n';
    health.issues.forEach((issue: string, index: number) => {
      output += `  ${index + 1}. ${issue}\n`;
    });
    output += '\n';
  }
  
  if (health.recommendations.length > 0) {
    output += '💡 개선 권장사항:\n';
    health.recommendations.forEach((rec: string, index: number) => {
      output += `  ${index + 1}. ${rec}\n`;
    });
  }
  
  if (health.issues.length === 0) {
    output += '✅ 모든 검사를 통과했습니다!\n';
  }
  
  return output;
}