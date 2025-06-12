import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DatabaseConnection } from '../../src/database/connection.js';
import { initializeSchema } from '../../src/database/schema.js';

/**
 * 중요도 점수 시스템 통합 테스트
 * 
 * 실제 SQLite 데이터베이스를 사용하여 전체 시스템이 
 * 올바르게 작동하는지 확인합니다.
 */

const TEST_DB_PATH = './test-importance-score.db';

describe('Importance Score System Integration', () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    // 테스트 데이터베이스 초기화
    connection = new DatabaseConnection(TEST_DB_PATH);
    await connection.connect();
    await initializeSchema(connection);
  });

  afterAll(async () => {
    // 테스트 데이터베이스 정리
    await connection.close();
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch {
      // 파일이 없으면 무시
    }
  });

  beforeEach(async () => {
    // 각 테스트 전에 테이블 정리
    await connection.run('DELETE FROM work_memories');
    await connection.run('DELETE FROM search_keywords');
    await connection.run('DELETE FROM project_index');
    await connection.run('DELETE FROM change_history');
  });

  describe('Database Schema Integration', () => {
    it('should create work_memories table with importance_score field', async () => {
      const tableInfo = await connection.all("PRAGMA table_info(work_memories)");
      const columns = tableInfo.map((col: any) => col.name);
      
      expect(columns).toContain('importance_score');
      
      // importance_score 컬럼 정보 확인
      const importanceColumn = tableInfo.find((col: any) => col.name === 'importance_score');
      expect(importanceColumn.type).toBe('INTEGER');
      expect(importanceColumn.dflt_value).toBe('50');
    });

    it('should enforce importance_score constraints', async () => {
      // 유효한 값 테스트
      await expect(connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `, ['test-1', 'Test content', 50, '2024-01-01', '2024-01-01']))
        .resolves.not.toThrow();

      // 경계값 테스트
      await expect(connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `, ['test-2', 'Test content', 0, '2024-01-01', '2024-01-01']))
        .resolves.not.toThrow();

      await expect(connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `, ['test-3', 'Test content', 100, '2024-01-01', '2024-01-01']))
        .resolves.not.toThrow();

      // 제약 조건 위반 테스트
      await expect(connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `, ['test-4', 'Test content', -1, '2024-01-01', '2024-01-01']))
        .rejects.toThrow();

      await expect(connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
      `, ['test-5', 'Test content', 101, '2024-01-01', '2024-01-01']))
        .rejects.toThrow();
    });

    it('should create importance_score indexes', async () => {
      const indexes = await connection.all(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name LIKE '%importance_score%'
      `);
      
      expect(indexes.length).toBeGreaterThan(0);
      expect(indexes.map((idx: any) => idx.name)).toContain('idx_work_memories_importance_score');
    });
  });

  describe('Full Workflow Integration', () => {
    it('should create, list, and search memories with importance scores', async () => {
      // 1. 다양한 중요도 점수로 메모리 생성
      const memories = [
        { id: 'mem-1', content: 'Critical task', score: 95 },
        { id: 'mem-2', content: 'Important task', score: 75 },
        { id: 'mem-3', content: 'Normal task', score: 50 },
        { id: 'mem-4', content: 'Low priority task', score: 25 },
        { id: 'mem-5', content: 'Minimal task', score: 5 }
      ];

      for (const memory of memories) {
        await connection.run(`
          INSERT INTO work_memories (
            id, content, importance_score, project, tags,
            created_at, updated_at, created_by, access_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          memory.id, memory.content, memory.score, 'test-project', '["test"]',
          '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'test', 0
        ]);
      }

      // 2. 리스트 조회 - 중요도 순 정렬
      const listResult = await connection.all(`
        SELECT id, content, importance_score 
        FROM work_memories 
        ORDER BY importance_score DESC
      `);

      expect(listResult).toHaveLength(5);
      expect(listResult[0].id).toBe('mem-1'); // 가장 높은 점수
      expect(listResult[4].id).toBe('mem-5'); // 가장 낮은 점수

      // 3. 필터링 테스트 - 중요도 70 이상
      const highPriorityResult = await connection.all(`
        SELECT id, content, importance_score 
        FROM work_memories 
        WHERE importance_score >= 70
        ORDER BY importance_score DESC
      `);

      expect(highPriorityResult).toHaveLength(2);
      expect(highPriorityResult.map((m: any) => m.id)).toEqual(['mem-1', 'mem-2']);

      // 4. 검색 테스트 - 결합 점수 계산
      const searchWeight = 0.3;
      const searchResult = await connection.all(`
        SELECT id, content, importance_score,
               ((100 * ?) + (importance_score * ?)) as combined_score
        FROM work_memories 
        WHERE content LIKE ?
        ORDER BY combined_score DESC
      `, [1 - searchWeight, searchWeight, '%task%']);

      expect(searchResult).toHaveLength(5);
      expect(searchResult[0].id).toBe('mem-1'); // 가장 높은 결합 점수
    });

    it('should maintain data consistency across operations', async () => {
      // 메모리 생성
      await connection.run(`
        INSERT INTO work_memories (
          id, content, importance_score, project, tags,
          created_at, updated_at, created_by, access_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'mem-test', 'Test consistency', 80, 'consistency-project', '["test", "consistency"]',
        '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'test', 0
      ]);

      // 검색 키워드 추가
      await connection.run(`
        INSERT INTO search_keywords (memory_id, keyword, source, weight)
        VALUES (?, ?, ?, ?)
      `, ['mem-test', 'consistency', 'tags', 2.0]);

      // 프로젝트 인덱스 업데이트
      await connection.run(`
        INSERT INTO project_index (
          project, memory_count, total_importance_score, last_updated
        ) VALUES (?, ?, ?, ?)
      `, ['consistency-project', 1, 80, '2024-01-01T00:00:00Z']);

      // 일관성 확인
      const memory = await connection.get(`
        SELECT * FROM work_memories WHERE id = ?
      `, ['mem-test']);

      const keyword = await connection.get(`
        SELECT * FROM search_keywords WHERE memory_id = ?
      `, ['mem-test']);

      const project = await connection.get(`
        SELECT * FROM project_index WHERE project = ?
      `, ['consistency-project']);

      expect(memory.importance_score).toBe(80);
      expect(keyword.keyword).toBe('consistency');
      expect(project.total_importance_score).toBe(80);
    });
  });

  describe('Migration Testing', () => {
    it('should handle existing data migration', async () => {
      // 기존 데이터 시뮬레이션 (importance_score 없음)
      await connection.run(`
        INSERT INTO work_memories (
          id, content, project, tags, created_at, updated_at, created_by, access_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'old-mem', 'Old memory', 'old-project', '["old"]',
        '2023-12-01T00:00:00Z', '2023-12-01T00:00:00Z', 'old-user', 5
      ]);

      // importance_score 필드가 기본값으로 설정되었는지 확인
      const result = await connection.get(`
        SELECT importance_score FROM work_memories WHERE id = ?
      `, ['old-mem']);

      expect(result.importance_score).toBe(50); // 기본값
    });
  });

  describe('Performance Testing', () => {
    it('should perform well with large datasets', async () => {
      const startTime = Date.now();

      // 대량 데이터 삽입 (1000개)
      const insertPromises = [];
      for (let i = 0; i < 1000; i++) {
        const promise = connection.run(`
          INSERT INTO work_memories (
            id, content, importance_score, project, tags,
            created_at, updated_at, created_by, access_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `perf-mem-${i}`, `Performance test content ${i}`,
          Math.floor(Math.random() * 101), // 0-100 랜덤 점수
          `project-${i % 10}`, '["performance", "test"]',
          '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'perf-test', 0
        ]);
        insertPromises.push(promise);
      }

      await Promise.all(insertPromises);
      const insertTime = Date.now() - startTime;

      // 조회 성능 테스트
      const queryStartTime = Date.now();
      
      const highScoreResults = await connection.all(`
        SELECT id, content, importance_score 
        FROM work_memories 
        WHERE importance_score >= 80
        ORDER BY importance_score DESC
        LIMIT 100
      `);

      const queryTime = Date.now() - queryStartTime;

      // 성능 기준 확인 (예시)
      expect(insertTime).toBeLessThan(5000); // 5초 내 삽입
      expect(queryTime).toBeLessThan(100);   // 100ms 내 조회
      expect(highScoreResults.length).toBeGreaterThan(0);

      console.log(`Performance Test Results:
        - Insert Time: ${insertTime}ms for 1000 records
        - Query Time: ${queryTime}ms for filtered results
        - High Score Count: ${highScoreResults.length}`);
    });

    it('should handle concurrent operations efficiently', async () => {
      const concurrentOps = 50;
      const startTime = Date.now();

      // 동시 삽입 테스트
      const promises = Array.from({ length: concurrentOps }, (_, i) =>
        connection.run(`
          INSERT INTO work_memories (
            id, content, importance_score, created_at, updated_at, created_by
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          `concurrent-${i}`, `Concurrent test ${i}`,
          Math.floor(Math.random() * 101),
          '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'concurrent-test'
        ])
      );

      await Promise.all(promises);
      const concurrentTime = Date.now() - startTime;

      // 결과 확인
      const count = await connection.get(`
        SELECT COUNT(*) as count FROM work_memories 
        WHERE created_by = 'concurrent-test'
      `);

      expect(count.count).toBe(concurrentOps);
      expect(concurrentTime).toBeLessThan(2000); // 2초 내 완료

      console.log(`Concurrent Operations Test:
        - ${concurrentOps} operations completed in ${concurrentTime}ms`);
    });
  });
});
