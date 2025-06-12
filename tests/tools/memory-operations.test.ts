import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';

const TEST_WORK_MEMORY_DIR = './test-work-memory';

// 메모리 타입 정의
interface WorkMemory {
  id: string;
  content: string;
  project: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: string;
  access_count: number;
  importance_score: number; // 문자형에서 수치형으로 변경
}

interface CurrentWork {
  version: string;
  last_updated: string;
  memories: WorkMemory[];
  stats: {
    total_memories: number;
    active_projects: string[];
    most_active_project: string | null;
  };
}

// 테스트용 헬퍼 함수들
function generateMemoryId(): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const random = Math.random().toString(36).substring(2, 8);
  return `mem_${timestamp}_${random}`;
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

async function safeReadJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return defaultValue;
  }
}

async function safeWriteJsonFile(filePath: string, data: any): Promise<void> {
  await ensureDirectoryExists(join(filePath, '..'));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function addTestMemory(
  content: string,
  project: string,
  tags: string[],
  importance_score: number = 50 // 기본값 50으로 변경
): Promise<WorkMemory> {
  const currentWorkPath = join(TEST_WORK_MEMORY_DIR, 'current_work.json');
  
  const memory: WorkMemory = {
    id: generateMemoryId(),
    content,
    project,
    tags,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'test',
    access_count: 0,
    importance_score
  };
  
  const currentWork = await safeReadJsonFile<CurrentWork>(currentWorkPath, {
    version: "1.0",
    last_updated: new Date().toISOString(),
    memories: [],
    stats: {
      total_memories: 0,
      active_projects: [],
      most_active_project: null
    }
  });
  
  currentWork.memories.push(memory);
  currentWork.last_updated = new Date().toISOString();
  currentWork.stats.total_memories = currentWork.memories.length;
  
  await safeWriteJsonFile(currentWorkPath, currentWork);
  
  return memory;
}

describe('Memory Operations', () => {
  beforeEach(async () => {
    await ensureDirectoryExists(TEST_WORK_MEMORY_DIR);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_WORK_MEMORY_DIR, { recursive: true, force: true });
    } catch {
      // 정리 실패 시 무시
    }
  });

  describe('Memory Creation', () => {
    it('should create memory with valid ID format', async () => {
      const memory = await addTestMemory(
        'Test memory content',
        'test-project',
        ['test', 'memory']
      );
      
      expect(memory.id).toMatch(/^mem_\d{8}T\d{6}_[a-z0-9]{6}$/);
    });

    it('should store memory content correctly', async () => {
      const content = 'Test memory content';
      const project = 'test-project';
      const tags = ['test', 'memory'];
      
      const memory = await addTestMemory(content, project, tags, 85);
      
      expect(memory.content).toBe(content);
      expect(memory.project).toBe(project);
      expect(memory.tags).toEqual(tags);
      expect(memory.importance_score).toBe(85);
      expect(memory.access_count).toBe(0);
    });

    it('should update file system correctly', async () => {
      await addTestMemory('Test content', 'test-project', ['test']);
      
      const currentWorkPath = join(TEST_WORK_MEMORY_DIR, 'current_work.json');
      const currentWork = await safeReadJsonFile<CurrentWork>(currentWorkPath, {} as CurrentWork);
      
      expect(currentWork.memories).toHaveLength(1);
      expect(currentWork.stats.total_memories).toBe(1);
    });
  });

  describe('Memory Search', () => {
    beforeEach(async () => {
      await addTestMemory('Testing MCP server', 'mcp-project', ['test', 'mcp']);
      await addTestMemory('Claude integration', 'ai-project', ['claude', 'ai']);
      await addTestMemory('Performance optimization', 'perf-project', ['performance']);
    });

    it('should find memories by content', async () => {
      const currentWorkPath = join(TEST_WORK_MEMORY_DIR, 'current_work.json');
      const currentWork = await safeReadJsonFile<CurrentWork>(currentWorkPath, {} as CurrentWork);
      
      const results = currentWork.memories.filter(m => 
        m.content.toLowerCase().includes('mcp')
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('MCP');
    });

    it('should find memories by project', async () => {
      const currentWorkPath = join(TEST_WORK_MEMORY_DIR, 'current_work.json');
      const currentWork = await safeReadJsonFile<CurrentWork>(currentWorkPath, {} as CurrentWork);
      
      const results = currentWork.memories.filter(m => 
        m.project === 'ai-project'
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].project).toBe('ai-project');
    });

    it('should find memories by tags', async () => {
      const currentWorkPath = join(TEST_WORK_MEMORY_DIR, 'current_work.json');
      const currentWork = await safeReadJsonFile<CurrentWork>(currentWorkPath, {} as CurrentWork);
      
      const results = currentWork.memories.filter(m => 
        m.tags.includes('claude')
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('claude');
    });
  });

  describe('Memory Deletion', () => {
    let testMemoryId: string;

    beforeEach(async () => {
      const memory = await addTestMemory('Memory to delete', 'test-project', ['test']);
      testMemoryId = memory.id;
    });

    it('should remove memory from storage', async () => {
      const currentWorkPath = join(TEST_WORK_MEMORY_DIR, 'current_work.json');
      
      // 삭제 전 확인
      let currentWork = await safeReadJsonFile<CurrentWork>(currentWorkPath, {} as CurrentWork);
      expect(currentWork.memories).toHaveLength(1);
      
      // 삭제 시뮬레이션
      currentWork.memories = currentWork.memories.filter(m => m.id !== testMemoryId);
      currentWork.stats.total_memories = currentWork.memories.length;
      await safeWriteJsonFile(currentWorkPath, currentWork);
      
      // 삭제 후 확인
      currentWork = await safeReadJsonFile<CurrentWork>(currentWorkPath, {} as CurrentWork);
      expect(currentWork.memories).toHaveLength(0);
    });
  });
}); 