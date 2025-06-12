import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SearchManager } from '../utils/index.js';

/**
 * optimize_search_index MCP 도구
 * 검색 인덱스 최적화 및 재구성 기능
 */

export interface OptimizeSearchIndexArgs {
  force_rebuild?: boolean;
  cleanup_orphans?: boolean;
  merge_similar?: boolean;
  remove_low_frequency?: boolean;
}

export const optimizeSearchIndexTool: Tool = {
  name: 'optimize_search_index',
  description: '검색 인덱스를 최적화합니다. 고아 키워드 제거, 유사 키워드 병합, 압축 등을 수행하여 검색 성능을 향상시킵니다.',
  inputSchema: {
    type: 'object',
    properties: {
      force_rebuild: {
        type: 'boolean',
        description: '인덱스를 완전히 재구성할지 여부 (기본값: false)',
        default: false
      },
      cleanup_orphans: {
        type: 'boolean', 
        description: '고아 키워드 정리 여부 (기본값: true)',
        default: true
      },
      merge_similar: {
        type: 'boolean',
        description: '유사한 키워드 병합 여부 (기본값: true)', 
        default: true
      },
      remove_low_frequency: {
        type: 'boolean',
        description: '저빈도 키워드 제거 여부 (기본값: false)',
        default: false
      }
    }
  }
};

/**
 * optimize_search_index 도구 핸들러
 */
export async function handleOptimizeSearchIndex(args: OptimizeSearchIndexArgs = {}): Promise<string> {
  const startTime = Date.now();
  
  try {
    const searchManager = new SearchManager();

    let result: string = '⚡ **검색 인덱스 최적화 실행**\n\n';

    // 최적화 전 건강 상태 확인
    try {
      const beforeHealth = await searchManager.analyzeIndexHealth();
      result += `🏥 **최적화 전 인덱스 상태**\n`;
      result += `- 건강 점수: ${beforeHealth.healthScore}/100\n`;
      result += `- 키워드 수: ${beforeHealth.statistics.uniqueKeywords}개\n`;
      result += `- 총 참조: ${beforeHealth.statistics.totalReferences}개\n\n`;
    } catch (healthError) {
      result += `⚠️ 건강 상태 확인 실패: ${healthError}\n\n`;
    }

    let optimizationStats: any;
    let rebuildPerformed = false;

    if (args.force_rebuild) {
      // 완전 재구성
      result += '🔄 **인덱스 완전 재구성 시작**\n';
      await searchManager.rebuildIndex();
      rebuildPerformed = true;
      result += '✅ 인덱스 재구성 완료\n\n';
    } else {
      // 단계별 최적화
      result += '🔧 **단계별 최적화 시작**\n';
      optimizationStats = await searchManager.optimizeIndex();
      
      if (optimizationStats.success) {
        result += '✅ 최적화 완료\n';
        result += `- 처리 시간: ${optimizationStats.processing_time_ms}ms\n`;
        if (optimizationStats.optimization) {
          result += `- 고아 키워드 제거: ${optimizationStats.optimization.orphan_keywords_removed}개\n`;
          result += `- 중복 키워드 제거: ${optimizationStats.optimization.duplicate_keywords_removed}개\n`;
        }
        result += '\n';
      } else {
        result += '❌ 최적화 실패\n\n';
      }
    }

    // 최적화 후 건강 상태 확인
    try {
      const afterHealth = await searchManager.analyzeIndexHealth();
      result += `🏥 **최적화 후 인덱스 상태**\n`;
      result += `- 건강 점수: ${afterHealth.healthScore}/100\n`;
      result += `- 키워드 수: ${afterHealth.statistics.uniqueKeywords}개\n`;
      result += `- 총 참조: ${afterHealth.statistics.totalReferences}개\n`;
      
      if (afterHealth.issues.length > 0) {
        result += `\n⚠️ **남은 문제:**\n`;
        afterHealth.issues.forEach((issue: string, index: number) => {
          result += `${index + 1}. ${issue}\n`;
        });
      }
      
      if (afterHealth.recommendations.length > 0) {
        result += `\n💡 **권장사항:**\n`;
        afterHealth.recommendations.forEach((rec: string, index: number) => {
          result += `${index + 1}. ${rec}\n`;
        });
      }
    } catch (healthError) {
      result += `⚠️ 최적화 후 건강 상태 확인 실패: ${healthError}\n`;
    }

    const processingTime = Date.now() - startTime;
    result += `\n⏱️ **총 처리 시간**: ${processingTime}ms`;

    return result;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return `❌ **인덱스 최적화 실패**\n\n🔍 **오류 정보:**\n${errorMessage}\n\n⏱️ **처리 시간**: ${processingTime}ms\n\n🔧 **해결 방법:**\n1. MCP 서버 재시작을 시도해보세요\n2. 데이터베이스 연결 상태를 확인하세요\n3. force_rebuild=true로 완전 재구성을 시도해보세요`;
  }
}

/**
 * 최적화 결과 포맷팅
 */
