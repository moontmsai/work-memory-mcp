import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { DatabaseConnection } from '../../src/database/connection.js';
import { initializeSchema } from '../../src/database/schema.js';
import { PerformanceOptimizer } from '../../src/utils/performance-optimizer.js';

/**
 * 성능 최적화 테스트
 * 
 * 테스트 항목:
 * 1. 인덱스 성능 개선 확인
 * 2. 쿼리 최적화 효과 측정
 * 3. 캐싱 시스템 성능
 * 4. 대용량 데이터 처리 성능
 */

const TEST_DB_PATH = './test-performance-optimization.db';

describe('Performance Optimization Tests', () => {
  let connection: DatabaseConnection;
  let optimizer: PerformanceOptimizer;

  beforeAll(async () => {
    // 테스트 데이터베이스 초기화
    connection = new DatabaseConnection(TEST_DB_PATH);
    await connection.connect();
    await initializeSchema(connection);
    
    optimizer = PerformanceOptimizer.getInstance();
    await optimizer.applyOptimizationSettings(connection);
  });

  afterAll(async () => {
    await connection.close();
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch {
      // 파일이 없으면 무시
    }
  });

  beforeEach(async () => {
    // 캐시 정리
    optimizer.clearCache();
    
    // 테이블 정리
    await connection.run('DELETE FROM work_memories');
    await connection.run('DELETE FROM search_keywords');
    await connection.run('DELETE FROM project_index');
  });

  describe('인덱스 성능 테스트', () => {
    it('should utilize importance_score index for range queries', async () => {
      // 테스트 데이터 생성 (1000개)
      const testData = Array.from({ length: 1000 }, (_, i) => [
        `perf-mem-${i}`,
        `Performance test content ${i}`,
        Math.floor(Math.random() * 101), // 0-100 랜덤 점수
        'perf-project',
        '["performance"]',
        '2024-01-01T00:00:00Z',
        '2024-01-01T00:00:00Z',
        'perf-test',
        0,
        0 // is_archived
      ]);

      // 배치 삽입으로 성능 최적화
      await optimizer.batchInsert(
        connection,
        'work_memories',
        ['id', 'content', 'importance_score', 'project', 'tags', 'created_at', 'updated_at', 'created_by', 'access_count', 'is_archived'],
        testData,
        100
      );

      // 범위 쿼리 성능 테스트
      const highScoreQuery = `
        SELECT COUNT(*) as count 
        FROM work_memories 
        WHERE importance_score >= 80
      `;

      const startTime = Date.now();
      const result = await connection.get(highScoreQuery);
      const executionTime = Date.now() - startTime;

      expect(result.count).toBeGreaterThan(0);
      expect(executionTime).toBeLessThan(50); // 50ms 이내

      // 쿼리 계획 확인 (인덱스 사용 여부)
      const plan = await connection.all(`EXPLAIN QUERY PLAN ${highScoreQuery}`);
      const usesIndex = plan.some((step: any) => 
        step.detail.includes('USING INDEX') && 
        step.detail.includes('importance_score')
      );

      expect(usesIndex).toBe(true);
    });

    it('should utilize composite indexes for complex queries', async () => {
      // 복합 인덱스 테스트 데이터
      await connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, is_archived, created_at, updated_at, created_by, access_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['comp-1', 'Composite test', 75, 0, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'test', 0]);

      // 복합 조건 쿼리
      const complexQuery = `
        SELECT * FROM work_memories 
        WHERE is_archived = 0 AND importance_score >= 70 
        ORDER BY importance_score DESC, created_at DESC
        LIMIT 10
      `;

      const startTime = Date.now();
      await connection.all(complexQuery);
      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeLessThan(30); // 30ms 이내

      // 인덱스 사용 확인
      const plan = await connection.all(`EXPLAIN QUERY PLAN ${complexQuery}`);
      const hasIndexScan = plan.some((step: any) => 
        step.detail.includes('USING INDEX')
      );

      expect(hasIndexScan).toBe(true);
    });
  });

  describe('쿼리 캐싱 성능 테스트', () => {
    it('should improve performance with query caching', async () => {
      // 테스트 데이터 추가
      await connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, created_at, updated_at, created_by, access_count, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['cache-test', 'Cache test content', 85, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'test', 0, 0]);

      const query = 'SELECT COUNT(*) as count FROM work_memories WHERE importance_score >= 80';

      // 첫 번째 실행 (캐시 없음)
      const firstStart = Date.now();
      const firstResult = await optimizer.executeWithCache(connection, query, [], 'cache_test_key');
      const firstTime = Date.now() - firstStart;

      // 두 번째 실행 (캐시 히트)
      const secondStart = Date.now();
      const secondResult = await optimizer.executeWithCache(connection, query, [], 'cache_test_key');
      const secondTime = Date.now() - secondStart;

      // 결과 일치 확인
      expect(firstResult).toEqual(secondResult);
      
      // 캐시 히트가 더 빨라야 함
      expect(secondTime).toBeLessThan(firstTime);
      expect(secondTime).toBeLessThan(5); // 5ms 이내 (캐시 히트)
    });

    it('should cache statistical queries effectively', async () => {
      // 통계 쿼리 캐싱 테스트
      const stats1 = await optimizer.getCachedStats(connection, 'importance_distribution');
      const stats2 = await optimizer.getCachedStats(connection, 'importance_distribution');

      expect(stats1).toEqual(stats2);

      // 캐시 상태 확인
      const cacheStats = optimizer.getCacheStats();
      expect(cacheStats.totalEntries).toBeGreaterThan(0);
    });
  });

  describe('배치 작업 성능 테스트', () => {
    it('should perform batch inserts efficiently', async () => {
      const batchSize = 500;
      const testData = Array.from({ length: batchSize }, (_, i) => [
        `batch-${i}`,
        `Batch test content ${i}`,
        Math.floor(Math.random() * 101),
        'batch-project',
        '["batch"]',
        '2024-01-01T00:00:00Z',
        '2024-01-01T00:00:00Z',
        'batch-test',
        0,
        0
      ]);

      const startTime = Date.now();
      await optimizer.batchInsert(
        connection,
        'work_memories',
        ['id', 'content', 'importance_score', 'project', 'tags', 'created_at', 'updated_at', 'created_by', 'access_count', 'is_archived'],
        testData,
        100 // 배치 크기
      );
      const batchTime = Date.now() - startTime;

      // 배치 삽입이 개별 삽입보다 빨라야 함
      expect(batchTime).toBeLessThan(2000); // 2초 이내

      // 데이터 확인
      const count = await connection.get('SELECT COUNT(*) as count FROM work_memories');
      expect(count.count).toBe(batchSize);

      console.log(`Batch insert performance: ${batchSize} records in ${batchTime}ms`);
    });
  });

  describe('대용량 데이터 성능 테스트', () => {
    it('should handle large datasets efficiently', async () => {
      const dataSize = 2000;
      
      // 대용량 데이터 생성
      const startInsertTime = Date.now();
      for (let i = 0; i < dataSize; i += 100) {
        const batch = Array.from({ length: Math.min(100, dataSize - i) }, (_, j) => [
          `large-${i + j}`,
          `Large dataset content ${i + j}`,
          Math.floor(Math.random() * 101),
          `project-${Math.floor((i + j) / 100)}`,
          '["large", "dataset"]',
          '2024-01-01T00:00:00Z',
          '2024-01-01T00:00:00Z',
          'large-test',
          0,
          0
        ]);

        await optimizer.batchInsert(
          connection,
          'work_memories',
          ['id', 'content', 'importance_score', 'project', 'tags', 'created_at', 'updated_at', 'created_by', 'access_count', 'is_archived'],
          batch
        );
      }
      const insertTime = Date.now() - startInsertTime;

      // 복잡한 쿼리 성능 테스트
      const complexQueries = [
        {
          name: 'High Score Aggregation',
          query: `
            SELECT project, COUNT(*) as count, AVG(importance_score) as avg_score
            FROM work_memories 
            WHERE importance_score >= 70 AND is_archived = 0
            GROUP BY project
            ORDER BY avg_score DESC
          `,
          maxTime: 200
        },
        {
          name: 'Score Distribution',
          query: `
            SELECT 
              CASE 
                WHEN importance_score >= 90 THEN 'critical'
                WHEN importance_score >= 70 THEN 'high'
                WHEN importance_score >= 30 THEN 'medium'
                ELSE 'low'
              END as level,
              COUNT(*) as count
            FROM work_memories 
            WHERE is_archived = 0
            GROUP BY level
            ORDER BY MIN(importance_score) DESC
          `,
          maxTime: 150
        },
        {
          name: 'Pagination Query',
          query: `
            SELECT * FROM work_memories 
            WHERE is_archived = 0 
            ORDER BY importance_score DESC, created_at DESC
            LIMIT 50 OFFSET 100
          `,
          maxTime: 100
        }
      ];

      for (const testQuery of complexQueries) {
        const startTime = Date.now();
        const result = await connection.all(testQuery.query);
        const executionTime = Date.now() - startTime;

        expect(executionTime).toBeLessThan(testQuery.maxTime);
        expect(result.length).toBeGreaterThan(0);

        console.log(`${testQuery.name}: ${executionTime}ms (limit: ${testQuery.maxTime}ms)`);
      }

      console.log(`Large dataset test: ${dataSize} records inserted in ${insertTime}ms`);
    });
  });

  describe('메모리 및 공간 최적화 테스트', () => {
    it('should optimize memory usage effectively', async () => {
      // 메모리 사용량 최적화 전 상태
      const beforeStats = optimizer.getCacheStats();
      
      // 캐시에 데이터 추가
      for (let i = 0; i < 10; i++) {
        await optimizer.executeWithCache(
          connection,
          'SELECT COUNT(*) FROM work_memories',
          [],
          `test_cache_${i}`,
          1000 // 짧은 TTL
        );
      }

      const afterStats = optimizer.getCacheStats();
      expect(afterStats.totalEntries).toBeGreaterThan(beforeStats.totalEntries);

      // 메모리 최적화 실행
      await optimizer.optimizeMemoryUsage(connection);

      // 최적화 후 상태 확인
      const optimizedStats = optimizer.getCacheStats();
      expect(optimizedStats.totalEntries).toBeLessThanOrEqual(afterStats.totalEntries);
    });

    it('should perform database maintenance efficiently', async () => {
      // 테스트 데이터 추가 후 삭제 (공간 회수 테스트)
      await connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, created_at, updated_at, created_by, access_count, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['temp-1', 'Temporary content', 50, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'test', 0, 0]);

      await connection.run('DELETE FROM work_memories WHERE id = ?', ['temp-1']);

      // 공간 회수 실행
      const startTime = Date.now();
      await optimizer.optimizeMemoryUsage(connection);
      const optimizeTime = Date.now() - startTime;

      expect(optimizeTime).toBeLessThan(1000); // 1초 이내
    });
  });

  describe('인덱스 사용률 분석 테스트', () => {
    it('should analyze index usage correctly', async () => {
      // 테스트 데이터 추가
      await connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, project, created_at, updated_at, created_by, access_count, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['idx-test', 'Index test', 75, 'test-project', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'test', 0, 0]);

      const analysis = await optimizer.analyzeIndexUsage(connection);

      expect(analysis.usedIndexes).toBeDefined();
      expect(analysis.unusedIndexes).toBeDefined();
      expect(analysis.recommendations).toBeDefined();
      expect(Array.isArray(analysis.usedIndexes)).toBe(true);
      expect(Array.isArray(analysis.unusedIndexes)).toBe(true);
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });
  });

  describe('쿼리 프로파일링 테스트', () => {
    it('should profile query performance correctly', async () => {
      // 테스트 데이터 추가
      await connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, created_at, updated_at, created_by, access_count, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, ['profile-test', 'Profile test', 80, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'test', 0, 0]);

      const query = 'SELECT * FROM work_memories WHERE importance_score >= 70';
      const profile = await optimizer.profileQuery(connection, query);

      expect(profile.executionTime).toBeGreaterThan(0);
      expect(profile.rowsExamined).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(profile.indexesUsed)).toBe(true);
      expect(Array.isArray(profile.recommendations)).toBe(true);
      expect(profile.executionTime).toBeLessThan(100); // 100ms 이내
    });
  });
});
