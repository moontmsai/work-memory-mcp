import { extractKeywords } from '../utils/helpers.js';
import { WorkMemory } from '../types/memory.js';
import { getDatabaseConnection } from '../database/index.js';

/**
 * 검색 관련 유틸리티 함수들 (SQLite 기반)
 */

/**
 * 검색 인덱스 업데이트 (SQLite 기반)
 */
export async function updateSearchIndex(memory: WorkMemory, isNewMemory: boolean = true): Promise<void> {
  const db = getDatabaseConnection();

  // 기존 인덱스에서 메모리 제거 (업데이트인 경우)
  if (!isNewMemory) {
    await db.run('DELETE FROM search_keywords WHERE memory_id = ?', [memory.id]);
  }

  // 새로운 키워드들 추출 및 인덱스 추가
  const keywords = extractKeywords(memory.content, 15);
  const allKeywords = [...keywords, ...memory.tags];
  
  // 키워드 인덱스 업데이트
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
export async function removeMemoryFromIndex(memoryId: string): Promise<void> {
  const db = getDatabaseConnection();
  await db.run('DELETE FROM search_keywords WHERE memory_id = ?', [memoryId]);
}

/**
 * 전체 검색 인덱스 재구축 (SQLite 기반)
 */
export async function rebuildSearchIndex(): Promise<void> {
  const db = getDatabaseConnection();

  // 기존 인덱스 삭제
  await db.run('DELETE FROM search_keywords');

  // 모든 활성 메모리에 대해 인덱스 구축
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

    await updateSearchIndex(workMemory, true);
  }
}

/**
 * 검색 인덱스 최적화 (SQLite 기반)
 */
export async function optimizeSearchIndex(): Promise<void> {
  const db = getDatabaseConnection();

  // 중복 키워드 제거 (이미 UNIQUE 제약조건으로 처리됨)
  // 고아 키워드 제거 (참조되지 않는 메모리의 키워드들)
  await db.run(`
    DELETE FROM search_keywords 
    WHERE memory_id NOT IN (
      SELECT id FROM work_memories WHERE is_archived = 0
    )
  `);

  // 데이터베이스 최적화
  await db.run('VACUUM');
  await db.run('ANALYZE');
}

/**
 * 검색 인덱스 통계 정보 (SQLite 기반)
 */
export async function getSearchIndexStats(): Promise<{
  totalKeywords: number;
  totalMemories: number;
  averageKeywordsPerMemory: number;
  totalReferences: number;
  lastUpdated: string;
}> {
  const db = getDatabaseConnection();

  const keywordStats = await db.get(`
    SELECT 
      COUNT(DISTINCT keyword) as totalKeywords,
      COUNT(DISTINCT memory_id) as totalMemories,
      COUNT(*) as totalReferences,
      CAST(COUNT(*) AS FLOAT) / COUNT(DISTINCT memory_id) as averageKeywordsPerMemory
    FROM search_keywords
  `);

  return {
    totalKeywords: keywordStats.totalKeywords || 0,
    totalMemories: keywordStats.totalMemories || 0,
    averageKeywordsPerMemory: keywordStats.averageKeywordsPerMemory || 0,
    totalReferences: keywordStats.totalReferences || 0,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * 인기 키워드 상위 N개 반환 (SQLite 기반)
 */
export async function getTopKeywords(limit: number = 10): Promise<Array<{keyword: string, count: number}>> {
  const db = getDatabaseConnection();
  
  const topKeywords = await db.all(`
    SELECT keyword, COUNT(*) as count
    FROM search_keywords
    GROUP BY keyword
    ORDER BY count DESC
    LIMIT ?
  `, [limit]);

  return topKeywords.map(row => ({
    keyword: row.keyword,
    count: row.count
  }));
}

/**
 * 인기 프로젝트 상위 N개 반환 (SQLite 기반)
 */
export async function getTopProjects(limit: number = 10): Promise<Array<{project: string, count: number}>> {
  const db = getDatabaseConnection();
  
  const topProjects = await db.all(`
    SELECT project, COUNT(*) as count
    FROM work_memories
    WHERE is_archived = 0 AND project IS NOT NULL AND project != ''
    GROUP BY project
    ORDER BY count DESC
    LIMIT ?
  `, [limit]);

  return topProjects.map(row => ({
    project: row.project,
    count: row.count
  }));
}

/**
 * 고아 참조 정리 (SQLite 기반)
 */
export async function cleanupOrphanedReferences(): Promise<{removed: number}> {
  const db = getDatabaseConnection();
  
  const result = await db.run(`
    DELETE FROM search_keywords 
    WHERE memory_id NOT IN (
      SELECT id FROM work_memories
    )
  `);

  return { removed: result.changes || 0 };
}