export function formatOptimizationResults(result: any): string {
  let output = '⚡ 검색 인덱스 최적화 완료\n\n';

  output += `⏱️ 처리 시간: ${result.processing_time_ms}ms\n\n`;

  if (result.rebuild_performed) {
    output += '🔄 인덱스 완전 재구성이 수행되었습니다.\n\n';
  }

  // 최적화 통계
  if (result.optimization_stats && !result.optimization_stats.rebuild) {
    const stats = result.optimization_stats;
    
    output += '📊 최적화 통계:\n';
    
    if (stats.before && stats.after) {
      output += `  변경 전:\n`;
      output += `    - 키워드 수: ${stats.before.keywordCount.toLocaleString()}개\n`;
      output += `    - 총 참조: ${stats.before.totalReferences.toLocaleString()}개\n`;
      output += `    - 인덱스 크기: ${(stats.before.indexSizeBytes / 1024).toFixed(1)}KB\n\n`;
      
      output += `  변경 후:\n`;
      output += `    - 키워드 수: ${stats.after.keywordCount.toLocaleString()}개\n`;
      output += `    - 총 참조: ${stats.after.totalReferences.toLocaleString()}개\n`;
      output += `    - 인덱스 크기: ${(stats.after.indexSizeBytes / 1024).toFixed(1)}KB\n\n`;
    }
    
    if (stats.optimization) {
      output += `  수행된 최적화:\n`;
      output += `    - 제거된 키워드: ${stats.optimization.removedKeywords}개\n`;
      output += `    - 병합된 키워드: ${stats.optimization.mergedKeywords}개\n`;
      output += `    - 압축률: ${stats.optimization.compressionRatio.toFixed(2)}x\n\n`;
    }
  }

  // 건강 상태 비교
  if (result.before_health && result.after_health) {
    const before = result.before_health.healthScore;
    const after = result.after_health.healthScore;
    const improvement = after - before;
    
    output += '🏥 인덱스 건강 상태 변화:\n';
    output += `  이전: ${before}/100\n`;
    output += `  이후: ${after}/100\n`;
    
    if (improvement > 0) {
      output += `  개선: +${improvement}점 ✅\n`;
    } else if (improvement < 0) {
      output += `  악화: ${improvement}점 ⚠️\n`;
    } else {
      output += `  변화 없음 ➖\n`;
    }
    output += '\n';

    // 남은 문제들
    if (result.after_health.issues.length > 0) {
      output += '⚠️ 남은 문제들:\n';
      result.after_health.issues.forEach((issue: string, index: number) => {
        output += `  ${index + 1}. ${issue}\n`;
      });
      output += '\n';
    }

    // 추가 권장사항
    if (result.after_health.recommendations.length > 0) {
      output += '💡 추가 권장사항:\n';
      result.after_health.recommendations.forEach((rec: string, index: number) => {
        output += `  ${index + 1}. ${rec}\n`;
      });
    }
  }

  if (result.after_health && result.after_health.healthScore >= 90) {
    output += '\n🎉 인덱스가 최적 상태입니다!';
  } else if (result.after_health && result.after_health.healthScore >= 70) {
    output += '\n✅ 인덱스 상태가 양호합니다.';
  } else {
    output += '\n⚠️ 추가 최적화가 필요할 수 있습니다.';
  }

  return output;
}

/**
 * 최적화 권장사항 분석
 */
export function analyzeOptimizationNeeds(health: any): {
  needsOptimization: boolean;
  urgency: 'low' | 'medium' | 'high';
  recommendations: string[];
} {
  const score = health.healthScore;
  const issues = health.issues || [];
  
  let urgency: 'low' | 'medium' | 'high' = 'low';
  let needsOptimization = false;
  const recommendations: string[] = [];

  if (score < 50) {
    urgency = 'high';
    needsOptimization = true;
    recommendations.push('즉시 인덱스 최적화를 실행하세요');
    recommendations.push('필요시 완전 재구성(force_rebuild=true)을 고려하세요');
  } else if (score < 80) {
    urgency = 'medium';
    needsOptimization = true;
    recommendations.push('인덱스 최적화를 권장합니다');
  } else if (score < 95) {
    urgency = 'low';
    recommendations.push('가벼운 최적화로 성능을 개선할 수 있습니다');
  }

  // 구체적인 문제 기반 권장사항
  issues.forEach((issue: string) => {
    if (issue.includes('고아 키워드')) {
      recommendations.push('cleanup_orphans=true로 고아 키워드를 정리하세요');
    }
    if (issue.includes('중복')) {
      recommendations.push('merge_similar=true로 유사 키워드를 병합하세요');
    }
    if (issue.includes('크기')) {
      recommendations.push('인덱스 압축을 실행하세요');
    }
    if (issue.includes('최적화되지 않았습니다')) {
      recommendations.push('정기적인 최적화 스케줄을 설정하세요');
    }
  });

  return {
    needsOptimization,
    urgency,
    recommendations: [...new Set(recommendations)] // 중복 제거
  };
}

