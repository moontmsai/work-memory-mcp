import { getDatabaseConnection } from '../database/index.js';
import { AdvancedSearchEngine } from './advanced-search.js';
import { WorkMemory, SearchQuery } from '../types/memory.js';
import { extractKeywords } from './helpers.js';

// SearchOptions와 SearchResultWithContext를 별도로 정의
export interface SearchOptions {
  fuzzyMatch?: boolean;
  includeArchived?: boolean;
  sortBy?: 'relevance' | 'date' | 'access_count' | 'importance';
  groupByProject?: boolean;
  minScore?: number;
}

export interface SearchResultWithContext {
  memory: WorkMemory;
  score: number;
  relevance: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
  context: string;
  highlightedContent: string;
}

/**
 * 통합 검색 관리자 (SQLite 기반)
 */
export class SearchManager {
  private advancedSearch: AdvancedSearchEngine;

  constructor() {
    this.advancedSearch = new AdvancedSearchEngine();
  }

  /**
   * 통합 검색 (직접 SQLite 쿼리)
   */
  async search(query: SearchQuery, options: SearchOptions = {}): Promise<SearchResultWithContext[]> {
    return await this.advancedSearch.search(query, options);
  }

  /**
   * 검색 제안 (직접 SQLite 쿼리)
   */
  async getSearchSuggestions(query: string): Promise<string[]> {
    return await this.advancedSearch.generateSearchSuggestions(query);
  }

  /**
   * 연관 검색어 조회
   */
  async getRelatedKeywords(query: string): Promise<string[]> {
    return await this.advancedSearch.getRelatedKeywords(query);
  }

  /**
   * 검색 인덱스에 메모리 추가 (SQLite 기반)
   */
  async addToSearchIndex(memory: WorkMemory): Promise<void> {
    const db = getDatabaseConnection();
    
    // 메모리에서 키워드 추출
    const keywords = extractKeywords(memory.content, 50);
    const allKeywords = [...keywords, ...memory.tags];

    // search_keywords 테이블에 키워드 추가
    for (const keyword of allKeywords) {
      const source = memory.tags.includes(keyword) ? 'tags' : 'content';
      const weight = source === 'tags' ? 2 : 1;
      await db.run(`
        INSERT OR IGNORE INTO search_keywords (memory_id, keyword, source, weight)
        VALUES (?, ?, ?, ?)
      `, [memory.id, keyword.toLowerCase(), source, weight]);
    }
  }

  /**
   * 검색 인덱스에서 메모리 제거 (SQLite 기반)
   */
  async removeFromSearchIndex(memoryId: string): Promise<void> {
    const db = getDatabaseConnection();
    await db.run('DELETE FROM search_keywords WHERE memory_id = ?', [memoryId]);
  }

  /**
   * 검색 인덱스 업데이트 (메모리 수정 시)
   */
  async updateSearchIndex(oldMemory: WorkMemory, newMemory: WorkMemory): Promise<void> {
    // 기존 메모리 제거
    await this.removeFromSearchIndex(oldMemory.id);
    
    // 새 메모리 추가
    await this.addToSearchIndex(newMemory);
  }

