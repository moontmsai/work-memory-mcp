import fs from 'fs';
import path from 'path';
import { DatabaseConnection } from '../connection.js';

interface LegacyMemory {
  id: string;
  content: string;
  project?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  created_by?: string;
  access_count?: number;
  importance?: 'low' | 'medium' | 'high';
  extracted_content?: string;
}

interface LegacyWorkData {
  version: string;
  last_updated: string;
  memories: LegacyMemory[];
  stats?: {
    total_memories: number;
    active_projects: string[];
    most_active_project?: string;
  };
}

export class WorkMemoriesMigrator {
  private connection: DatabaseConnection;
  private workMemoryPath: string;

  constructor(connection: DatabaseConnection, workMemoryPath: string = 'work_memory') {
    this.connection = connection;
    this.workMemoryPath = workMemoryPath;
  }

  /**
   * current_work.json 파일을 work_memories 테이블로 마이그레이션
   */
  async migrate(): Promise<{ success: boolean; migratedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let migratedCount = 0;

    try {
      // current_work.json 파일 경로
      const currentWorkPath = path.join(this.workMemoryPath, 'current_work.json');

      // 파일 존재 여부 확인
      if (!fs.existsSync(currentWorkPath)) {
        return { success: true, migratedCount: 0, errors: [] };
      }

      // 기존 데이터 읽기
      const rawData = fs.readFileSync(currentWorkPath, 'utf-8');
      const legacyData: LegacyWorkData = JSON.parse(rawData);

      if (!legacyData.memories || legacyData.memories.length === 0) {
        return { success: true, migratedCount: 0, errors: [] };
      }

      // 트랜잭션 시작
      await this.connection.run('BEGIN TRANSACTION');

      try {
        // 각 메모리 마이그레이션
        for (const memory of legacyData.memories) {
          try {
            await this.migrateMemory(memory);
            migratedCount++;
          } catch (error) {
            const errorMsg = `Failed to migrate memory ${memory.id}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
          }
        }

        // 프로젝트 인덱스 업데이트
        await this.updateProjectIndex();

        // 트랜잭션 커밋
        await this.connection.run('COMMIT');

        // 백업 생성
        await this.createBackup(currentWorkPath);

        return { success: true, migratedCount, errors };

      } catch (error) {
        // 트랜잭션 롤백
        await this.connection.run('ROLLBACK');
        throw error;
      }

    } catch (error) {
      const errorMsg = `Migration failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      return { success: false, migratedCount, errors };
    }
  }

  /**
   * 개별 메모리 마이그레이션
   */
  private async migrateMemory(memory: LegacyMemory): Promise<void> {
    // 이미 존재하는지 확인
    const existing = await this.connection.get(
      'SELECT id FROM work_memories WHERE id = ?',
      [memory.id]
    );

    if (existing) {
      return;
    }

    // 태그를 JSON 문자열로 변환
    const tagsJson = memory.tags ? JSON.stringify(memory.tags) : null;

    // work_memories 테이블에 삽입
    await this.connection.run(`
      INSERT INTO work_memories (
        id, content, extracted_content, project, tags, importance,
        created_by, created_at, updated_at, access_count, last_accessed_at, is_archived
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      memory.id,
      memory.content,
      memory.extracted_content || null,
      memory.project || null,
      tagsJson,
      memory.importance || 'medium',
      memory.created_by || 'unknown',
      memory.created_at,
      memory.updated_at,
      memory.access_count || 0,
      memory.updated_at, // last_accessed_at을 updated_at으로 초기화
      false // is_archived
    ]);

    // 검색 키워드 생성
    await this.generateSearchKeywords(memory);

    // 변경 히스토리 기록
    await this.recordMigrationHistory(memory);
  }

  /**
   * 검색 키워드 생성
   */
  private async generateSearchKeywords(memory: LegacyMemory): Promise<void> {
    const keywords = new Set<string>();

    // 내용에서 키워드 추출 (간단한 토큰화)
    const contentWords = memory.content
      .toLowerCase()
      .replace(/[^\w\s가-힣]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1);

    contentWords.forEach(word => keywords.add(word));

    // 태그 추가
    if (memory.tags) {
      memory.tags.forEach(tag => keywords.add(tag.toLowerCase()));
    }

    // 프로젝트명 추가
    if (memory.project) {
      keywords.add(memory.project.toLowerCase());
    }

    // 키워드 삽입
    for (const keyword of keywords) {
      try {
        await this.connection.run(`
          INSERT OR IGNORE INTO search_keywords (memory_id, keyword, source, weight)
          VALUES (?, ?, ?, ?)
        `, [
          memory.id,
          keyword,
          memory.tags?.includes(keyword) ? 'tags' : 
          memory.project?.toLowerCase() === keyword ? 'project' : 'content',
          memory.tags?.includes(keyword) ? 2.0 : 1.0
        ]);
      } catch (error) {
        // Silently ignore keyword insertion failures
      }
    }
  }

  /**
   * 마이그레이션 히스토리 기록
   */
  private async recordMigrationHistory(memory: LegacyMemory): Promise<void> {
    try {
      await this.connection.run(`
        INSERT INTO change_history (
          memory_id, action, new_data, timestamp, details
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        memory.id,
        'created',
        JSON.stringify(memory),
        new Date().toISOString(),
        'Migrated from current_work.json'
      ]);
    } catch (error) {
      // Silently ignore history record failures
    }
  }

  /**
   * 프로젝트 인덱스 업데이트
   */
  private async updateProjectIndex(): Promise<void> {
    // 프로젝트별 통계 계산
    const projectStats = await this.connection.all(`
      SELECT 
        project,
        COUNT(*) as memory_count,
        MAX(created_at) as most_recent_memory_date,
        created_by as most_active_creator,
        SUM(CASE 
          WHEN importance = 'high' THEN 3
          WHEN importance = 'medium' THEN 2
          WHEN importance = 'low' THEN 1
          ELSE 1
        END) as total_importance_score
      FROM work_memories 
      WHERE project IS NOT NULL 
      GROUP BY project, created_by
      ORDER BY COUNT(*) DESC
    `);

    // 프로젝트별로 인덱스 업데이트
    const projectGroups = new Map<string, any>();
    
    for (const stat of projectStats) {
      if (!projectGroups.has(stat.project)) {
        projectGroups.set(stat.project, {
          project: stat.project,
          memory_count: 0,
          total_importance_score: 0,
          most_recent_memory_date: stat.most_recent_memory_date,
          most_active_creator: stat.most_active_creator
        });
      }
      
      const group = projectGroups.get(stat.project);
      group.memory_count += stat.memory_count;
      group.total_importance_score += stat.total_importance_score;
      
      if (stat.most_recent_memory_date > group.most_recent_memory_date) {
        group.most_recent_memory_date = stat.most_recent_memory_date;
      }
    }

    // 프로젝트 인덱스에 삽입/업데이트
    for (const [project, stats] of projectGroups) {
      await this.connection.run(`
        INSERT OR REPLACE INTO project_index (
          project, memory_count, total_importance_score,
          most_recent_memory_date, most_active_creator, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        project,
        stats.memory_count,
        stats.total_importance_score,
        stats.most_recent_memory_date,
        stats.most_active_creator,
        new Date().toISOString()
      ]);
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
      // 데이터베이스의 메모리 수 확인
      const dbCount = await this.connection.get('SELECT COUNT(*) as count FROM work_memories');
      
      // 원본 파일의 메모리 수 확인
      const currentWorkPath = path.join(this.workMemoryPath, 'current_work.json');
      
      if (fs.existsSync(currentWorkPath)) {
        const rawData = fs.readFileSync(currentWorkPath, 'utf-8');
        const legacyData: LegacyWorkData = JSON.parse(rawData);
        const originalCount = legacyData.memories?.length || 0;

        if (dbCount.count !== originalCount) {
          issues.push(`Memory count mismatch: DB has ${dbCount.count}, original had ${originalCount}`);
        }
      }

      // 키워드 인덱스 확인
      const keywordCount = await this.connection.get('SELECT COUNT(*) as count FROM search_keywords');
      if (keywordCount.count === 0 && dbCount.count > 0) {
        issues.push('No search keywords found despite having memories');
      }

      // 프로젝트 인덱스 확인
      const projectCount = await this.connection.get('SELECT COUNT(*) as count FROM project_index');
      const projectsInMemories = await this.connection.get(`
        SELECT COUNT(DISTINCT project) as count FROM work_memories WHERE project IS NOT NULL
      `);
      
      if (projectCount.count !== projectsInMemories.count) {
        issues.push(`Project index mismatch: index has ${projectCount.count}, memories have ${projectsInMemories.count} distinct projects`);
      }

      return { isValid: issues.length === 0, issues };

    } catch (error) {
      issues.push(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false, issues };
    }
  }
} 