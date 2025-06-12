import { WorkMemory, SearchResult, SearchQuery } from '../types/memory.js';
import { extractKeywords, calculateSearchScore, getRelevanceLevel, isWithinTimeRange } from './helpers.js';
import { getDatabaseConnection } from '../database/index.js';

/**
 * 고급 검색 기능 구현 (SQLite 기반)
 */

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

export class AdvancedSearchEngine {
  constructor() {
    // SQLite 기반으로 더 이상 FileSystemManager 불필요
  }

  /**
   * 고급 검색 실행 (SQLite 기반)
   */
  async search(query: SearchQuery, options: SearchOptions = {}): Promise<SearchResultWithContext[]> {
    const db = getDatabaseConnection();
    
    // 검색 쿼리 정규화
    const normalizedQuery = this.normalizeQuery(query.query);
    const queryKeywords = extractKeywords(normalizedQuery, 20);
    
    // 후보 메모리들 찾기 (SQLite 기반)
    const candidateIds = await this.findCandidateMemories(queryKeywords, options.fuzzyMatch);
    
    // SQL 조건 구성
    let sql = `
      SELECT * FROM work_memories 
      WHERE id IN (${Array.from(candidateIds).map(() => '?').join(',')})
    `;
    let params: any[] = Array.from(candidateIds);

    // 아카이브 필터링
    if (!options.includeArchived) {
      sql += ' AND is_archived = 0';
    }

    // 프로젝트 필터링
    if (query.project) {
      sql += ' AND LOWER(project) = ?';
      params.push(query.project.toLowerCase());
    }

    // 시간 범위 필터링 (SQLite에서 직접 처리)
    if (query.time_range && query.time_range !== 'all') {
      const timeFilter = this.getTimeRangeFilter(query.time_range);
      if (timeFilter) {
        sql += ` AND created_at > datetime('now', '${timeFilter}')`;
      }
    }

    const memories = candidateIds.size > 0 ? await db.all(sql, params) : [];

    // 스코어링 및 상세 결과 생성
    const searchResults = memories.map(memory => {
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

      const score = calculateSearchScore(
        normalizedQuery,
        workMemory.content,
        workMemory.tags,
        workMemory.project,
        query.project
      );

      const matchedKeywords = this.findMatchedKeywords(queryKeywords, workMemory);
      const context = this.extractContext(workMemory.content, matchedKeywords);
      const highlightedContent = this.highlightMatches(workMemory.content, matchedKeywords);

      return {
        memory: workMemory,
        score,
        relevance: getRelevanceLevel(score),
        matchedKeywords,
        context,
        highlightedContent
      };
    });

    // 최소 점수 필터링
    const minScore = options.minScore || 1;
    const filteredResults = searchResults.filter(result => result.score >= minScore);

    // 정렬
    const sortedResults = this.sortResults(filteredResults, options.sortBy || 'relevance');

    // 결과 제한
    const limit = query.limit || 20;
    return sortedResults.slice(0, limit);
  }

  /**
   * 검색 쿼리 정규화
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  /**
   * 시간 범위를 SQLite datetime 함수용 문자열로 변환
   */
  private getTimeRangeFilter(timeRange: string): string | null {
    switch (timeRange) {
      case 'today': return '-1 day';
      case 'week': return '-7 days';
      case 'month': return '-30 days';
      case 'year': return '-365 days';
      default: return null;
    }
  }

  /**
   * 후보 메모리 ID 찾기 (SQLite 기반)
   */
  private async findCandidateMemories(
    queryKeywords: string[],
    fuzzyMatch: boolean = false
  ): Promise<Set<string>> {
    if (queryKeywords.length === 0) {
      return new Set();
    }

    const db = getDatabaseConnection();
    const candidateIds = new Set<string>();

    // 정확한 키워드 매칭
    for (const keyword of queryKeywords) {
      const results = await db.all(
        'SELECT DISTINCT memory_id FROM search_keywords WHERE keyword = ?',
        [keyword.toLowerCase()]
      );
      results.forEach(row => candidateIds.add(row.memory_id));
    }

    // 퍼지 매칭 (선택적)
    if (fuzzyMatch) {
      for (const queryKeyword of queryKeywords) {
        const fuzzyResults = await db.all(
          'SELECT DISTINCT memory_id FROM search_keywords WHERE keyword LIKE ?',
          [`%${queryKeyword.toLowerCase()}%`]
        );
        fuzzyResults.forEach(row => candidateIds.add(row.memory_id));
      }
    }

    return candidateIds;
  }

