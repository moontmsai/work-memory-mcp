/**
 * 메모리 효율적인 데이터 처리
 */
import { WorkMemory, WorkMemoryDatabase, SearchQuery } from '../types/memory.js';
import { SearchResultWithContext } from '../utils/advanced-search.js';
import { logger } from './logger.js';

export class OptimizedMemoryManager {
  
  /**
   * 페이징된 메모리 검색
   */
  static async searchMemoriesPaged(
    database: WorkMemoryDatabase,
    query: SearchQuery,
    pageSize: number = 50,
    page: number = 0
  ): Promise<{
    results: SearchResultWithContext[];
    totalCount: number;
    hasMore: boolean;
    page: number;
    pageSize: number;
    searchTime: number;
  }> {
    const startTime = Date.now();
    
    // 전체 결과를 메모리에 로드하지 않고 스트리밍 방식으로 처리
    const allMemories = database.memories;
    const startIndex = page * pageSize;
    const endIndex = startIndex + pageSize;
    
    // 검색 조건에 맞는 메모리만 필터링
    const filteredMemories = this.filterMemoriesStream(allMemories, query);
    const totalCount = filteredMemories.length;
    
    // 페이징 적용
    const pagedMemories = filteredMemories.slice(startIndex, endIndex);
    
    // 검색 결과로 변환 (최소한의 메모리 사용)
    const results = pagedMemories.map(memory => {
      const score = this.calculateRelevanceScore(memory, query.query || '');
      return {
        memory,
        context: this.extractMinimalContext(memory, query.query || ''),
        highlights: this.generateMinimalHighlights(memory, query.query || ''),
        score,
        relevance: score >= 10 ? 'high' : score >= 5 ? 'medium' : 'low' as 'high' | 'medium' | 'low',
        matchedKeywords: query.query ? [query.query] : [],
        highlightedContent: this.extractMinimalContext(memory, query.query || '')
      };
    });

    const searchTime = Date.now() - startTime;
    
    return {
      results,
      totalCount,
      hasMore: endIndex < totalCount,
      page,
      pageSize,
      searchTime
    };
  }

  /**
   * 스트림 방식 메모리 필터링
   */
  private static filterMemoriesStream(
    memories: WorkMemory[], 
    query: SearchQuery
  ): WorkMemory[] {
    return memories.filter(memory => {
      // 프로젝트 필터
      if (query.project && memory.project !== query.project) {
        return false;
      }

      // 시간 범위 필터
      if (query.time_range && query.time_range !== 'all') {
        const memoryDate = new Date(memory.updated_at);
        const now = new Date();
        const daysDiff = (now.getTime() - memoryDate.getTime()) / (1000 * 60 * 60 * 24);
        
        switch (query.time_range) {
          case 'today':
            if (daysDiff > 1) return false;
            break;
          case 'week':
            if (daysDiff > 7) return false;
            break;
          case 'month':
            if (daysDiff > 30) return false;
            break;
        }
      }

      // 텍스트 검색 (간단한 포함 검사)
      if (query.query) {
        const searchTerm = query.query.toLowerCase();
        return memory.content.toLowerCase().includes(searchTerm) ||
               memory.tags.some(tag => tag.includes(searchTerm));
      }

      return true;
    });
  }

  /**
   * 최소한의 컨텍스트 추출
   */
  private static extractMinimalContext(memory: WorkMemory, query: string): string {
    if (!query) return '';
    
    const content = memory.content;
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    
    const index = contentLower.indexOf(queryLower);
    if (index === -1) return content.substring(0, 100) + '...';
    
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 50);
    
    return (start > 0 ? '...' : '') + 
           content.substring(start, end) + 
           (end < content.length ? '...' : '');
  }

  /**
   * 최소한의 하이라이트 생성
   */
  private static generateMinimalHighlights(memory: WorkMemory, query: string): string[] {
    if (!query) return [];
    
    const highlights: string[] = [];
    const queryLower = query.toLowerCase();
    
    // 태그에서 일치하는 것들
    memory.tags.forEach(tag => {
      if (tag.includes(queryLower)) {
        highlights.push(`#${tag}`);
      }
    });
    
    return highlights.slice(0, 3); // 최대 3개만
  }

  /**
   * 관련성 점수 계산
   */
  private static calculateRelevanceScore(memory: WorkMemory, query: string): number {
    if (!query) return 0;
    
    const queryLower = query.toLowerCase();
    const contentLower = memory.content.toLowerCase();
    let score = 0;
    
    // 정확한 문구 매치
    if (contentLower.includes(queryLower)) {
      score += 10;
    }
    
    // 태그 매치
    memory.tags.forEach(tag => {
      if (tag.includes(queryLower)) {
        score += 5;
      }
    });
    
    // 최근 업데이트 가중치
    const daysSinceUpdate = (Date.now() - new Date(memory.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 7) {
      score += 3;
    } else if (daysSinceUpdate < 30) {
      score += 1;
    }
    
    // 중요도 가중치 (0-100 점수 기반)
    if (memory.importance_score >= 80) {
      score += 3; // high
    } else if (memory.importance_score >= 40) {
      score += 1; // medium  
    }
    // low (40 미만)는 추가 점수 없음
    
    return score;
  }

  /**
   * 메모리 사용량 모니터링
   */
  static getMemoryUsage(): {
    heapUsed: string;
    heapTotal: string;
    external: string;
    rss: string;
  } {
    const usage = process.memoryUsage();
    
    const formatBytes = (bytes: number): string => {
      const mb = bytes / 1024 / 1024;
      return `${mb.toFixed(2)} MB`;
    };

    return {
      heapUsed: formatBytes(usage.heapUsed),
      heapTotal: formatBytes(usage.heapTotal),
      external: formatBytes(usage.external),
      rss: formatBytes(usage.rss)
    };
  }

  /**
   * 대용량 데이터 처리를 위한 배치 프로세싱
   */
  static async processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = 100,
    delayMs: number = 10
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      logger.debug('BATCH_PROCESSOR', `Processing batch ${Math.floor(i / batchSize) + 1}`, {
        batchSize: batch.length,
        totalProgress: `${i + batch.length}/${items.length}`
      });
      
      const batchResults = await Promise.all(
        batch.map(item => processor(item))
      );
      
      results.push(...batchResults);
      
      // 메모리 해제를 위한 짧은 지연
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return results;
  }

  /**
   * 가비지 컬렉션 강제 실행 (개발/디버깅용)
   */
  static forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
      logger.debug('MEMORY_OPTIMIZER', 'Forced garbage collection');
    } else {
      logger.warn('MEMORY_OPTIMIZER', 'Garbage collection not available (run with --expose-gc)');
    }
  }
} 