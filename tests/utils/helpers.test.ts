import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';

// 테스트할 헬퍼 함수들
async function generateMemoryId(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const random = Math.random().toString(36).substring(2, 8);
  return `mem_${timestamp}_${random}`;
}

function isValidMemoryId(id: string): boolean {
  return /^mem_\d{8}T\d{6}_[a-z0-9]{6}$/.test(id);
}

function extractKeywords(content: string): string[] {
  return content
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1)
    .slice(0, 20);
}

function calculateImportanceScore(memory: any): number {
  let score = 0;
  
  // 기본 중요도 점수
  switch (memory.importance) {
    case 'high': score += 3; break;
    case 'medium': score += 2; break;
    case 'low': score += 1; break;
    default: score += 1;
  }
  
  // 접근 횟수 점수
  score += Math.min(memory.access_count || 0, 5) * 0.2;
  
  // 최근성 점수
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceCreated < 1) score += 1;
  else if (daysSinceCreated < 7) score += 0.5;
  
  return Math.round(score * 10) / 10;
}

describe('Helper Utilities', () => {
  describe('generateMemoryId', () => {
    it('should generate valid memory ID format', async () => {
      const id = await generateMemoryId();
      expect(id).toMatch(/^mem_\d{8}T\d{6}_[a-z0-9]{6}$/);
    });

    it('should generate unique IDs', async () => {
      const ids = await Promise.all([
        generateMemoryId(),
        generateMemoryId(),
        generateMemoryId()
      ]);
      
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('should include timestamp in ID', async () => {
      const beforeTimestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
      const id = await generateMemoryId();
      const afterTimestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
      
      const idTimestamp = id.split('_')[1];
      expect(idTimestamp >= beforeTimestamp).toBe(true);
      expect(idTimestamp <= afterTimestamp).toBe(true);
    });
  });

  describe('isValidMemoryId', () => {
    it('should validate correct memory ID format', () => {
      expect(isValidMemoryId('mem_20250608T123456_abc123')).toBe(true);
    });

    it('should reject invalid memory ID formats', () => {
      expect(isValidMemoryId('invalid_id')).toBe(false);
      expect(isValidMemoryId('mem_123_abc')).toBe(false);
      expect(isValidMemoryId('mem_20250608T123456_ABC123')).toBe(false); // 대문자
      expect(isValidMemoryId('')).toBe(false);
    });

    it('should reject IDs with wrong timestamp format', () => {
      expect(isValidMemoryId('mem_2025-06-08T12:34:56_abc123')).toBe(false);
      expect(isValidMemoryId('mem_20250608_abc123')).toBe(false);
    });
  });

  describe('extractKeywords', () => {
    it('should extract keywords from Korean text', () => {
      const content = '안녕하세요. Task 15 테스트를 진행하고 있습니다.';
      const keywords = extractKeywords(content);
      
      expect(keywords).toContain('안녕하세요');
      expect(keywords).toContain('task');
      expect(keywords).toContain('15');
      expect(keywords).toContain('테스트를');
      expect(keywords).toContain('진행하고');
      expect(keywords).toContain('있습니다');
    });

    it('should extract keywords from English text', () => {
      const content = 'Testing MCP server integration with Claude and Cursor';
      const keywords = extractKeywords(content);
      
      expect(keywords).toContain('testing');
      expect(keywords).toContain('mcp');
      expect(keywords).toContain('server');
      expect(keywords).toContain('integration');
      expect(keywords).toContain('with');
      expect(keywords).toContain('claude');
      expect(keywords).toContain('and');
      expect(keywords).toContain('cursor');
    });

    it('should filter out single character words', () => {
      const content = 'a b c test word';
      const keywords = extractKeywords(content);
      
      expect(keywords).not.toContain('a');
      expect(keywords).not.toContain('b');
      expect(keywords).not.toContain('c');
      expect(keywords).toContain('test');
      expect(keywords).toContain('word');
    });

    it('should limit keywords to 20 items', () => {
      const content = Array(30).fill(0).map((_, i) => `word${i}`).join(' ');
      const keywords = extractKeywords(content);
      
      expect(keywords.length).toBeLessThanOrEqual(20);
    });

    it('should remove special characters', () => {
      const content = 'test@email.com and #hashtag!';
      const keywords = extractKeywords(content);
      
      expect(keywords).toContain('test');
      expect(keywords).toContain('email');
      expect(keywords).toContain('com');
      expect(keywords).toContain('and');
      expect(keywords).toContain('hashtag');
    });
  });

  describe('calculateImportanceScore', () => {
    it('should calculate score based on importance level', () => {
      const highMemory = { importance: 'high', access_count: 0, created_at: new Date().toISOString() };
      const mediumMemory = { importance: 'medium', access_count: 0, created_at: new Date().toISOString() };
      const lowMemory = { importance: 'low', access_count: 0, created_at: new Date().toISOString() };
      
      expect(calculateImportanceScore(highMemory)).toBeGreaterThan(calculateImportanceScore(mediumMemory));
      expect(calculateImportanceScore(mediumMemory)).toBeGreaterThan(calculateImportanceScore(lowMemory));
    });

    it('should add bonus for access count', () => {
      const baseMemory = { importance: 'medium', access_count: 0, created_at: new Date().toISOString() };
      const accessedMemory = { importance: 'medium', access_count: 5, created_at: new Date().toISOString() };
      
      expect(calculateImportanceScore(accessedMemory)).toBeGreaterThan(calculateImportanceScore(baseMemory));
    });

    it('should add recency bonus for new memories', () => {
      const newMemory = { importance: 'medium', access_count: 0, created_at: new Date().toISOString() };
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      const oldMemory = { importance: 'medium', access_count: 0, created_at: oldDate.toISOString() };
      
      expect(calculateImportanceScore(newMemory)).toBeGreaterThan(calculateImportanceScore(oldMemory));
    });

    it('should cap access count bonus at 5', () => {
      const memory5 = { importance: 'medium', access_count: 5, created_at: new Date().toISOString() };
      const memory10 = { importance: 'medium', access_count: 10, created_at: new Date().toISOString() };
      
      expect(calculateImportanceScore(memory5)).toBe(calculateImportanceScore(memory10));
    });

    it('should handle missing fields gracefully', () => {
      const incompleteMemory = { created_at: new Date().toISOString() };
      const score = calculateImportanceScore(incompleteMemory);
      
      expect(score).toBeGreaterThan(0);
      expect(typeof score).toBe('number');
    });
  });
}); 