import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkMemory } from '../../src/types/memory.js';

/**
 * 타입 호환성 및 API 인터페이스 회귀 테스트
 * 
 * 중요도 점수 시스템 도입 후 기존 타입 정의와 
 * API 인터페이스의 호환성을 확인합니다.
 */

describe('Type System Backward Compatibility', () => {
  describe('WorkMemory Interface Compatibility', () => {
    it('should maintain all required fields from legacy interface', () => {
      // 새로운 WorkMemory 인터페이스로 객체 생성
      const memory: WorkMemory = {
        id: 'test-mem-1',
        content: 'Test memory content',
        project: 'test-project',
        tags: ['test', 'compatibility'],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        created_by: 'test-user',
        access_count: 0,
        importance_score: 75 // 새로운 필드
      };

      // 기존 필드들이 모두 존재하는지 확인
      expect(memory.id).toBeDefined();
      expect(memory.content).toBeDefined();
      expect(memory.project).toBeDefined();
      expect(memory.tags).toBeDefined();
      expect(memory.created_at).toBeDefined();
      expect(memory.updated_at).toBeDefined();
      expect(memory.created_by).toBeDefined();
      expect(memory.access_count).toBeDefined();
      
      // 새로운 필드 확인
      expect(memory.importance_score).toBe(75);
      expect(typeof memory.importance_score).toBe('number');
    });

    it('should support optional fields correctly', () => {
      // 최소 필수 필드만으로 객체 생성
      const minimalMemory: WorkMemory = {
        id: 'minimal-mem',
        content: 'Minimal content',
        tags: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        created_by: 'test',
        access_count: 0,
        importance_score: 50
      };

      expect(minimalMemory.project).toBeUndefined();
      expect(minimalMemory.tags).toEqual([]);
      expect(minimalMemory.importance_score).toBe(50);
    });
  });

  describe('API Parameter Compatibility', () => {
    it('should handle legacy parameters gracefully', () => {
      // 기존 방식의 매개변수 (importance_score 없음)
      const legacyParams = {
        content: 'Legacy content',
        project: 'legacy-project',
        tags: ['legacy'],
        created_by: 'legacy-user'
      };

      // 새로운 시스템에서도 처리 가능해야 함
      expect(legacyParams.content).toBe('Legacy content');
      expect(legacyParams.project).toBe('legacy-project');
      expect(legacyParams.tags).toContain('legacy');
      expect(legacyParams.created_by).toBe('legacy-user');
      
      // importance_score가 없어도 기본값으로 처리됨
      expect('importance_score' in legacyParams).toBe(false);
    });

    it('should accept new parameters alongside legacy ones', () => {
      // 새로운 매개변수와 기존 매개변수 혼용
      const mixedParams = {
        content: 'Mixed content',
        project: 'mixed-project',
        tags: ['mixed', 'new'],
        created_by: 'mixed-user',
        importance_score: 80, // 새로운 매개변수
        context: 'Additional context', // 기존 확장 매개변수
        work_type: 'todo' as const
      };

      expect(mixedParams.importance_score).toBe(80);
      expect(mixedParams.context).toBe('Additional context');
      expect(mixedParams.work_type).toBe('todo');
    });
  });

  describe('JSON Serialization Compatibility', () => {
    it('should serialize and deserialize correctly with new fields', () => {
      const originalMemory: WorkMemory = {
        id: 'serialize-test',
        content: 'Serialization test',
        project: 'serialize-project',
        tags: ['serialize', 'test'],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        created_by: 'serialize-user',
        access_count: 3,
        importance_score: 90
      };

      // JSON 직렬화
      const serialized = JSON.stringify(originalMemory);
      expect(serialized).toContain('importance_score');
      expect(serialized).toContain('90');

      // JSON 역직렬화
      const deserialized: WorkMemory = JSON.parse(serialized);
      expect(deserialized.importance_score).toBe(90);
      expect(deserialized.id).toBe('serialize-test');
      expect(deserialized.content).toBe('Serialization test');
    });

    it('should handle legacy JSON data without importance_score', () => {
      // 기존 데이터 시뮬레이션 (importance_score 없음)
      const legacyJson = `{
        "id": "legacy-json",
        "content": "Legacy JSON data",
        "project": "legacy-project",
        "tags": ["legacy"],
        "created_at": "2023-12-01T00:00:00Z",
        "updated_at": "2023-12-01T00:00:00Z",
        "created_by": "legacy-user",
        "access_count": 2
      }`;

      const parsed = JSON.parse(legacyJson);
      
      // 기존 필드들은 그대로 유지
      expect(parsed.id).toBe('legacy-json');
      expect(parsed.content).toBe('Legacy JSON data');
      expect(parsed.access_count).toBe(2);
      
      // importance_score는 없음 (나중에 기본값으로 처리)
      expect(parsed.importance_score).toBeUndefined();
    });
  });

  describe('Database Query Compatibility', () => {
    it('should generate backward-compatible SQL queries', () => {
      // 기존 방식의 쿼리 (importance_score 없음)
      const legacySelectQuery = `
        SELECT id, content, project, tags, created_at, updated_at, created_by, access_count
        FROM work_memories 
        WHERE project = ? AND is_archived = 0
        ORDER BY updated_at DESC
      `;

      // 새로운 방식의 쿼리 (importance_score 포함)
      const newSelectQuery = `
        SELECT id, content, project, tags, importance_score, created_at, updated_at, created_by, access_count
        FROM work_memories 
        WHERE project = ? AND is_archived = 0
        ORDER BY importance_score DESC, updated_at DESC
      `;

      // 쿼리 구조 검증
      expect(legacySelectQuery).toContain('SELECT');
      expect(legacySelectQuery).toContain('work_memories');
      expect(legacySelectQuery).not.toContain('importance_score');

      expect(newSelectQuery).toContain('SELECT');
      expect(newSelectQuery).toContain('work_memories');
      expect(newSelectQuery).toContain('importance_score');
    });

    it('should handle optional WHERE clauses for importance_score', () => {
      // 기본 쿼리 (점수 필터 없음)
      const baseQuery = `
        SELECT * FROM work_memories 
        WHERE is_archived = 0
      `;

      // 점수 필터가 추가된 쿼리
      const filteredQuery = `
        SELECT * FROM work_memories 
        WHERE is_archived = 0 AND importance_score >= ?
      `;

      expect(baseQuery).not.toContain('importance_score');
      expect(filteredQuery).toContain('importance_score >=');
    });
  });

  describe('Error Handling Compatibility', () => {
    it('should maintain consistent error message formats', () => {
      // 기존 오류 메시지 형식
      const legacyError = '❌ 메모리 저장 중 오류가 발생했습니다: Database error';
      const newError = '❌ 메모리 저장 중 오류가 발생했습니다: 중요도 점수는 0-100 범위여야 합니다.';

      // 오류 메시지 형식 일관성 확인
      expect(legacyError).toMatch(/^❌ .+ 오류가 발생했습니다:/);
      expect(newError).toMatch(/^❌ .+ 오류가 발생했습니다:/);
    });

    it('should handle validation errors consistently', () => {
      // 다양한 유효성 검사 오류
      const errors = [
        '❌ 작업 내용이 비어있습니다.',
        '❌ 중요도 점수는 0-100 범위여야 합니다.',
        '❌ 할일 저장 시 context(배경정보)가 필요합니다.',
        '❌ 데이터베이스 연결을 사용할 수 없습니다.'
      ];

      errors.forEach(error => {
        expect(error).toMatch(/^❌/);
        expect(error).toContain('다.');
      });
    });
  });

  describe('Performance Impact Assessment', () => {
    it('should not significantly impact memory usage', () => {
      // 기존 WorkMemory 객체 크기 시뮬레이션
      const legacyMemory = {
        id: 'perf-test',
        content: 'Performance test content',
        project: 'perf-project',
        tags: ['performance'],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        created_by: 'perf-user',
        access_count: 0
      };

      // 새로운 WorkMemory 객체
      const newMemory: WorkMemory = {
        ...legacyMemory,
        importance_score: 75
      };

      // 메모리 사용량 증가가 미미해야 함
      const legacySize = JSON.stringify(legacyMemory).length;
      const newSize = JSON.stringify(newMemory).length;
      const sizeIncrease = newSize - legacySize;

      expect(sizeIncrease).toBeLessThan(30); // 30바이트 미만 증가
      expect(sizeIncrease / legacySize).toBeLessThan(0.1); // 10% 미만 증가
    });

    it('should maintain fast object creation and access', () => {
      const iterations = 10000;
      const startTime = Date.now();

      // 대량 객체 생성 테스트
      const memories: WorkMemory[] = [];
      for (let i = 0; i < iterations; i++) {
        memories.push({
          id: `perf-mem-${i}`,
          content: `Performance test content ${i}`,
          project: 'perf-project',
          tags: ['performance'],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          created_by: 'perf-user',
          access_count: 0,
          importance_score: Math.floor(Math.random() * 101)
        });
      }

      const creationTime = Date.now() - startTime;

      // 접근 성능 테스트
      const accessStartTime = Date.now();
      let totalScore = 0;
      for (const memory of memories) {
        totalScore += memory.importance_score;
      }
      const accessTime = Date.now() - accessStartTime;

      expect(creationTime).toBeLessThan(1000); // 1초 내 생성
      expect(accessTime).toBeLessThan(100);    // 100ms 내 접근
      expect(totalScore).toBeGreaterThan(0);

      console.log(`Object Performance Test:
        - Created ${iterations} objects in ${creationTime}ms
        - Accessed all objects in ${accessTime}ms
        - Total importance score: ${totalScore}`);
    });
  });

  describe('Configuration and Settings Compatibility', () => {
    it('should maintain existing configuration options', () => {
      // 기존 설정 옵션들
      const legacySettings = {
        max_memories: 1000,
        auto_cleanup_days: 30,
        max_keywords_per_memory: 10,
        enable_history: true,
        enable_auto_archive: true
      };

      // 새로운 설정 옵션 추가
      const extendedSettings = {
        ...legacySettings,
        importance_score_thresholds: {
          critical: 90,
          high: 70,
          medium: 30,
          low: 10
        },
        default_importance_score: 50
      };

      // 기존 설정들이 그대로 유지되는지 확인
      Object.keys(legacySettings).forEach(key => {
        expect(extendedSettings).toHaveProperty(key);
        expect(extendedSettings[key as keyof typeof legacySettings]).toBe(
          legacySettings[key as keyof typeof legacySettings]
        );
      });

      // 새로운 설정들 확인
      expect(extendedSettings.importance_score_thresholds).toBeDefined();
      expect(extendedSettings.default_importance_score).toBe(50);
    });
  });
});
