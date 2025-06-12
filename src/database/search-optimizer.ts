import { DatabaseConnection } from './connection.js';

interface SearchPerformanceMetrics {
  query: string;
  execution_time_ms: number;
  rows_examined: number;
  rows_returned: number;
  index_usage: string[];
  optimization_suggestions: string[];
}

interface IndexAnalysis {
  index_name: string;
  table_name: string;
  columns: string[];
  uniqueness: boolean;
  size_estimate: number;
  usage_count: number;
  effectiveness: 'high' | 'medium' | 'low';
  recommendations: string[];
}

export class SearchOptimizer {
  private connection: DatabaseConnection;
  private performanceHistory: SearchPerformanceMetrics[] = [];

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
  }

  /**
   * FTS (Full-Text Search) 가상 테이블 생성
   */
  async setupFullTextSearch(): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. FTS5 가상 테이블 생성 (메모리 컨텐츠용)
      await this.connection.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS fts_work_memories USING fts5(
          memory_id UNINDEXED,
          content,
          project,
          tags,
          importance UNINDEXED,
          created_by,
          content='work_memories',
          content_rowid='rowid'
        );
      `);

      // 2. FTS 테이블 초기 데이터 동기화
      await this.connection.run(`
        INSERT OR REPLACE INTO fts_work_memories(memory_id, content, project, tags, importance, created_by)
        SELECT id, content, project, tags, importance, created_by 
        FROM work_memories 
        WHERE is_archived = 0;
      `);

      return { success: true };

    } catch (error) {
      const errorMsg = `Failed to setup FTS: ${error instanceof Error ? error.message : String(error)}`;
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 고급 검색 실행 (FTS + 관계형 검색 결합)
   */
  async performAdvancedSearch(
    query: string,
    options: {
      useFullText?: boolean;
      projectFilter?: string;
      importanceFilter?: string;
      dateRange?: { start: string; end: string };
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    results: any[];
    performance: SearchPerformanceMetrics;
    total_found: number;
  }> {
    const startTime = Date.now();
    const {
      useFullText = true,
      projectFilter,
      importanceFilter,
      dateRange,
      limit = 20,
      offset = 0
    } = options;

    try {
      let searchResults: any[] = [];
      let totalFound = 0;
      const indexUsage: string[] = [];

      if (useFullText && query.trim()) {
        // 1. FTS를 사용한 전문 검색
        const ftsQuery = `
          SELECT 
            wm.*,
            rank,
            bm25(fts_work_memories) as relevance_score
          FROM fts_work_memories 
          JOIN work_memories wm ON fts_work_memories.memory_id = wm.id
          WHERE fts_work_memories MATCH ?
          ${projectFilter ? 'AND wm.project = ?' : ''}
          ${importanceFilter ? 'AND wm.importance = ?' : ''}
          ${dateRange ? 'AND wm.created_at BETWEEN ? AND ?' : ''}
          ORDER BY relevance_score DESC
          LIMIT ? OFFSET ?
        `;

        const params: any[] = [query];
        if (projectFilter) params.push(projectFilter);
        if (importanceFilter) params.push(importanceFilter);
        if (dateRange) {
          params.push(dateRange.start, dateRange.end);
        }
        params.push(limit, offset);

        searchResults = await this.connection.all(ftsQuery, params);
        indexUsage.push('fts_work_memories', 'idx_work_memories_project');

      } else {
        // 2. 전통적인 관계형 검색 (키워드 기반)
        const keywordQuery = `
          SELECT DISTINCT
            wm.*,
            GROUP_CONCAT(sk.keyword, ', ') as matched_keywords,
            SUM(sk.weight) as total_weight,
            COUNT(sk.keyword) as keyword_matches
          FROM work_memories wm
          JOIN search_keywords sk ON wm.id = sk.memory_id
          WHERE wm.is_archived = 0
          ${query ? 'AND LOWER(sk.keyword) LIKE ?' : ''}
          ${projectFilter ? 'AND wm.project = ?' : ''}
          ${importanceFilter ? 'AND wm.importance = ?' : ''}
          ${dateRange ? 'AND wm.created_at BETWEEN ? AND ?' : ''}
          GROUP BY wm.id
          ORDER BY total_weight DESC, keyword_matches DESC
          LIMIT ? OFFSET ?
        `;

        const params: any[] = [];
        if (query) params.push(`%${query.toLowerCase()}%`);
        if (projectFilter) params.push(projectFilter);
        if (importanceFilter) params.push(importanceFilter);
        if (dateRange) {
          params.push(dateRange.start, dateRange.end);
        }
        params.push(limit, offset);

        searchResults = await this.connection.all(keywordQuery, params);
        indexUsage.push('idx_search_keywords_keyword', 'idx_work_memories_project');
      }

      // 3. 총 결과 수 계산
      const countQuery = useFullText 
        ? `SELECT COUNT(*) as total FROM fts_work_memories WHERE fts_work_memories MATCH ?`
        : `SELECT COUNT(DISTINCT wm.id) as total FROM work_memories wm JOIN search_keywords sk ON wm.id = sk.memory_id WHERE wm.is_archived = 0 ${query ? 'AND LOWER(sk.keyword) LIKE ?' : ''}`;
      
      const countParams = query ? [useFullText ? query : `%${query.toLowerCase()}%`] : [];
      const countResult = await this.connection.get(countQuery, countParams);
      totalFound = countResult.total;

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // 4. 성능 메트릭 생성
      const performance: SearchPerformanceMetrics = {
        query,
        execution_time_ms: executionTime,
        rows_examined: totalFound,
        rows_returned: searchResults.length,
        index_usage: indexUsage,
        optimization_suggestions: this.generateOptimizationSuggestions(executionTime, totalFound, searchResults.length)
      };

      // 5. 성능 히스토리에 기록
      this.performanceHistory.push(performance);

      return {
        results: searchResults,
        performance,
        total_found: totalFound
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * 인덱스 분석 및 최적화 권장사항
   */
  async analyzeIndexes(): Promise<IndexAnalysis[]> {
    try {
      // 1. 모든 인덱스 정보 수집
      const indexes = await this.connection.all(`
        SELECT 
          name as index_name,
          tbl_name as table_name,
          sql,
          "unique" as is_unique
        FROM sqlite_master 
        WHERE type = 'index' 
        AND name NOT LIKE 'sqlite_%'
        ORDER BY tbl_name, name
      `);

      const analysis: IndexAnalysis[] = [];

      for (const index of indexes) {
        // 2. 인덱스별 상세 분석
        const indexInfo = await this.connection.all(`PRAGMA index_info('${index.index_name}')`);
        const columns = indexInfo.map(info => info.name);

        // 3. 인덱스 사용 통계 (쿼리 플래너 통계 시뮬레이션)
        const usageEstimate = await this.estimateIndexUsage(index.table_name, columns);

        // 4. 효율성 평가
        const effectiveness = this.evaluateIndexEffectiveness(usageEstimate, columns.length);

        // 5. 개선 권장사항 생성
        const recommendations = this.generateIndexRecommendations(
          index.table_name, 
          columns, 
          effectiveness,
          usageEstimate
        );

        analysis.push({
          index_name: index.index_name,
          table_name: index.table_name,
          columns,
          uniqueness: index.is_unique === 1,
          size_estimate: usageEstimate.size_estimate,
          usage_count: usageEstimate.usage_count,
          effectiveness,
          recommendations
        });
      }

      return analysis;

    } catch (error) {
      return [];
    }
  }

  /**
   * 검색 성능 벤치마크
   */
  async benchmarkSearchPerformance(): Promise<{
    fts_performance: SearchPerformanceMetrics;
    keyword_performance: SearchPerformanceMetrics;
    performance_comparison: {
      fts_faster: boolean;
      speed_difference_ms: number;
      accuracy_comparison: string;
    };
  }> {
    try {
      const testQuery = '테스트';
      
      // 1. FTS 성능 테스트
      const ftsResult = await this.performAdvancedSearch(testQuery, { useFullText: true });
      
      // 2. 키워드 검색 성능 테스트
      const keywordResult = await this.performAdvancedSearch(testQuery, { useFullText: false });

      // 3. 성능 비교 분석
      const speedDifference = ftsResult.performance.execution_time_ms - keywordResult.performance.execution_time_ms;
      const ftsFaster = speedDifference < 0;

      const accuracyComparison = this.compareSearchAccuracy(
        ftsResult.results.length,
        keywordResult.results.length,
        ftsResult.total_found,
        keywordResult.total_found
      );

      return {
        fts_performance: ftsResult.performance,
        keyword_performance: keywordResult.performance,
        performance_comparison: {
          fts_faster: ftsFaster,
          speed_difference_ms: Math.abs(speedDifference),
          accuracy_comparison: accuracyComparison
        }
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * 성능 히스토리 분석
   */
  getPerformanceReport(): {
    total_queries: number;
    average_execution_time: number;
    slowest_queries: SearchPerformanceMetrics[];
    optimization_opportunities: string[];
  } {
    const totalQueries = this.performanceHistory.length;
    
    if (totalQueries === 0) {
      return {
        total_queries: 0,
        average_execution_time: 0,
        slowest_queries: [],
        optimization_opportunities: []
      };
    }

    const averageTime = this.performanceHistory.reduce(
      (sum, metric) => sum + metric.execution_time_ms, 0
    ) / totalQueries;

    const slowestQueries = this.performanceHistory
      .sort((a, b) => b.execution_time_ms - a.execution_time_ms)
      .slice(0, 5);

    const optimizationOpportunities = this.identifyOptimizationOpportunities();

    return {
      total_queries: totalQueries,
      average_execution_time: Math.round(averageTime * 100) / 100,
      slowest_queries: slowestQueries,
      optimization_opportunities: optimizationOpportunities
    };
  }

  // === 헬퍼 메서드들 ===

  private generateOptimizationSuggestions(
    executionTime: number, 
    rowsExamined: number, 
    rowsReturned: number
  ): string[] {
    const suggestions: string[] = [];

    if (executionTime > 100) {
      suggestions.push('Query took longer than 100ms - consider adding indexes');
    }

    if (rowsExamined > rowsReturned * 10) {
      suggestions.push('High examination to return ratio - index selectivity could be improved');
    }

    if (rowsExamined > 1000) {
      suggestions.push('Large number of rows examined - consider query optimization');
    }

    return suggestions;
  }

  private async estimateIndexUsage(tableName: string, columns: string[]): Promise<{
    size_estimate: number;
    usage_count: number;
  }> {
    // 테이블 크기 기반 추정
    const tableInfo = await this.connection.get(`SELECT COUNT(*) as row_count FROM ${tableName}`);
    const sizeEstimate = Math.ceil(tableInfo.row_count * columns.length * 0.1); // 대략적 추정

    // 사용빈도는 컬럼 조합의 일반적 사용도로 추정
    const usageCount = columns.includes('id') ? 100 : 
                      columns.some(col => ['created_at', 'project', 'keyword'].includes(col)) ? 50 : 20;

    return { size_estimate: sizeEstimate, usage_count: usageCount };
  }

  private evaluateIndexEffectiveness(
    usage: { size_estimate: number; usage_count: number }, 
    columnCount: number
  ): 'high' | 'medium' | 'low' {
    const score = usage.usage_count / Math.max(1, columnCount) / Math.max(1, usage.size_estimate / 1000);
    
    if (score > 10) return 'high';
    if (score > 3) return 'medium';
    return 'low';
  }

  private generateIndexRecommendations(
    tableName: string, 
    columns: string[], 
    effectiveness: string,
    usage: { size_estimate: number; usage_count: number }
  ): string[] {
    const recommendations: string[] = [];

    if (effectiveness === 'low') {
      recommendations.push('Consider dropping this index if usage is consistently low');
    }

    if (columns.length > 3) {
      recommendations.push('Consider reducing composite index width for better performance');
    }

    if (usage.size_estimate > 10000) {
      recommendations.push('Large index - monitor maintenance overhead');
    }

    return recommendations;
  }

  private compareSearchAccuracy(
    ftsResults: number, 
    keywordResults: number, 
    ftsTotal: number, 
    keywordTotal: number
  ): string {
    const ftsAccuracy = ftsTotal > 0 ? (ftsResults / ftsTotal) * 100 : 0;
    const keywordAccuracy = keywordTotal > 0 ? (keywordResults / keywordTotal) * 100 : 0;

    if (Math.abs(ftsAccuracy - keywordAccuracy) < 5) {
      return 'Similar accuracy';
    } else if (ftsAccuracy > keywordAccuracy) {
      return `FTS more accurate by ${Math.round((ftsAccuracy - keywordAccuracy) * 100) / 100}%`;
    } else {
      return `Keyword more accurate by ${Math.round((keywordAccuracy - ftsAccuracy) * 100) / 100}%`;
    }
  }

  private identifyOptimizationOpportunities(): string[] {
    const opportunities: string[] = [];
    
    if (this.performanceHistory.length > 0) {
      const avgTime = this.performanceHistory.reduce((sum, m) => sum + m.execution_time_ms, 0) / this.performanceHistory.length;
      
      if (avgTime > 50) {
        opportunities.push('Average query time is high - consider index optimization');
      }

      const slowQueries = this.performanceHistory.filter(m => m.execution_time_ms > 100);
      if (slowQueries.length > this.performanceHistory.length * 0.1) {
        opportunities.push('More than 10% of queries are slow - review query patterns');
      }
    }

    return opportunities;
  }
}