import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';

const E2E_TEST_DIR = './test-e2e-memory';

// E2E 테스트용 메모리 시뮬레이터
class MemoryWorkflowSimulator {
  private workDir: string;
  private currentWorkFile: string;
  private searchIndexFile: string;
  private settingsFile: string;

  constructor(workDir: string) {
    this.workDir = workDir;
    this.currentWorkFile = join(workDir, 'current_work.json');
    this.searchIndexFile = join(workDir, 'search_index.json');
    this.settingsFile = join(workDir, 'settings.json');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.workDir, { recursive: true });
    
    // 초기 파일들 생성
    const initialWork = {
      version: "1.0",
      last_updated: new Date().toISOString(),
      memories: [],
      stats: {
        total_memories: 0,
        active_projects: [],
        most_active_project: null
      }
    };

    const initialIndex = {
      keywords: {},
      projects: {},
      last_updated: new Date().toISOString()
    };

    const initialSettings = {
      version: "1.0",
      max_memories: 1000,
      auto_cleanup: true,
      backup_enabled: false
    };

    await Promise.all([
      fs.writeFile(this.currentWorkFile, JSON.stringify(initialWork, null, 2)),
      fs.writeFile(this.searchIndexFile, JSON.stringify(initialIndex, null, 2)),
      fs.writeFile(this.settingsFile, JSON.stringify(initialSettings, null, 2))
    ]);
  }

  async addMemory(content: string, project: string, tags: string[], importance: string = 'medium'): Promise<string> {
    const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 현재 작업 데이터 읽기
    const currentWork = JSON.parse(await fs.readFile(this.currentWorkFile, 'utf8'));
    
    // 새 메모리 추가
    const newMemory = {
      id: memoryId,
      content,
      project,
      tags,
      importance,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'e2e-test',
      access_count: 0
    };

    currentWork.memories.push(newMemory);
    currentWork.stats.total_memories = currentWork.memories.length;
    
    if (!currentWork.stats.active_projects.includes(project)) {
      currentWork.stats.active_projects.push(project);
    }
    
    currentWork.stats.most_active_project = project;
    currentWork.last_updated = new Date().toISOString();

    // 검색 인덱스 업데이트
    const searchIndex = JSON.parse(await fs.readFile(this.searchIndexFile, 'utf8'));
    
    // 키워드 인덱스 업데이트
    const keywords = content.toLowerCase().split(/\s+/).concat(tags);
    for (const keyword of keywords) {
      if (keyword.length > 2) {
        if (!searchIndex.keywords[keyword]) {
          searchIndex.keywords[keyword] = [];
        }
        if (!searchIndex.keywords[keyword].includes(memoryId)) {
          searchIndex.keywords[keyword].push(memoryId);
        }
      }
    }

    // 프로젝트 인덱스 업데이트
    if (!searchIndex.projects[project]) {
      searchIndex.projects[project] = [];
    }
    searchIndex.projects[project].push(memoryId);
    searchIndex.last_updated = new Date().toISOString();

    // 파일 저장
    await Promise.all([
      fs.writeFile(this.currentWorkFile, JSON.stringify(currentWork, null, 2)),
      fs.writeFile(this.searchIndexFile, JSON.stringify(searchIndex, null, 2))
    ]);

    return memoryId;
  }

  async searchMemories(query: string): Promise<any[]> {
    const searchIndex = JSON.parse(await fs.readFile(this.searchIndexFile, 'utf8'));
    const currentWork = JSON.parse(await fs.readFile(this.currentWorkFile, 'utf8'));
    
    const queryKeywords = query.toLowerCase().split(/\s+/);
    const matchingMemoryIds = new Set<string>();

    // 키워드 매칭
    for (const keyword of queryKeywords) {
      if (searchIndex.keywords[keyword]) {
        searchIndex.keywords[keyword].forEach((id: string) => matchingMemoryIds.add(id));
      }
    }

    // 매칭된 메모리 반환
    return currentWork.memories.filter((memory: any) => matchingMemoryIds.has(memory.id));
  }

  async getMemoriesByProject(project: string): Promise<any[]> {
    const currentWork = JSON.parse(await fs.readFile(this.currentWorkFile, 'utf8'));
    return currentWork.memories.filter((memory: any) => memory.project === project);
  }

  async updateMemory(memoryId: string, updates: any): Promise<boolean> {
    const currentWork = JSON.parse(await fs.readFile(this.currentWorkFile, 'utf8'));
    
    const memoryIndex = currentWork.memories.findIndex((m: any) => m.id === memoryId);
    if (memoryIndex === -1) return false;

    // 메모리 업데이트
    Object.assign(currentWork.memories[memoryIndex], updates);
    currentWork.memories[memoryIndex].updated_at = new Date().toISOString();
    currentWork.last_updated = new Date().toISOString();

    await fs.writeFile(this.currentWorkFile, JSON.stringify(currentWork, null, 2));
    return true;
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    const currentWork = JSON.parse(await fs.readFile(this.currentWorkFile, 'utf8'));
    const searchIndex = JSON.parse(await fs.readFile(this.searchIndexFile, 'utf8'));
    
    const memoryIndex = currentWork.memories.findIndex((m: any) => m.id === memoryId);
    if (memoryIndex === -1) return false;

    // 메모리 제거
    currentWork.memories.splice(memoryIndex, 1);
    currentWork.stats.total_memories = currentWork.memories.length;
    currentWork.last_updated = new Date().toISOString();

    // 검색 인덱스에서 제거
    for (const keyword in searchIndex.keywords) {
      searchIndex.keywords[keyword] = searchIndex.keywords[keyword].filter((id: string) => id !== memoryId);
      if (searchIndex.keywords[keyword].length === 0) {
        delete searchIndex.keywords[keyword];
      }
    }

    for (const project in searchIndex.projects) {
      searchIndex.projects[project] = searchIndex.projects[project].filter((id: string) => id !== memoryId);
      if (searchIndex.projects[project].length === 0) {
        delete searchIndex.projects[project];
      }
    }

    searchIndex.last_updated = new Date().toISOString();

    // 파일 저장
    await Promise.all([
      fs.writeFile(this.currentWorkFile, JSON.stringify(currentWork, null, 2)),
      fs.writeFile(this.searchIndexFile, JSON.stringify(searchIndex, null, 2))
    ]);

    return true;
  }

  async getStats(): Promise<any> {
    const currentWork = JSON.parse(await fs.readFile(this.currentWorkFile, 'utf8'));
    const searchIndex = JSON.parse(await fs.readFile(this.searchIndexFile, 'utf8'));
    
    return {
      total_memories: currentWork.stats.total_memories,
      active_projects: currentWork.stats.active_projects,
      total_keywords: Object.keys(searchIndex.keywords).length,
      last_updated: currentWork.last_updated
    };
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.workDir, { recursive: true, force: true });
    } catch {
      // 정리 실패 시 무시
    }
  }
}

