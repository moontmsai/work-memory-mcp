import fs from 'fs';
import path from 'path';
import { DatabaseConnection } from '../connection.js';

interface LegacySearchIndex {
  keywords: {
    [keyword: string]: {
      memories: string[]; // memory IDs
      weight?: number;
      last_used?: string;
    };
  };
  last_updated: string;
  stats: {
    total_keywords: number;
    total_references: number;
  };
}

export class SearchIndexMigrator {
  private connection: DatabaseConnection;
  private workMemoryPath: string;

  constructor(connection: DatabaseConnection, workMemoryPath: string = 'work_memory') {
    this.connection = connection;
    this.workMemoryPath = workMemoryPath;
  }

  /**
   * search_index.json 파일을 search_keywords 테이블로 마이그레이션
   */
  async migrate(): Promise<{ success: boolean; migratedKeywords: number; errors: string[] }> {
    const errors: string[] = [];
    let migratedKeywords = 0;

    try {
      // search_index.json 파일 경로
      const searchIndexPath = path.join(this.workMemoryPath, 'search_index.json');

      // 파일 존재 여부 확인
      if (!fs.existsSync(searchIndexPath)) {
        return { success: true, migratedKeywords: 0, errors: [] };
      }

      // 기존 데이터 읽기
      const rawData = fs.readFileSync(searchIndexPath, 'utf-8');
      const legacyIndex: LegacySearchIndex = JSON.parse(rawData);

      if (!legacyIndex.keywords || Object.keys(legacyIndex.keywords).length === 0) {
        return { success: true, migratedKeywords: 0, errors: [] };
      }

      // 트랜잭션 시작
      await this.connection.run('BEGIN TRANSACTION');

      try {
        // 각 키워드 마이그레이션
        for (const [keyword, keywordData] of Object.entries(legacyIndex.keywords)) {
          try {
            await this.migrateKeyword(keyword, keywordData);
            migratedKeywords++;
          } catch (error) {
            const errorMsg = `Failed to migrate keyword "${keyword}": ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
          }
        }

        // 트랜잭션 커밋
        await this.connection.run('COMMIT');

        // 백업 생성
        await this.createBackup(searchIndexPath);

        return { success: true, migratedKeywords, errors };

      } catch (error) {
        // 트랜잭션 롤백
        await this.connection.run('ROLLBACK');
        throw error;
      }

    } catch (error) {
      const errorMsg = `Search index migration failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      return { success: false, migratedKeywords, errors };
    }
  }

  /**
   * 개별 키워드 마이그레이션
   */
  private async migrateKeyword(keyword: string, keywordData: any): Promise<void> {
    // 각 메모리 ID에 대해 키워드 삽입
    for (const memoryId of keywordData.memories) {
      // 메모리가 실제로 존재하는지 확인
      const memoryExists = await this.connection.get(
        'SELECT id FROM work_memories WHERE id = ?',
        [memoryId]
      );

      if (!memoryExists) {
        continue;
      }

      // 이미 존재하는 키워드인지 확인
      const existingKeyword = await this.connection.get(
        'SELECT id FROM search_keywords WHERE memory_id = ? AND keyword = ?',
        [memoryId, keyword]
      );

      if (existingKeyword) {
        continue;
      }

      // 키워드 출처 추정
      const source = await this.estimateKeywordSource(memoryId, keyword);

      // search_keywords 테이블에 삽입
      await this.connection.run(`
        INSERT INTO search_keywords (memory_id, keyword, source, weight)
        VALUES (?, ?, ?, ?)
      `, [
        memoryId,
        keyword,
        source,
        keywordData.weight || 1.0
      ]);
    }
  }

  /**
   * 키워드 출처 추정
   */
  private async estimateKeywordSource(memoryId: string, keyword: string): Promise<string> {
    try {
      // 메모리 데이터 조회
      const memory = await this.connection.get(
        'SELECT content, project, tags FROM work_memories WHERE id = ?',
        [memoryId]
      );

      if (!memory) {
        return 'content';
      }

      // 태그에서 찾기
      if (memory.tags) {
        try {
          const tags = JSON.parse(memory.tags);
          if (Array.isArray(tags) && tags.some(tag => tag.toLowerCase() === keyword.toLowerCase())) {
            return 'tags';
          }
        } catch (error) {
          // JSON 파싱 실패 시 무시
        }
      }

      // 프로젝트명에서 찾기
      if (memory.project && memory.project.toLowerCase() === keyword.toLowerCase()) {
        return 'project';
      }

      // 내용에서 찾기
      if (memory.content && memory.content.toLowerCase().includes(keyword.toLowerCase())) {
        return 'content';
      }

      // 기본값
      return 'content';

    } catch (error) {
      return 'content';
    }
  }

  /**
   * 백업 생성
   */
  private async createBackup(originalPath: string): Promise<void> {
    try {
      const backupPath = `${originalPath}.backup.${Date.now()}`;
      fs.copyFileSync(originalPath, backupPath);
    } catch (error) {
      // Silently ignore backup creation failures
    }
  }

  /**
   * 마이그레이션 검증
   */
  async verify(): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // 원본 파일 확인
      const searchIndexPath = path.join(this.workMemoryPath, 'search_index.json');
      
      if (!fs.existsSync(searchIndexPath)) {
        return { isValid: true, issues: [] };
      }

      const rawData = fs.readFileSync(searchIndexPath, 'utf-8');
      const legacyIndex: LegacySearchIndex = JSON.parse(rawData);

      // 원본 키워드 수 계산
      let originalKeywordReferences = 0;
      for (const keywordData of Object.values(legacyIndex.keywords)) {
        originalKeywordReferences += keywordData.memories.length;
      }

      // 데이터베이스의 키워드 수 확인 (마이그레이션된 것만)
      const dbKeywordCount = await this.connection.get(`
        SELECT COUNT(*) as count 
        FROM search_keywords sk
        JOIN work_memories wm ON sk.memory_id = wm.id
      `);

      // 키워드 중복 확인
      const duplicateKeywords = await this.connection.all(`
        SELECT memory_id, keyword, COUNT(*) as count
        FROM search_keywords
        GROUP BY memory_id, keyword
        HAVING COUNT(*) > 1
      `);

      if (duplicateKeywords.length > 0) {
        issues.push(`Found ${duplicateKeywords.length} duplicate keyword entries`);
      }

      // 고아 키워드 확인 (메모리가 없는 키워드)
      const orphanKeywords = await this.connection.all(`
        SELECT sk.memory_id, sk.keyword
        FROM search_keywords sk
        LEFT JOIN work_memories wm ON sk.memory_id = wm.id
        WHERE wm.id IS NULL
      `);

      if (orphanKeywords.length > 0) {
        issues.push(`Found ${orphanKeywords.length} orphan keywords (no corresponding memory)`);
      }

      return { isValid: issues.length === 0, issues };

    } catch (error) {
      issues.push(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false, issues };
    }
  }

  /**
   * 중복 키워드 정리
   */
  async cleanupDuplicates(): Promise<{ cleaned: number; errors: string[] }> {
    const errors: string[] = [];
    let cleaned = 0;

    try {
      // 중복 키워드 찾기
      const duplicates = await this.connection.all(`
        SELECT memory_id, keyword, MIN(id) as keep_id, COUNT(*) as count
        FROM search_keywords
        GROUP BY memory_id, keyword
        HAVING COUNT(*) > 1
      `);

      if (duplicates.length === 0) {
        return { cleaned: 0, errors: [] };
      }

      // 트랜잭션 시작
      await this.connection.run('BEGIN TRANSACTION');

      try {
        for (const duplicate of duplicates) {
          // 가장 오래된 것을 제외하고 삭제
          const result = await this.connection.run(`
            DELETE FROM search_keywords 
            WHERE memory_id = ? AND keyword = ? AND id != ?
          `, [duplicate.memory_id, duplicate.keyword, duplicate.keep_id]);

          cleaned += duplicate.count - 1;
        }

        await this.connection.run('COMMIT');

      } catch (error) {
        await this.connection.run('ROLLBACK');
        throw error;
      }

      return { cleaned, errors };

    } catch (error) {
      const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      return { cleaned, errors };
    }
  }
} 