  /**
   * 매칭된 키워드 찾기
   */
  private findMatchedKeywords(queryKeywords: string[], memory: WorkMemory): string[] {
    const contentKeywords = extractKeywords(memory.content, 50);
    const allMemoryKeywords = [...contentKeywords, ...memory.tags];
    
    return queryKeywords.filter(queryKeyword =>
      allMemoryKeywords.some(memoryKeyword =>
        memoryKeyword.includes(queryKeyword) || queryKeyword.includes(memoryKeyword)
      )
    );
  }

  /**
   * 컨텍스트 추출
   */
  private extractContext(content: string, matchedKeywords: string[], contextLength: number = 100): string {
    if (matchedKeywords.length === 0) {
      return content.slice(0, contextLength) + (content.length > contextLength ? '...' : '');
    }

    // 첫 번째 매칭 키워드 위치 찾기
    const firstKeyword = matchedKeywords[0];
    const keywordIndex = content.toLowerCase().indexOf(firstKeyword.toLowerCase());
    
    if (keywordIndex === -1) {
      return content.slice(0, contextLength) + (content.length > contextLength ? '...' : '');
    }

    // 컨텍스트 시작점 계산
    const start = Math.max(0, keywordIndex - contextLength / 2);
    const end = Math.min(content.length, start + contextLength);
    
    let context = content.slice(start, end);
    
    if (start > 0) context = '...' + context;
    if (end < content.length) context = context + '...';
    
    return context;
  }

  /**
   * 매칭된 키워드 하이라이팅
   */
  private highlightMatches(content: string, matchedKeywords: string[]): string {
    let highlighted = content;
    
    matchedKeywords.forEach(keyword => {
      const regex = new RegExp(`(${keyword})`, 'gi');
      highlighted = highlighted.replace(regex, '**$1**');
    });
    
    return highlighted;
  }

  /**
   * 검색 결과 정렬
   */
  private sortResults(
    results: SearchResultWithContext[],
    sortBy: 'relevance' | 'date' | 'access_count' | 'importance'
  ): SearchResultWithContext[] {
    return results.sort((a, b) => {
      switch (sortBy) {
        case 'relevance':
          return b.score - a.score;
        case 'date':
          return new Date(b.memory.created_at).getTime() - new Date(a.memory.created_at).getTime();
        case 'access_count':
          return (b.memory.access_count || 0) - (a.memory.access_count || 0);
        case 'importance':
          // importance_score는 숫자형이므로 직접 비교
          return (b.memory.importance_score || 0) - (a.memory.importance_score || 0);
        default:
          return b.score - a.score;
      }
    });
  }

  /**
   * 검색 제안 생성 (SQLite 기반)
   */
  async generateSearchSuggestions(query: string): Promise<string[]> {
    const db = getDatabaseConnection();
    const normalizedQuery = query.toLowerCase().trim();
    
    if (normalizedQuery.length < 2) {
      return [];
    }

    // 키워드 기반 제안
    const keywordSuggestions = await db.all(`
      SELECT keyword, COUNT(*) as count
      FROM search_keywords 
      WHERE keyword LIKE ?
      GROUP BY keyword
      ORDER BY count DESC
      LIMIT 10
    `, [`%${normalizedQuery}%`]);

    return keywordSuggestions.map(row => row.keyword);
  }

  /**
   * 연관 키워드 조회 (SQLite 기반)
   */
  async getRelatedKeywords(query: string): Promise<string[]> {
    const db = getDatabaseConnection();
    const queryKeywords = extractKeywords(query.toLowerCase(), 5);
    
    if (queryKeywords.length === 0) {
      return [];
    }

    // 같은 메모리에 나타나는 다른 키워드들 찾기
    const relatedKeywords = await db.all(`
      SELECT DISTINCT sk2.keyword, COUNT(*) as count
      FROM search_keywords sk1
      JOIN search_keywords sk2 ON sk1.memory_id = sk2.memory_id
      WHERE sk1.keyword IN (${queryKeywords.map(() => '?').join(',')})
        AND sk2.keyword NOT IN (${queryKeywords.map(() => '?').join(',')})
      GROUP BY sk2.keyword
      ORDER BY count DESC
      LIMIT 10
    `, [...queryKeywords, ...queryKeywords]);

    return relatedKeywords.map(row => row.keyword);
  }

  /**
   * 검색 성능 분석
   */
  async analyzeSearchPerformance(query: string): Promise<{
    indexHitRate: number;
    candidateCount: number;
    executionTime: number;
  }> {
    const startTime = Date.now();
    
    const queryKeywords = extractKeywords(query.toLowerCase(), 10);
    const candidateIds = await this.findCandidateMemories(queryKeywords, false);
    
    const executionTime = Date.now() - startTime;
    const indexHitRate = queryKeywords.length > 0 ? candidateIds.size / queryKeywords.length : 0;

    return {
      indexHitRate,
      candidateCount: candidateIds.size,
      executionTime
    };
  }
}