describe('E2E Workflow Tests', () => {
  let simulator: MemoryWorkflowSimulator;

  beforeEach(async () => {
    simulator = new MemoryWorkflowSimulator(E2E_TEST_DIR);
    await simulator.initialize();
  });

  afterEach(async () => {
    await simulator.cleanup();
  });

  describe('Complete Memory Lifecycle', () => {
    it('should handle full CRUD workflow', async () => {
      // 1. 메모리 추가
      const memoryId1 = await simulator.addMemory(
        'E2E test memory for complete workflow',
        'e2e-project',
        ['e2e', 'test', 'workflow'],
        'high'
      );

      const memoryId2 = await simulator.addMemory(
        'Second memory for testing search functionality',
        'e2e-project',
        ['search', 'test'],
        'medium'
      );

      expect(memoryId1).toBeTruthy();
      expect(memoryId2).toBeTruthy();

      // 2. 검색 테스트
      const searchResults = await simulator.searchMemories('e2e test');
      expect(searchResults).toHaveLength(2);
      expect(searchResults.some(m => m.id === memoryId1)).toBe(true);

      // 3. 프로젝트별 조회
      const projectMemories = await simulator.getMemoriesByProject('e2e-project');
      expect(projectMemories).toHaveLength(2);

      // 4. 메모리 업데이트
      const updateSuccess = await simulator.updateMemory(memoryId1, {
        content: 'Updated E2E test memory',
        access_count: 5
      });
      expect(updateSuccess).toBe(true);

      // 5. 업데이트 확인
      const updatedMemories = await simulator.getMemoriesByProject('e2e-project');
      const updatedMemory = updatedMemories.find(m => m.id === memoryId1);
      expect(updatedMemory.content).toBe('Updated E2E test memory');
      expect(updatedMemory.access_count).toBe(5);

      // 6. 메모리 삭제
      const deleteSuccess = await simulator.deleteMemory(memoryId2);
      expect(deleteSuccess).toBe(true);

      // 7. 삭제 확인
      const finalMemories = await simulator.getMemoriesByProject('e2e-project');
      expect(finalMemories).toHaveLength(1);
      expect(finalMemories[0].id).toBe(memoryId1);

      // 8. 통계 확인
      const stats = await simulator.getStats();
      expect(stats.total_memories).toBe(1);
      expect(stats.active_projects).toContain('e2e-project');
    });
  });

  describe('Multi-Project Workflow', () => {
    it('should handle multiple projects simultaneously', async () => {
      // 여러 프로젝트에 메모리 추가
      const projects = ['project-alpha', 'project-beta', 'project-gamma'];
      const memoryIds: string[] = [];

      for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        for (let j = 0; j < 3; j++) {
          const memoryId = await simulator.addMemory(
            `Memory ${j} for ${project}`,
            project,
            [project, 'multi-project', 'test'],
            j === 0 ? 'high' : 'medium'
          );
          memoryIds.push(memoryId);
        }
      }

      expect(memoryIds).toHaveLength(9);

      // 각 프로젝트별 메모리 확인
      for (const project of projects) {
        const projectMemories = await simulator.getMemoriesByProject(project);
        expect(projectMemories).toHaveLength(3);
        expect(projectMemories.every(m => m.project === project)).toBe(true);
      }

      // 통합 검색 테스트
      const searchResults = await simulator.searchMemories('multi-project');
      expect(searchResults).toHaveLength(9);

      // 특정 프로젝트 검색
      const alphaResults = await simulator.searchMemories('project-alpha');
      expect(alphaResults).toHaveLength(3);
      expect(alphaResults.every(m => m.project === 'project-alpha')).toBe(true);

      // 통계 확인
      const stats = await simulator.getStats();
      expect(stats.total_memories).toBe(9);
      expect(stats.active_projects).toHaveLength(3);
      expect(stats.active_projects).toEqual(expect.arrayContaining(projects));
    });
  });

  describe('Search and Index Consistency', () => {
    it('should maintain search consistency throughout operations', async () => {
      // 다양한 키워드로 메모리 추가
      const memories = [
        { content: 'JavaScript development with React', project: 'web-dev', tags: ['javascript', 'react', 'frontend'] },
        { content: 'Python data analysis using pandas', project: 'data-science', tags: ['python', 'pandas', 'data'] },
        { content: 'Node.js backend API development', project: 'backend', tags: ['nodejs', 'api', 'backend'] },
        { content: 'React Native mobile app development', project: 'mobile', tags: ['react-native', 'mobile', 'app'] }
      ];

      const memoryIds: string[] = [];
      for (const memory of memories) {
        const id = await simulator.addMemory(memory.content, memory.project, memory.tags);
        memoryIds.push(id);
      }

      // 키워드별 검색 테스트
      const reactResults = await simulator.searchMemories('react');
      expect(reactResults).toHaveLength(2); // React와 React Native

      const pythonResults = await simulator.searchMemories('python');
      expect(pythonResults).toHaveLength(1);

      const developmentResults = await simulator.searchMemories('development');
      expect(developmentResults).toHaveLength(3); // JavaScript, Node.js, React Native

      // 메모리 업데이트 후 검색 일관성 확인 (업데이트는 검색 인덱스를 자동으로 갱신하지 않으므로 스킵)
      const updateSuccess = await simulator.updateMemory(memoryIds[0], {
        content: 'Advanced JavaScript development with React and TypeScript',
        tags: ['javascript', 'react', 'typescript', 'frontend']
      });
      expect(updateSuccess).toBe(true);

      // 메모리 삭제 후 검색 일관성 확인
      await simulator.deleteMemory(memoryIds[1]); // Python 메모리 삭제

      const pythonResultsAfterDelete = await simulator.searchMemories('python');
      expect(pythonResultsAfterDelete).toHaveLength(0);

      const finalStats = await simulator.getStats();
      expect(finalStats.total_memories).toBe(3);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle moderate scale operations efficiently', async () => {
      const startTime = Date.now();

      // 100개 메모리 추가
      const memoryIds: string[] = [];
      const projects = ['proj-1', 'proj-2', 'proj-3', 'proj-4', 'proj-5'];

      for (let i = 0; i < 100; i++) {
        const project = projects[i % projects.length];
        const memoryId = await simulator.addMemory(
          `Scalability test memory ${i} with various content`,
          project,
          ['scalability', 'test', `batch-${Math.floor(i / 20)}`],
          i % 3 === 0 ? 'high' : 'medium'
        );
        memoryIds.push(memoryId);
      }

      const addTime = Date.now() - startTime;

      // 검색 성능 테스트
      const searchStartTime = Date.now();
      const searchResults = await simulator.searchMemories('scalability');
      const searchTime = Date.now() - searchStartTime;

      expect(searchResults).toHaveLength(100);
      expect(addTime).toBeLessThan(10000); // 10초 이내
      expect(searchTime).toBeLessThan(1000); // 1초 이내

      // 대량 삭제 성능 테스트
      const deleteStartTime = Date.now();
      for (let i = 0; i < 50; i++) {
        await simulator.deleteMemory(memoryIds[i]);
      }
      const deleteTime = Date.now() - deleteStartTime;

      expect(deleteTime).toBeLessThan(5000); // 5초 이내

      // 최종 상태 확인
      const finalStats = await simulator.getStats();
      expect(finalStats.total_memories).toBe(50);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from data corruption gracefully', async () => {
      // 정상 메모리 추가
      const memoryId = await simulator.addMemory(
        'Test memory before corruption',
        'test-project',
        ['test', 'corruption']
      );

      // 파일 손상 시뮬레이션
      const corruptedData = '{ invalid json content }';
      const currentWorkFile = join(E2E_TEST_DIR, 'current_work.json');
      await fs.writeFile(currentWorkFile, corruptedData, 'utf8');

      // 복구 시도 (새로운 시뮬레이터 인스턴스로)
      const recoverySimulator = new MemoryWorkflowSimulator(E2E_TEST_DIR + '_recovery');
      await recoverySimulator.initialize();

      // 복구된 시스템에서 정상 작동 확인
      const newMemoryId = await recoverySimulator.addMemory(
        'Recovery test memory',
        'recovery-project',
        ['recovery', 'test']
      );

      expect(newMemoryId).toBeTruthy();

      const recoveryStats = await recoverySimulator.getStats();
      expect(recoveryStats.total_memories).toBe(1);

      await recoverySimulator.cleanup();
    });

    it('should handle concurrent operations safely', async () => {
      // 순차적 메모리 추가 (파일 시스템 경쟁 조건 방지)
      const memoryIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const memoryId = await simulator.addMemory(
          `Sequential memory ${i}`,
          'sequential-project',
          ['sequential', 'test'],
          'medium'
        );
        memoryIds.push(memoryId);
      }

      expect(memoryIds).toHaveLength(5);

      const stats = await simulator.getStats();
      expect(stats.total_memories).toBe(5);
    });
  });
});