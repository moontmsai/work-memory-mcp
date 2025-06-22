import { DatabaseConnection } from '../database/connection.js';

/**
 * 성능 최적화 유틸리티
 * 
 * 기능:
 * 1. 쿼리 최적화 힌트
 * 2. 결과 캐싱
 * 3. 배치 작업 최적화
 * 4. 인덱스 힌트
 */

interface QueryCache {
  [key: string]: {
    result: any;
    timestamp: number;
    ttl: number;
  };
}

class PerformanceOptimizer {
  private static instance: PerformanceOptimizer;
  private queryCache: QueryCache = {};
  private readonly DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5분
  private readonly MAX_CACHE_ENTRIES = 500; // 최대 캐시 엔트리 수
  private readonly MAX_CACHE_SIZE = 50 * 1024 * 1024; // 최대 50MB
  private cacheStats = { hits: 0, misses: 0 };

  static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer();
    }
    return PerformanceOptimizer.instance;
  }

  /**
   * 최적화된 쿼리 생성
   */
  optimizeQuery(baseQuery: string, options: {
    useIndex?: string;
    limit?: number;
    orderByIndex?: boolean;
  } = {}): string {
    let optimizedQuery = baseQuery;

    // 인덱스 힌트 추가
    if (options.useIndex) {
      optimizedQuery = optimizedQuery.replace(
        /FROM\s+(\w+)/i,
        `FROM $1 INDEXED BY ${options.useIndex}`
      );
    }

    // LIMIT이 없으면 기본값 추가
    if (options.limit && !optimizedQuery.includes('LIMIT')) {
      optimizedQuery += ` LIMIT ${options.limit}`;
    }

    return optimizedQuery;
  }

  /**
   * 캐시된 쿼리 실행
   */
  async executeWithCache(
    connection: DatabaseConnection,
    query: string,
    params: any[] = [],
    cacheKey?: string,
    ttl: number = this.DEFAULT_CACHE_TTL
  ): Promise<any> {
    const key = cacheKey || this.generateCacheKey(query, params);
    const cached = this.queryCache[key];

    // 캐시 히트 확인
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      this.cacheStats.hits++;
      return cached.result;
    }

    this.cacheStats.misses++;

    // 캐시 크기 확인 및 정리
    this.enforeCacheLimits();

    // 쿼리 실행
    const result = await connection.all(query, params);

    // 결과 캐싱
    this.queryCache[key] = {
      result,
      timestamp: Date.now(),
      ttl
    };

    return result;
  }

  /**
   * 배치 INSERT 최적화
   */
  async batchInsert(
    connection: DatabaseConnection,
    table: string,
    columns: string[],
    values: any[][],
    batchSize: number = 100
  ): Promise<void> {
    const placeholders = '(' + columns.map(() => '?').join(', ') + ')';
    
    for (let i = 0; i < values.length; i += batchSize) {
      const batch = values.slice(i, i + batchSize);
      const batchPlaceholders = batch.map(() => placeholders).join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${batchPlaceholders}`;
      const flatParams = batch.flat();
      
      await connection.run(sql, flatParams);
    }
  }

  /**
   * 통계 정보 캐싱
   */
  async getCachedStats(
    connection: DatabaseConnection,
    statsType: 'importance_distribution' | 'project_counts' | 'recent_activity'
  ): Promise<any> {
    const cacheKey = `stats_${statsType}`;
    const ttl = 10 * 60 * 1000; // 10분

    switch (statsType) {
      case 'importance_distribution':
        return this.executeWithCache(
          connection,
          `SELECT 
            CASE 
              WHEN importance_score >= 90 THEN 'critical'
              WHEN importance_score >= 70 THEN 'high'
              WHEN importance_score >= 30 THEN 'medium'
              WHEN importance_score >= 10 THEN 'low'
              ELSE 'minimal'
            END as level,
            COUNT(*) as count
          FROM work_memories 
          WHERE is_archived = 0
          GROUP BY level`,
          [],
          cacheKey,
          ttl
        );

      case 'project_counts':
        return this.executeWithCache(
          connection,
          `SELECT project, COUNT(*) as count, AVG(importance_score) as avg_score
          FROM work_memories 
          WHERE is_archived = 0 AND project IS NOT NULL
          GROUP BY project
          ORDER BY count DESC
          LIMIT 20`,
          [],
          cacheKey,
          ttl
        );

      case 'recent_activity':
        return this.executeWithCache(
          connection,
          `SELECT 
            DATE(created_at) as date,
            COUNT(*) as memories_created,
            AVG(importance_score) as avg_score
          FROM work_memories 
          WHERE created_at >= datetime('now', '-30 days')
          GROUP BY DATE(created_at)
          ORDER BY date DESC`,
          [],
          cacheKey,
          ttl
        );

      default:
        throw new Error(`Unknown stats type: ${statsType}`);
    }
  }

  /**
   * 인덱스 사용률 분석
   */
  async analyzeIndexUsage(connection: DatabaseConnection): Promise<{
    recommendations: string[];
    usedIndexes: string[];
    unusedIndexes: string[];
  }> {
    const recommendations: string[] = [];
    const usedIndexes: string[] = [];
    const unusedIndexes: string[] = [];

    // 현재 인덱스 목록
    const indexes = await connection.all(`
      SELECT name, sql, tbl_name 
      FROM sqlite_master 
      WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
    `);

    // 테스트 쿼리로 인덱스 사용률 확인
    const testQueries = [
      'SELECT * FROM work_memories WHERE importance_score >= 80',
      'SELECT * FROM work_memories WHERE is_archived = 0 ORDER BY importance_score DESC',
      'SELECT * FROM work_memories WHERE project = "test" AND importance_score > 50',
      'SELECT * FROM search_keywords WHERE keyword = "test"'
    ];

    for (const query of testQueries) {
      try {
        const plan = await connection.all(`EXPLAIN QUERY PLAN ${query}`);
        plan.forEach((step: any) => {
          if (step.detail.includes('USING INDEX')) {
            const indexMatch = step.detail.match(/USING INDEX (\w+)/);
            if (indexMatch && !usedIndexes.includes(indexMatch[1])) {
              usedIndexes.push(indexMatch[1]);
            }
          }
        });
      } catch (error) {
        // 쿼리 실행 오류 무시
      }
    }

    // 사용되지 않는 인덱스 식별
    indexes.forEach((index: any) => {
      if (!usedIndexes.includes(index.name)) {
        unusedIndexes.push(index.name);
      }
    });

    // 권장사항 생성
    if (unusedIndexes.length > 0) {
      recommendations.push(`미사용 인덱스 검토: ${unusedIndexes.join(', ')}`);
    }

    if (usedIndexes.length < indexes.length * 0.7) {
      recommendations.push('인덱스 활용률이 낮습니다. 쿼리 패턴을 재검토해보세요.');
    }

    return { recommendations, usedIndexes, unusedIndexes };
  }

  /**
   * 데이터베이스 최적화 설정 적용
   */
  async applyOptimizationSettings(connection: DatabaseConnection): Promise<void> {
    // WAL 모드 설정
    await connection.run('PRAGMA journal_mode = WAL');
    
    // 캐시 크기 최적화 (10MB)
    await connection.run('PRAGMA cache_size = -10240');
    
    // 동기화 모드 최적화
    await connection.run('PRAGMA synchronous = NORMAL');
    
    // 임시 저장소를 메모리로 설정
    await connection.run('PRAGMA temp_store = MEMORY');
    
    // 자동 공간 회수 설정
    await connection.run('PRAGMA auto_vacuum = INCREMENTAL');
    
    // mmap 크기 설정 (256MB)
    await connection.run('PRAGMA mmap_size = 268435456');
  }

  /**
   * 캐시 관리
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      Object.keys(this.queryCache).forEach(key => {
        if (key.includes(pattern)) {
          delete this.queryCache[key];
        }
      });
    } else {
      this.queryCache = {};
    }
  }

  getCacheStats(): { totalEntries: number; totalSize: number; hitRate: number } {
    const totalEntries = Object.keys(this.queryCache).length;
    const totalSize = JSON.stringify(this.queryCache).length;
    const totalRequests = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = totalRequests > 0 ? this.cacheStats.hits / totalRequests : 0;
    
    return { totalEntries, totalSize, hitRate };
  }

  /**
   * 캐시 크기 제한 강제
   */
  private enforeCacheLimits(): void {
    const entries = Object.entries(this.queryCache);
    
    // 엔트리 수 제한
    if (entries.length >= this.MAX_CACHE_ENTRIES) {
      // LRU 정책으로 가장 오래된 엔트리 삭제
      const sortedEntries = entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);
      const toDelete = sortedEntries.slice(0, Math.floor(this.MAX_CACHE_ENTRIES * 0.2)); // 20% 삭제
      
      toDelete.forEach(([key]) => {
        delete this.queryCache[key];
      });
    }
    
    // 메모리 크기 제한
    const currentSize = JSON.stringify(this.queryCache).length;
    if (currentSize > this.MAX_CACHE_SIZE) {
      // 크기가 큰 엔트리부터 삭제
      const entriesWithSize = entries.map(([key, value]) => ({
        key,
        value,
        size: JSON.stringify(value).length
      })).sort((a, b) => b.size - a.size);
      
      let removedSize = 0;
      const targetSize = this.MAX_CACHE_SIZE * 0.8; // 80%까지 줄이기
      
      for (const entry of entriesWithSize) {
        if (currentSize - removedSize <= targetSize) break;
        delete this.queryCache[entry.key];
        removedSize += entry.size;
      }
    }
  }

  private generateCacheKey(query: string, params: any[]): string {
    return `query_${Buffer.from(query + JSON.stringify(params)).toString('base64').slice(0, 32)}`;
  }

  /**
   * 메모리 사용량 최적화
   */
  async optimizeMemoryUsage(connection: DatabaseConnection): Promise<void> {
    // 만료된 캐시 정리
    const now = Date.now();
    Object.keys(this.queryCache).forEach(key => {
      const cached = this.queryCache[key];
      if (now - cached.timestamp >= cached.ttl) {
        delete this.queryCache[key];
      }
    });

    // 데이터베이스 공간 회수
    await connection.run('PRAGMA incremental_vacuum');
    
    // 통계 정보 업데이트
    await connection.run('ANALYZE');
  }

  /**
   * 쿼리 성능 프로파일링
   */
  async profileQuery(
    connection: DatabaseConnection,
    query: string,
    params: any[] = []
  ): Promise<{
    executionTime: number;
    rowsExamined: number;
    indexesUsed: string[];
    recommendations: string[];
  }> {
    const startTime = Date.now();
    
    // 쿼리 계획 분석
    const plan = await connection.all(`EXPLAIN QUERY PLAN ${query}`, params);
    
    // 쿼리 실행
    const result = await connection.all(query, params);
    
    const executionTime = Date.now() - startTime;
    
    // 분석 결과
    const indexesUsed: string[] = [];
    const recommendations: string[] = [];
    
    plan.forEach((step: any) => {
      if (step.detail.includes('USING INDEX')) {
        const indexMatch = step.detail.match(/USING INDEX (\w+)/);
        if (indexMatch) {
          indexesUsed.push(indexMatch[1]);
        }
      } else if (step.detail.includes('SCAN TABLE')) {
        recommendations.push('풀 테이블 스캔이 발생했습니다. 인덱스 추가를 고려하세요.');
      }
    });
    
    if (executionTime > 100) {
      recommendations.push('쿼리 실행 시간이 길습니다. 최적화가 필요합니다.');
    }
    
    return {
      executionTime,
      rowsExamined: result.length,
      indexesUsed,
      recommendations
    };
  }
}

export default PerformanceOptimizer;
export { PerformanceOptimizer };
