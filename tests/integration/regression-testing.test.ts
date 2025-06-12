import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DatabaseConnection } from '../../src/database/connection.js';
import { initializeSchema } from '../../src/database/schema.js';
import { handleAddWorkMemory } from '../../src/tools/add-work-memory.js';
import { handleListWorkMemories } from '../../src/tools/list-work-memories.js';
import { handleSearchWorkMemory } from '../../src/tools/search-work-memory.js';

/**
 * 회귀 테스트 - 중요도 점수 시스템 도입 후 기존 기능 동작 확인
 * 
 * 테스트 목적:
 * 1. 기존 API 호환성 유지 확인
 * 2. 데이터 무결성 보장
 * 3. 성능 저하 없음 확인
 * 4. 기존 워크플로우 정상 동작 확인
 */

const TEST_DB_PATH = './test-regression.db';

describe('Regression Testing - Importance Score System', () => {
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

  describe('기존 API 호환성 테스트', () => {
    it('should maintain backward compatibility for add_work_memory without importance_score', async () => {
      // importance_score 없이 메모리 추가 (기존 방식)
      const result = await handleAddWorkMemory({
        content: 'Legacy memory without importance score',
        project: 'legacy-project',
        tags: ['legacy', 'test'],
        created_by: 'regression-test'
      });

      expect(result).toContain('✅ 새로운');
      expect(result).toContain('50점'); // 기본값 적용 확인
      expect(result).toContain('📌 보통'); // 중간 레벨 표시
    });

    it('should maintain backward compatibility for list_work_memories without score filters', async () => {
      // 테스트 데이터 추가
      await handleAddWorkMemory({
        content: 'Test memory 1',
        project: 'test-project',
        tags: ['test'],
        importance_score: 80,
        created_by: 'test'
      });

      await handleAddWorkMemory({
        content: 'Test memory 2',
        project: 'test-project',
        tags: ['test'],
        importance_score: 40,
        created_by: 'test'
      });

      // 기존 방식으로 리스트 조회 (필터 없음)
      const result = await handleListWorkMemories({
        project: 'test-project'
      });

      expect(result).toContain('Test memory 1');
      expect(result).toContain('Test memory 2');
      expect(result).toContain('총 2개');
      expect(result).toContain('📊 통계 정보');
    });

    it('should maintain backward compatibility for search_work_memory without score parameters', async () => {
      // 테스트 데이터 추가
      await handleAddWorkMemory({
        content: 'Searchable content for regression test',
        project: 'search-project',
        tags: ['searchable'],
        importance_score: 75,
        created_by: 'test'
      });

      // 기존 방식으로 검색 (점수 매개변수 없음)
      const result = await handleSearchWorkMemory({
        query: 'regression'
      });

      expect(result).toContain('Searchable content');
      expect(result).toContain('검색 결과');
      expect(result).not.toContain('[결합점수:'); // relevance 정렬이 아닐 때는 표시 안함
    });
  });

  describe('데이터 무결성 테스트', () => {
    it('should preserve existing data structure and relationships', async () => {
      // 복잡한 데이터 구조 생성
      await handleAddWorkMemory({
        content: 'Parent memory with context',
        project: 'integrity-project',
        tags: ['parent', 'context'],
        context: 'This is background context',
        requirements: 'Specific requirements here',
        result_content: 'Expected result content',
        work_type: 'todo',
        importance_score: 85,
        created_by: 'integrity-test'
      });

      // 데이터베이스에서 직접 확인
      const memory = await connection.get(`
        SELECT * FROM work_memories 
        WHERE created_by = 'integrity-test'
      `);

      // 모든 필드가 올바르게 저장되었는지 확인
      expect(memory.content).toBe('Parent memory with context');
      expect(memory.project).toBe('integrity-project');
      expect(JSON.parse(memory.tags)).toEqual(['parent', 'context']);
      expect(memory.context).toBe('This is background context');
      expect(memory.requirements).toBe('Specific requirements here');
      expect(memory.result_content).toBe('Expected result content');
      expect(memory.work_type).toBe('todo');
      expect(memory.importance_score).toBe(85);

      // 관련 테이블 데이터 확인
      const keywords = await connection.all(`
        SELECT * FROM search_keywords WHERE memory_id = ?
      `, [memory.id]);

      const projectIndex = await connection.get(`
        SELECT * FROM project_index WHERE project = ?
      `, ['integrity-project']);

      expect(keywords.length).toBeGreaterThan(0);
      expect(projectIndex.memory_count).toBe(1);
      expect(projectIndex.total_importance_score).toBe(85);
    });

    it('should maintain referential integrity across all tables', async () => {
      // 메모리 생성
      const addResult = await handleAddWorkMemory({
        content: 'Referential integrity test',
        project: 'ref-project',
        tags: ['reference', 'integrity'],
        importance_score: 70,
        created_by: 'ref-test'
      });

      // ID 추출 (간단한 정규식 사용)
      const idMatch = addResult.match(/ID: (mem_[a-zA-Z0-9_]+)/);
      expect(idMatch).not.toBeNull();
      const memoryId = idMatch![1];

      // 모든 관련 테이블에서 데이터 존재 확인
      const memory = await connection.get(`
        SELECT * FROM work_memories WHERE id = ?
      `, [memoryId]);

      const keywords = await connection.all(`
        SELECT * FROM search_keywords WHERE memory_id = ?
      `, [memoryId]);

      const projectIndex = await connection.get(`
        SELECT * FROM project_index WHERE project = ?
      `, ['ref-project']);

      const history = await connection.get(`
        SELECT * FROM change_history WHERE memory_id = ?
      `, [memoryId]);

      expect(memory).toBeDefined();
      expect(keywords.length).toBeGreaterThan(0);
      expect(projectIndex).toBeDefined();
      expect(history).toBeDefined();

      // 외래 키 관계 확인
      expect(keywords.every((k: any) => k.memory_id === memoryId)).toBe(true);
      expect(history.memory_id).toBe(memoryId);
    });
  });

  describe('성능 회귀 테스트', () => {
    it('should not degrade performance for basic operations', async () => {
      const iterations = 100;
      
      // 추가 성능 테스트
      const addStartTime = Date.now();
      for (let i = 0; i < iterations; i++) {
        await handleAddWorkMemory({
          content: `Performance test memory ${i}`,
          project: 'perf-project',
          tags: ['performance'],
          importance_score: Math.floor(Math.random() * 101),
          created_by: 'perf-test'
        });
      }
      const addTime = Date.now() - addStartTime;

      // 조회 성능 테스트
      const listStartTime = Date.now();
      const listResult = await handleListWorkMemories({
        project: 'perf-project',
        limit: 50
      });
      const listTime = Date.now() - listStartTime;

      // 검색 성능 테스트
      const searchStartTime = Date.now();
      const searchResult = await handleSearchWorkMemory({
        query: 'performance',
        limit: 20
      });
      const searchTime = Date.now() - searchStartTime;

      // 성능 기준 확인 (기존 대비 크게 느려지지 않아야 함)
      expect(addTime).toBeLessThan(10000); // 10초 내
      expect(listTime).toBeLessThan(1000);  // 1초 내
      expect(searchTime).toBeLessThan(2000); // 2초 내

      expect(listResult).toContain('총 100개');
      expect(searchResult).toContain('performance');

      console.log(`Performance Regression Test Results:
        - Add ${iterations} memories: ${addTime}ms
        - List memories: ${listTime}ms
        - Search memories: ${searchTime}ms`);
    });

    it('should maintain query performance with importance_score indexes', async () => {
      // 대량 데이터 삽입
      const dataSize = 500;
      for (let i = 0; i < dataSize; i++) {
        await connection.run(`
          INSERT INTO work_memories (
            id, content, importance_score, project, tags,
            created_at, updated_at, created_by, access_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `query-perf-${i}`, `Query performance test ${i}`,
          Math.floor(Math.random() * 101), 'query-project', '["query", "performance"]',
          '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'query-test', 0
        ]);
      }

      // 인덱스 활용 쿼리 성능 테스트
      const queries = [
        { name: 'High Score Filter', sql: 'SELECT * FROM work_memories WHERE importance_score >= 80' },
        { name: 'Score Range Filter', sql: 'SELECT * FROM work_memories WHERE importance_score BETWEEN 30 AND 70' },
        { name: 'Score Sort', sql: 'SELECT * FROM work_memories ORDER BY importance_score DESC LIMIT 50' },
        { name: 'Combined Filter', sql: 'SELECT * FROM work_memories WHERE importance_score >= 50 AND project = ? ORDER BY importance_score DESC' }
      ];

      for (const query of queries) {
        const startTime = Date.now();
        
        if (query.name === 'Combined Filter') {
          await connection.all(query.sql, ['query-project']);
        } else {
          await connection.all(query.sql);
        }
        
        const queryTime = Date.now() - startTime;
        expect(queryTime).toBeLessThan(100); // 100ms 내
        
        console.log(`${query.name}: ${queryTime}ms`);
      }
    });
  });

  describe('기존 워크플로우 동작 확인', () => {
    it('should support complete workflow: create -> list -> search -> update', async () => {
      // 1. 메모리 생성 (기존 + 새로운 필드)
      const createResult = await handleAddWorkMemory({
        content: 'Workflow test memory',
        project: 'workflow-project',
        tags: ['workflow', 'test'],
        context: 'Testing complete workflow',
        work_type: 'todo',
        importance_score: 65,
        created_by: 'workflow-test'
      });

      expect(createResult).toContain('✅ 새로운 할일이');
      expect(createResult).toContain('65점');

      // 2. 리스트 조회
      const listResult = await handleListWorkMemories({
        project: 'workflow-project',
        sort_by: 'importance_score',
        sort_order: 'desc'
      });

      expect(listResult).toContain('Workflow test memory');
      expect(listResult).toContain('📌 보통 (65점)');

      // 3. 검색
      const searchResult = await handleSearchWorkMemory({
        query: 'workflow',
        min_importance_score: 60
      });

      expect(searchResult).toContain('Workflow test memory');
      expect(searchResult).toContain('중요도 분포');

      // 4. 메모리 업데이트 (간접적으로 access_count 증가 확인)
      const memoryId = createResult.match(/ID: (mem_[a-zA-Z0-9_]+)/)?.[1];
      expect(memoryId).toBeDefined();

      // access_count 직접 업데이트로 업데이트 기능 시뮬레이션
      await connection.run(`
        UPDATE work_memories 
        SET access_count = access_count + 1, updated_at = ?
        WHERE id = ?
      `, [new Date().toISOString(), memoryId]);

      const updatedMemory = await connection.get(`
        SELECT access_count FROM work_memories WHERE id = ?
      `, [memoryId]);

      expect(updatedMemory.access_count).toBe(1);
    });

    it('should maintain todo/memory workflow distinctions', async () => {
      // 메모리 타입 생성
      const memoryResult = await handleAddWorkMemory({
        content: 'This is a memory entry',
        project: 'type-project',
        tags: ['memory'],
        work_type: 'memory',
        importance_score: 50,
        created_by: 'type-test'
      });

      // 할일 타입 생성
      const todoResult = await handleAddWorkMemory({
        content: 'This is a todo entry',
        project: 'type-project',
        tags: ['todo'],
        context: 'Todo context is required',
        work_type: 'todo',
        importance_score: 75,
        created_by: 'type-test'
      });

      expect(memoryResult).toContain('💭');
      expect(memoryResult).toContain('메모리');
      expect(todoResult).toContain('📋');
      expect(todoResult).toContain('할일');

      // 타입별 검색
      const memorySearch = await handleSearchWorkMemory({
        query: 'entry',
        work_type: 'memory'
      });

      const todoSearch = await handleSearchWorkMemory({
        query: 'entry',
        work_type: 'todo'
      });

      expect(memorySearch).toContain('This is a memory entry');
      expect(memorySearch).not.toContain('This is a todo entry');
      expect(todoSearch).toContain('This is a todo entry');
      expect(todoSearch).not.toContain('This is a memory entry');
    });
  });

  describe('오류 처리 및 복구 테스트', () => {
    it('should handle database constraints gracefully', async () => {
      // 잘못된 importance_score 값 테스트
      const invalidResult = await handleAddWorkMemory({
        content: 'Invalid score test',
        importance_score: 150, // 잘못된 값
        created_by: 'error-test'
      });

      expect(invalidResult).toContain('❌');
      expect(invalidResult).toContain('0-100 범위여야');

      // 유효한 값으로 재시도
      const validResult = await handleAddWorkMemory({
        content: 'Valid score test',
        importance_score: 75,
        created_by: 'error-test'
      });

      expect(validResult).toContain('✅');
    });

    it('should recover from partial failures', async () => {
      // 정상적인 메모리 생성 후 일부 관련 데이터 손상 시뮬레이션
      await handleAddWorkMemory({
        content: 'Recovery test memory',
        project: 'recovery-project',
        tags: ['recovery'],
        importance_score: 80,
        created_by: 'recovery-test'
      });

      // 검색 키워드 테이블에서 일부 데이터 삭제 (손상 시뮬레이션)
      await connection.run(`
        DELETE FROM search_keywords WHERE keyword = 'recovery'
      `);

      // 시스템이 여전히 동작하는지 확인
      const listResult = await handleListWorkMemories({
        project: 'recovery-project'
      });

      const searchResult = await handleSearchWorkMemory({
        query: 'recovery'
      });

      expect(listResult).toContain('Recovery test memory');
      // 검색에서는 키워드가 없어서 찾지 못할 수 있음 (정상적인 동작)
      expect(searchResult).toContain('검색 결과');
    });
  });

  describe('마이그레이션 시나리오 테스트', () => {
    it('should handle mixed old and new data correctly', async () => {
      // 기존 데이터 시뮬레이션 (importance_score = 50 기본값)
      await connection.run(`
        INSERT INTO work_memories (
          id, content, project, tags, importance_score,
          created_at, updated_at, created_by, access_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'old-mem-1', 'Old memory with default score', 'old-project', '["old"]', 50,
        '2023-12-01T00:00:00Z', '2023-12-01T00:00:00Z', 'old-user', 5
      ]);

      // 새로운 데이터 추가
      await handleAddWorkMemory({
        content: 'New memory with explicit score',
        project: 'new-project',
        tags: ['new'],
        importance_score: 85,
        created_by: 'new-user'
      });

      // 혼재된 데이터 조회
      const mixedResult = await handleListWorkMemories({
        sort_by: 'importance_score',
        sort_order: 'desc'
      });

      expect(mixedResult).toContain('New memory with explicit score');
      expect(mixedResult).toContain('Old memory with default score');
      expect(mixedResult).toContain('총 2개');

      // 통계가 올바르게 계산되는지 확인
      expect(mixedResult).toContain('평균 중요도: 67점'); // (85 + 50) / 2 = 67.5 -> 68
    });
  });
});