  /**
   * 인덱스 최적화 실행 (SQLite 기반으로 직접 구현)
   */
  async optimizeIndex(): Promise<any> {
    const db = getDatabaseConnection();
    if (!db) {
      throw new Error('Database connection not available');
    }

    const startTime = Date.now();

    try {
      // 최적화 전 통계
      const beforeStats = await this.getOptimizationStats();

      // 1. 고아 키워드 제거 (존재하지 않는 메모리 참조)
      const orphanResult = await db.run(`
        DELETE FROM search_keywords 
        WHERE memory_id NOT IN (
          SELECT id FROM work_memories WHERE is_archived = 0
        )
      `);

      // 2. 중복 키워드 정리 (같은 memory_id와 keyword 조합)
      const duplicateResult = await db.run(`
        DELETE FROM search_keywords 
        WHERE rowid NOT IN (
          SELECT MIN(rowid) 
          FROM search_keywords 
          GROUP BY memory_id, keyword
        )
      `);

      // 3. 데이터베이스 최적화 및 공간 회수
      await db.run('PRAGMA incremental_vacuum;');
      await db.run('VACUUM');
      await db.run('ANALYZE');

      // 최적화 후 통계
      const afterStats = await this.getOptimizationStats();

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        processing_time_ms: processingTime,
        before_stats: beforeStats,
        after_stats: afterStats,
        optimization: {
          orphan_keywords_removed: orphanResult.changes || 0,
          duplicate_keywords_removed: duplicateResult.changes || 0,
          compression_performed: true,
          vacuum_performed: true
        }
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * 최적화 통계 조회
   */
  private async getOptimizationStats(): Promise<any> {
    const db = getDatabaseConnection();
    
    const keywordCount = await db.get('SELECT COUNT(DISTINCT keyword) as count FROM search_keywords');
    const totalReferences = await db.get('SELECT COUNT(*) as count FROM search_keywords');
    const memoryCount = await db.get('SELECT COUNT(*) as count FROM work_memories WHERE is_archived = 0');
    
    return {
      keyword_count: keywordCount.count,
      total_references: totalReferences.count,
      memory_count: memoryCount.count,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 인덱스 재구성 (SQLite 기반)
   */
  async rebuildIndex(): Promise<void> {
    const db = getDatabaseConnection();
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      await db.run('BEGIN TRANSACTION');

      // 1. 기존 검색 키워드 모두 삭제
      await db.run('DELETE FROM search_keywords');

      // 2. 모든 활성 메모리에서 키워드 재추출
      const memories = await db.all('SELECT * FROM work_memories WHERE is_archived = 0');
      
      for (const memory of memories) {
        const workMemory: WorkMemory = {
          id: memory.id,
          content: memory.content,
          tags: JSON.parse(memory.tags || '[]'),
          project: memory.project,
          importance_score: memory.importance_score,
          created_at: memory.created_at,
          updated_at: memory.updated_at,
          created_by: memory.created_by || 'unknown',
          access_count: memory.access_count || 0
        };
        
        await this.addToSearchIndex(workMemory);
      }

      await db.run('COMMIT');
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * 인덱스 품질 분석 (SQLite 기반)
   */
  async analyzeIndexHealth(): Promise<any> {
    const db = getDatabaseConnection();
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // 기본 통계 수집
      const keywordStats = await db.get(`
        SELECT 
          COUNT(DISTINCT keyword) as uniqueKeywords,
          COUNT(*) as totalReferences,
          COUNT(DISTINCT memory_id) as referencedMemories
        FROM search_keywords
      `);

      const memoryStats = await db.get(`
        SELECT COUNT(*) as totalMemories
        FROM work_memories 
        WHERE is_archived = 0
      `);

      // 고아 키워드 확인
      const orphanKeywords = await db.get(`
        SELECT COUNT(*) as count
        FROM search_keywords sk
        WHERE NOT EXISTS (
          SELECT 1 FROM work_memories wm 
          WHERE wm.id = sk.memory_id AND wm.is_archived = 0
        )
      `);

      // 중복 키워드 확인
      const duplicateKeywords = await db.get(`
        SELECT COUNT(*) as count
        FROM (
          SELECT memory_id, keyword, COUNT(*) as cnt
          FROM search_keywords
          GROUP BY memory_id, keyword
          HAVING cnt > 1
        )
      `);

      // 건강 점수 계산
      let healthScore = 100;
      const issues: string[] = [];
      const recommendations: string[] = [];

      // 고아 키워드가 있으면 점수 감점
      if (orphanKeywords.count > 0) {
        healthScore -= Math.min(20, orphanKeywords.count * 2);
        issues.push(`${orphanKeywords.count}개의 고아 키워드가 발견되었습니다`);
        recommendations.push('cleanup_orphans=true로 고아 키워드를 정리하세요');
      }

      // 중복 키워드가 있으면 점수 감점
      if (duplicateKeywords.count > 0) {
        healthScore -= Math.min(15, duplicateKeywords.count);
        issues.push(`${duplicateKeywords.count}개의 중복 키워드가 발견되었습니다`);
        recommendations.push('중복 키워드를 정리하세요');
      }

      // 키워드 밀도 확인
      const keywordDensity = keywordStats.totalReferences / Math.max(1, memoryStats.totalMemories);
      if (keywordDensity < 3) {
        healthScore -= 10;
        issues.push('키워드 밀도가 낮습니다 (메모리당 평균 키워드 수 부족)');
        recommendations.push('키워드 추출 알고리즘을 개선하세요');
      }

      // 커버리지 확인
      const coverage = (keywordStats.referencedMemories / Math.max(1, memoryStats.totalMemories)) * 100;
      if (coverage < 90) {
        healthScore -= Math.max(0, 90 - coverage) / 2;
        issues.push(`인덱스 커버리지가 ${coverage.toFixed(1)}%입니다`);
        recommendations.push('모든 메모리가 인덱스에 포함되도록 재구성하세요');
      }

      healthScore = Math.max(0, Math.min(100, healthScore));

      return {
        healthScore: Math.round(healthScore),
        issues,
        recommendations,
        statistics: {
          uniqueKeywords: keywordStats.uniqueKeywords || 0,
          totalReferences: keywordStats.totalReferences || 0,
          referencedMemories: keywordStats.referencedMemories || 0,
          totalMemories: memoryStats.totalMemories || 0,
          orphanKeywords: orphanKeywords.count || 0,
          duplicateKeywords: duplicateKeywords.count || 0,
          coverage: Math.round(coverage * 100) / 100,
          keywordDensity: Math.round(keywordDensity * 100) / 100
        }
      };

    } catch (error) {
      throw new Error(`Index health analysis failed: ${error}`);
    }
  }

  /**
   * 검색 성능 통계 (SQLite 기반)
   */
  async getSearchStats(): Promise<{
    indexStats: any;
    performanceStats: any;
  }> {
    const db = getDatabaseConnection();
    if (!db) {
      throw new Error('Database connection not available');
    }
    
    const keywordCount = await db.get('SELECT COUNT(DISTINCT keyword) as count FROM search_keywords');
    const totalReferences = await db.get('SELECT COUNT(*) as count FROM search_keywords');
    const memoryCount = await db.get('SELECT COUNT(*) as count FROM work_memories WHERE is_archived = 0');
    
    return {
      indexStats: {
        keywordCount: keywordCount.count,
        totalReferences: totalReferences.count,
        memoryCount: memoryCount.count,
        lastUpdated: new Date().toISOString()
      },
      performanceStats: {
        indexHitRate: 1.0,
        candidateCount: memoryCount.count,
        executionTime: 1
      }
    };
  }

  /**
   * 인기 검색어 조회 (SQLite 직접 쿼리)
   */
  async getPopularSearches(limit: number = 10): Promise<Array<{keyword: string, count: number}>> {
    const db = getDatabaseConnection();
    return await db.all(`
      SELECT keyword, COUNT(*) as count
      FROM search_keywords
      GROUP BY keyword
      ORDER BY count DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * 검색 인덱스 초기화 (SQLite 기반)
   */
  async initializeSearchIndex(): Promise<void> {
    const db = getDatabaseConnection();
    if (!db) {
      throw new Error('Database connection not available');
    }
    
    // 기존 인덱스 정리
    await db.run('DELETE FROM search_keywords');
    
    // 모든 활성 메모리에 대해 인덱스 재구성
    const memories = await db.all('SELECT * FROM work_memories WHERE is_archived = 0');
    
    for (const memory of memories) {
      const workMemory: WorkMemory = {
        id: memory.id,
        content: memory.content,
        tags: JSON.parse(memory.tags || '[]'),
        project: memory.project,
        importance_score: memory.importance_score,
        created_at: memory.created_at,
        updated_at: memory.updated_at,
        created_by: memory.created_by || 'unknown',
        access_count: memory.access_count || 0
      };
      
      await this.addToSearchIndex(workMemory);
    }
  }

  /**
   * 인덱스 통계 조회 (SQLite 기반)
   */
  async getIndexStatistics(): Promise<{
    totalKeywords: number;
    totalReferences: number;
    averageReferencesPerKeyword: number;
    mostPopularKeywords: Array<{keyword: string, count: number}>;
    recentlyAddedKeywords: Array<{keyword: string, count: number}>;
  }> {
    const db = getDatabaseConnection();
    if (!db) {
      throw new Error('Database connection not available');
    }
    
    const keywordStats = await db.get(`
      SELECT 
        COUNT(DISTINCT keyword) as totalKeywords,
        COUNT(*) as totalReferences,
        CAST(COUNT(*) AS FLOAT) / COUNT(DISTINCT keyword) as averageReferencesPerKeyword
      FROM search_keywords
    `);

    const popularKeywords = await db.all(`
      SELECT keyword, COUNT(*) as count
      FROM search_keywords
      GROUP BY keyword
      ORDER BY count DESC
      LIMIT 10
    `);

    // 최근 추가된 키워드는 메모리 생성 시간 기준으로 추정
    const recentKeywords = await db.all(`
      SELECT sk.keyword, COUNT(*) as count
      FROM search_keywords sk
      JOIN work_memories wm ON sk.memory_id = wm.id
      WHERE wm.created_at > datetime('now', '-7 days')
      GROUP BY sk.keyword
      ORDER BY count DESC
      LIMIT 10
    `);

    return {
      totalKeywords: keywordStats.totalKeywords || 0,
      totalReferences: keywordStats.totalReferences || 0,
      averageReferencesPerKeyword: keywordStats.averageReferencesPerKeyword || 0,
      mostPopularKeywords: popularKeywords.map(row => ({
        keyword: row.keyword,
        count: row.count
      })),
      recentlyAddedKeywords: recentKeywords.map(row => ({
        keyword: row.keyword,
        count: row.count
      }))
    };
  }

  /**
   * 쿼리 분석
   */
  analyzeQuery(query: string): {
    keywords: string[];
    estimatedResults: number;
    searchComplexity: 'simple' | 'medium' | 'complex';
    suggestions: string[];
  } {
    const keywords = extractKeywords(query, 10);
    
    // 복잡도 계산
    let complexity: 'simple' | 'medium' | 'complex' = 'simple';
    if (keywords.length > 5) {
      complexity = 'complex';
    } else if (keywords.length > 2) {
      complexity = 'medium';
    }

    // 간단한 제안 생성
    const suggestions = keywords.map(keyword => keyword + '*');

    return {
      keywords,
      estimatedResults: keywords.length * 5, // 간단한 추정
      searchComplexity: complexity,
      suggestions
    };
  }
}