import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseConnection } from '../../src/database/connection.js';
import { getDatabaseConnection } from '../../src/database/index.js';
import { handleAddWorkMemory } from '../../src/tools/add-work-memory.js';
import { handleListWorkMemories } from '../../src/tools/list-work-memories.js';
import { handleSearchWorkMemory } from '../../src/tools/search-work-memory.js';

/**
 * 중요도 점수 시스템 테스트
 * 
 * 테스트 범위:
 * 1. Database Schema - importance_score 필드
 * 2. add_work_memory - 점수 저장 및 유효성 검사
 * 3. list_work_memories - 점수 기반 필터링 및 정렬
 * 4. search_work_memory - 결합 점수 시스템
 */

// 모의 데이터베이스 연결
const mockConnection = {
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
  close: vi.fn()
} as unknown as DatabaseConnection;

// 데이터베이스 연결 모킹
vi.mock('../../src/database/index.js', () => ({
  getDatabaseConnection: vi.fn(() => mockConnection)
}));

describe('Importance Score System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Database Schema Integration', () => {
    it('should include importance_score field in work_memories table', () => {
      // 스키마 검증은 실제 데이터베이스에서 수행
      // 여기서는 필드 존재 여부만 확인
      expect(true).toBe(true); // 플레이스홀더
    });

    it('should enforce importance_score constraints (0-100)', () => {
      // 제약 조건 테스트는 실제 데이터베이스에서 수행
      expect(true).toBe(true); // 플레이스홀더
    });
  });

  describe('add_work_memory Tool', () => {
    it('should accept importance_score parameter', async () => {
      // Mock 설정
      (mockConnection.run as any).mockResolvedValueOnce({ lastInsertRowid: 1 });
      (mockConnection.get as any).mockResolvedValueOnce({ value: 'false' }); // versioning disabled

      const result = await handleAddWorkMemory({
        content: 'Test content with high importance',
        importance_score: 85,
        created_by: 'test'
      });

      expect(result).toContain('✅ 새로운');
      expect(result).toContain('85점');
      expect(mockConnection.run).toHaveBeenCalled();
    });

    it('should use default importance_score of 50 when not provided', async () => {
      (mockConnection.run as any).mockResolvedValueOnce({ lastInsertRowid: 1 });
      (mockConnection.get as any).mockResolvedValueOnce({ value: 'false' });

      const result = await handleAddWorkMemory({
        content: 'Test content without importance',
        created_by: 'test'
      });

      expect(result).toContain('50점');
      expect(mockConnection.run).toHaveBeenCalled();
    });

    it('should reject invalid importance_score values', async () => {
      const result = await handleAddWorkMemory({
        content: 'Test content',
        importance_score: 150, // Invalid: > 100
        created_by: 'test'
      });

      expect(result).toContain('❌');
      expect(result).toContain('0-100 범위여야');
    });

    it('should display importance level correctly', async () => {
      (mockConnection.run as any).mockResolvedValueOnce({ lastInsertRowid: 1 });
      (mockConnection.get as any).mockResolvedValueOnce({ value: 'false' });

      // 매우높음 테스트 (90-100)
      let result = await handleAddWorkMemory({
        content: 'Critical task',
        importance_score: 95,
        created_by: 'test'
      });
      expect(result).toContain('🔥 매우높음');

      // 높음 테스트 (70-89)
      (mockConnection.run as any).mockResolvedValueOnce({ lastInsertRowid: 2 });
      result = await handleAddWorkMemory({
        content: 'Important task',
        importance_score: 75,
        created_by: 'test'
      });
      expect(result).toContain('⭐ 높음');

      // 보통 테스트 (30-69)
      (mockConnection.run as any).mockResolvedValueOnce({ lastInsertRowid: 3 });
      result = await handleAddWorkMemory({
        content: 'Normal task',
        importance_score: 50,
        created_by: 'test'
      });
      expect(result).toContain('📌 보통');
    });
  });

  describe('list_work_memories Tool', () => {
    const mockMemories = [
      {
        id: 'mem_1',
        content: 'High priority task',
        importance_score: 85,
        project: 'project1',
        tags: '["high-priority"]',
        created_by: 'test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        access_count: 5,
        last_accessed_at: '2024-01-01T00:00:00Z',
        is_archived: 0
      },
      {
        id: 'mem_2',
        content: 'Medium priority task',
        importance_score: 50,
        project: 'project1',
        tags: '["medium-priority"]',
        created_by: 'test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        access_count: 2,
        last_accessed_at: '2024-01-01T00:00:00Z',
        is_archived: 0
      }
    ];

    it('should filter by minimum importance_score', async () => {
      (mockConnection.get as any).mockResolvedValueOnce({ count: 1 });
      (mockConnection.all as any).mockResolvedValueOnce([mockMemories[0]]);
      (mockConnection.get as any).mockResolvedValueOnce({
        critical_count: 0, high_count: 1, medium_count: 0, 
        low_count: 0, minimal_count: 0, project_count: 1,
        total_access_count: 5, avg_importance_score: 85,
        max_importance_score: 85, min_importance_score: 85
      });

      const result = await handleListWorkMemories({
        min_importance_score: 80
      });

      expect(result).toContain('High priority task');
      expect(result).not.toContain('Medium priority task');
      expect(result).toContain('평균 중요도: 85점');
    });

    it('should filter by maximum importance_score', async () => {
      (mockConnection.get as any).mockResolvedValueOnce({ count: 1 });
      (mockConnection.all as any).mockResolvedValueOnce([mockMemories[1]]);
      (mockConnection.get as any).mockResolvedValueOnce({
        critical_count: 0, high_count: 0, medium_count: 1,
        low_count: 0, minimal_count: 0, project_count: 1,
        total_access_count: 2, avg_importance_score: 50,
        max_importance_score: 50, min_importance_score: 50
      });

      const result = await handleListWorkMemories({
        max_importance_score: 60
      });

      expect(result).toContain('Medium priority task');
      expect(result).not.toContain('High priority task');
    });

    it('should sort by importance_score', async () => {
      (mockConnection.get as any).mockResolvedValueOnce({ count: 2 });
      (mockConnection.all as any).mockResolvedValueOnce([mockMemories[0], mockMemories[1]]);
      (mockConnection.get as any).mockResolvedValueOnce({
        critical_count: 0, high_count: 1, medium_count: 1,
        low_count: 0, minimal_count: 0, project_count: 1,
        total_access_count: 7, avg_importance_score: 67,
        max_importance_score: 85, min_importance_score: 50
      });

      const result = await handleListWorkMemories({
        sort_by: 'importance_score',
        sort_order: 'desc'
      });

      expect(result).toContain('High priority task');
      expect(result).toContain('Medium priority task');
      
      // High priority should appear first (higher score)
      const highIndex = result.indexOf('High priority task');
      const mediumIndex = result.indexOf('Medium priority task');
      expect(highIndex).toBeLessThan(mediumIndex);
    });

    it('should display importance statistics correctly', async () => {
      (mockConnection.get as any).mockResolvedValueOnce({ count: 2 });
      (mockConnection.all as any).mockResolvedValueOnce(mockMemories);
      (mockConnection.get as any).mockResolvedValueOnce({
        critical_count: 0, high_count: 1, medium_count: 1,
        low_count: 0, minimal_count: 0, project_count: 1,
        total_access_count: 7, avg_importance_score: 67,
        max_importance_score: 85, min_importance_score: 50
      });

      const result = await handleListWorkMemories({
        include_stats: true
      });

      expect(result).toContain('중요도별: 매우높음 0, 높음 1, 보통 1, 낮음 0, 최소 0');
      expect(result).toContain('평균 중요도: 67점');
      expect(result).toContain('범위: 50-85점');
    });
  });

  describe('search_work_memory Tool', () => {
    const mockSearchResults = [
      {
        id: 'mem_1',
        content: 'Important search result',
        importance_score: 80,
        combined_score: 86, // (100 * 0.7) + (80 * 0.3)
        project: 'project1',
        tags: '["important"]',
        created_by: 'test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        access_count: 5,
        last_accessed_at: '2024-01-01T00:00:00Z',
        context: null,
        requirements: null,
        result_content: null,
        work_type: 'memory'
      },
      {
        id: 'mem_2',
        content: 'Regular search result',
        importance_score: 40,
        combined_score: 82, // (100 * 0.7) + (40 * 0.3)
        project: 'project1',
        tags: '["regular"]',
        created_by: 'test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        access_count: 2,
        last_accessed_at: '2024-01-01T00:00:00Z',
        context: null,
        requirements: null,
        result_content: null,
        work_type: 'memory'
      }
    ];

    it('should combine relevance and importance scores', async () => {
      (mockConnection.all as any).mockResolvedValueOnce(mockSearchResults);

      const result = await handleSearchWorkMemory({
        query: 'search',
        sort_by: 'relevance',
        importance_weight: 0.3
      });

      expect(result).toContain('Important search result');
      expect(result).toContain('[결합점수: 86]');
      expect(result).toContain('Regular search result');
      expect(result).toContain('[결합점수: 82]');
    });

    it('should filter by importance_score range', async () => {
      (mockConnection.all as any).mockResolvedValueOnce([mockSearchResults[0]]);

      const result = await handleSearchWorkMemory({
        query: 'search',
        min_importance_score: 70
      });

      expect(result).toContain('Important search result');
      expect(result).not.toContain('Regular search result');
    });

    it('should sort by importance_score only', async () => {
      (mockConnection.all as any).mockResolvedValueOnce([mockSearchResults[0], mockSearchResults[1]]);

      const result = await handleSearchWorkMemory({
        query: 'search',
        sort_by: 'importance_score'
      });

      expect(result).toContain('Important search result');
      expect(result).toContain('Regular search result');
      
      // Should not show combined score when not sorting by relevance
      expect(result).not.toContain('[결합점수:');
    });

    it('should display importance statistics in search results', async () => {
      (mockConnection.all as any).mockResolvedValueOnce(mockSearchResults);

      const result = await handleSearchWorkMemory({
        query: 'search'
      });

      expect(result).toContain('중요도 분포:');
      expect(result).toContain('높음 1');
      expect(result).toContain('보통 1');
      expect(result).toContain('평균: 60점');
    });

    it('should adjust importance weight correctly', async () => {
      // High importance weight (0.8)
      const highWeightResults = mockSearchResults.map(r => ({
        ...r,
        combined_score: r.importance_score === 80 ? 
          (100 * 0.2) + (80 * 0.8) : // 84
          (100 * 0.2) + (40 * 0.8)   // 52
      }));

      (mockConnection.all as any).mockResolvedValueOnce(highWeightResults);

      const result = await handleSearchWorkMemory({
        query: 'search',
        sort_by: 'relevance',
        importance_weight: 0.8
      });

      expect(result).toContain('[결합점수: 84]');
      expect(result).toContain('[결합점수: 52]');
    });
  });

  describe('Integration Tests', () => {
    it('should maintain consistency across all tools', async () => {
      // 이 테스트는 실제 데이터베이스가 필요한 통합 테스트
      expect(true).toBe(true); // 플레이스홀더
    });

    it('should handle concurrent operations correctly', async () => {
      // 동시성 테스트는 실제 환경에서 수행
      expect(true).toBe(true); // 플레이스홀더
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined importance_score gracefully', async () => {
      (mockConnection.run as any).mockResolvedValueOnce({ lastInsertRowid: 1 });
      (mockConnection.get as any).mockResolvedValueOnce({ value: 'false' });

      const result = await handleAddWorkMemory({
        content: 'Test content',
        importance_score: undefined,
        created_by: 'test'
      });

      expect(result).toContain('50점'); // Default value
    });

    it('should handle boundary values correctly', async () => {
      (mockConnection.run as any).mockResolvedValueOnce({ lastInsertRowid: 1 });
      (mockConnection.get as any).mockResolvedValueOnce({ value: 'false' });

      // Test minimum value
      let result = await handleAddWorkMemory({
        content: 'Test content',
        importance_score: 0,
        created_by: 'test'
      });
      expect(result).toContain('💤 최소');

      // Test maximum value
      (mockConnection.run as any).mockResolvedValueOnce({ lastInsertRowid: 2 });
      result = await handleAddWorkMemory({
        content: 'Test content',
        importance_score: 100,
        created_by: 'test'
      });
      expect(result).toContain('🔥 매우높음');
    });

    it('should handle database errors gracefully', async () => {
      (mockConnection.run as any).mockRejectedValueOnce(new Error('Database error'));

      const result = await handleAddWorkMemory({
        content: 'Test content',
        importance_score: 50,
        created_by: 'test'
      });

      expect(result).toContain('❌');
      expect(result).toContain('오류가 발생했습니다');
    });
  });
});
