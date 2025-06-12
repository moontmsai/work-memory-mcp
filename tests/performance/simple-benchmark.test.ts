import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';

const PERF_TEST_DIR = './test-simple-performance';

// 간단한 성능 측정 유틸리티
class SimpleProfiler {
  static async measureTime<T>(operation: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const startTime = performance.now();
    const result = await operation();
    const duration = performance.now() - startTime;
    return { result, duration };
  }

  static async measureMultiple<T>(
    operation: () => Promise<T>,
    iterations: number
  ): Promise<{ results: T[]; durations: number[]; avgDuration: number }> {
    const results: T[] = [];
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { result, duration } = await this.measureTime(operation);
      results.push(result);
      durations.push(duration);
    }

    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    return { results, durations, avgDuration };
  }
}

// 간단한 메모리 시뮬레이터
class SimpleMemorySimulator {
  private workDir: string;
  private memories: any[] = [];
  private searchIndex: Record<string, string[]> = {};

  constructor(workDir: string) {
    this.workDir = workDir;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.workDir, { recursive: true });
    this.memories = [];
    this.searchIndex = {};
  }

  async addMemory(content: string, project: string, tags: string[]): Promise<string> {
    const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const memory = {
      id: memoryId,
      content,
      project,
      tags,
      created_at: new Date().toISOString(),
      access_count: 0
    };

    this.memories.push(memory);

    // 검색 인덱스 업데이트
    const keywords = content.toLowerCase().split(/\s+/).concat(tags);
    for (const keyword of keywords) {
      if (keyword.length > 2) {
        if (!this.searchIndex[keyword]) {
          this.searchIndex[keyword] = [];
        }
        if (!this.searchIndex[keyword].includes(memoryId)) {
          this.searchIndex[keyword].push(memoryId);
        }
      }
    }

    return memoryId;
  }

  async searchMemories(query: string): Promise<any[]> {
    const queryKeywords = query.toLowerCase().split(/\s+/);
    const matchingMemoryIds = new Set<string>();

    for (const keyword of queryKeywords) {
      if (this.searchIndex[keyword]) {
        this.searchIndex[keyword].forEach(id => matchingMemoryIds.add(id));
      }
    }

    return this.memories.filter(memory => matchingMemoryIds.has(memory.id));
  }

  async getMemoriesByProject(project: string): Promise<any[]> {
    return this.memories.filter(memory => memory.project === project);
  }

  async deleteMemory(memoryId: string): Promise<boolean> {
    const memoryIndex = this.memories.findIndex(m => m.id === memoryId);
    if (memoryIndex === -1) return false;

    this.memories.splice(memoryIndex, 1);

    // 검색 인덱스에서 제거
    for (const keyword in this.searchIndex) {
      this.searchIndex[keyword] = this.searchIndex[keyword].filter(id => id !== memoryId);
      if (this.searchIndex[keyword].length === 0) {
        delete this.searchIndex[keyword];
      }
    }

    return true;
  }

  getMemoryCount(): number {
    return this.memories.length;
  }

  getIndexSize(): number {
    return Object.keys(this.searchIndex).length;
  }

  async saveToFile(): Promise<void> {
    const data = {
      memories: this.memories,
      searchIndex: this.searchIndex,
      timestamp: new Date().toISOString()
    };

    const filePath = join(this.workDir, 'memory_data.json');
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  async loadFromFile(): Promise<void> {
    const filePath = join(this.workDir, 'memory_data.json');
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      
      this.memories = data.memories || [];
      this.searchIndex = data.searchIndex || {};
    } catch {
      // 파일이 없거나 손상된 경우 초기화
      this.memories = [];
      this.searchIndex = {};
    }
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.workDir, { recursive: true, force: true });
    } catch {
      // 정리 실패 시 무시
    }
  }
}

describe('Simple Performance Benchmark Tests', () => {
  let simulator: SimpleMemorySimulator;

  beforeEach(async () => {
    simulator = new SimpleMemorySimulator(PERF_TEST_DIR);
    await simulator.initialize();
  });

  afterEach(async () => {
    await simulator.cleanup();
  });

  describe('Memory Operations Performance', () => {
    it('should add memories efficiently', async () => {
      const iterations = 100;
      
      const { avgDuration } = await SimpleProfiler.measureMultiple(
        async () => {
          return await simulator.addMemory(
            'Performance test memory with some content',
            'test-project',
            ['performance', 'test']
          );
        },
        iterations
      );

      expect(avgDuration).toBeLessThan(10); // 평균 10ms 이내
      expect(simulator.getMemoryCount()).toBe(iterations);

      console.log(`Memory Addition - Average: ${avgDuration.toFixed(2)}ms for ${iterations} operations`);
    });

    it('should search memories efficiently', async () => {
      // 테스트 데이터 준비
      const testData = [
        { content: 'JavaScript development', project: 'web', tags: ['javascript', 'dev'] },
        { content: 'Python data analysis', project: 'data', tags: ['python', 'analysis'] },
        { content: 'React frontend', project: 'web', tags: ['react', 'frontend'] },
        { content: 'Node.js backend', project: 'api', tags: ['nodejs', 'backend'] }
      ];

      for (const data of testData) {
        await simulator.addMemory(data.content, data.project, data.tags);
      }

      // 검색 성능 측정
      const searchQueries = ['javascript', 'python', 'react', 'development'];
      
      const { avgDuration } = await SimpleProfiler.measureMultiple(
        async () => {
          const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
          return await simulator.searchMemories(query);
        },
        20
      );

      expect(avgDuration).toBeLessThan(5); // 평균 5ms 이내

      console.log(`Search - Average: ${avgDuration.toFixed(2)}ms for 20 search operations`);
    });

    it('should delete memories efficiently', async () => {
      // 테스트 데이터 준비
      const memoryIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const id = await simulator.addMemory(`Test memory ${i}`, 'test', ['test']);
        memoryIds.push(id);
      }

      // 삭제 성능 측정
      const { avgDuration } = await SimpleProfiler.measureMultiple(
        async () => {
          const randomId = memoryIds[Math.floor(Math.random() * memoryIds.length)];
          return await simulator.deleteMemory(randomId);
        },
        20
      );

      expect(avgDuration).toBeLessThan(5); // 평균 5ms 이내

      console.log(`Deletion - Average: ${avgDuration.toFixed(2)}ms for 20 delete operations`);
    });
  });

  describe('File I/O Performance', () => {
    it('should save and load data efficiently', async () => {
      // 테스트 데이터 준비
      for (let i = 0; i < 100; i++) {
        await simulator.addMemory(`File I/O test memory ${i}`, `project-${i % 5}`, ['file', 'io']);
      }

      // 저장 성능 측정
      const { duration: saveDuration } = await SimpleProfiler.measureTime(async () => {
        await simulator.saveToFile();
      });

      expect(saveDuration).toBeLessThan(500); // 500ms 이내

      // 로드 성능 측정
      const { duration: loadDuration } = await SimpleProfiler.measureTime(async () => {
        await simulator.loadFromFile();
      });

      expect(loadDuration).toBeLessThan(200); // 200ms 이내
      expect(simulator.getMemoryCount()).toBe(100);

      console.log(`File I/O - Save: ${saveDuration.toFixed(2)}ms, Load: ${loadDuration.toFixed(2)}ms`);
    });

    it('should handle multiple file operations', async () => {
      const fileOperations = 50;
      
      const { avgDuration } = await SimpleProfiler.measureMultiple(
        async () => {
          const testData = { 
            timestamp: new Date().toISOString(),
            data: Math.random().toString(36)
          };
          
          const filePath = join(PERF_TEST_DIR, `test_${Date.now()}.json`);
          await fs.writeFile(filePath, JSON.stringify(testData), 'utf8');
          
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        },
        fileOperations
      );

      expect(avgDuration).toBeLessThan(50); // 평균 50ms 이내

      console.log(`File Operations - Average: ${avgDuration.toFixed(2)}ms for ${fileOperations} operations`);
    });
  });

  describe('Scalability Performance', () => {
    it('should maintain performance with growing dataset', async () => {
      const batchSizes = [10, 25, 50, 75, 100];
      const performanceResults: Record<number, number> = {};

      for (const batchSize of batchSizes) {
        // 새로운 시뮬레이터로 각 배치 테스트
        const testSimulator = new SimpleMemorySimulator(PERF_TEST_DIR + `_batch_${batchSize}`);
        await testSimulator.initialize();

        const { avgDuration } = await SimpleProfiler.measureMultiple(
          async () => {
            return await testSimulator.addMemory(
              `Batch ${batchSize} memory`,
              'batch-test',
              ['batch', 'scalability']
            );
          },
          batchSize
        );

        performanceResults[batchSize] = avgDuration;
        await testSimulator.cleanup();
      }

      // 성능이 급격히 증가하지 않아야 함 (최대 5배 이내)
      const minAvg = Math.min(...Object.values(performanceResults));
      const maxAvg = Math.max(...Object.values(performanceResults));
      
      expect(maxAvg / minAvg).toBeLessThan(5);

      console.log('Scalability Results:', performanceResults);
    });

    it('should handle moderate load efficiently', async () => {
      const totalOperations = 200;
      const startTime = performance.now();

      // 혼합 작업 수행
      for (let i = 0; i < totalOperations; i++) {
        if (i % 4 === 0) {
          // 추가
          await simulator.addMemory(`Load test memory ${i}`, `project-${i % 10}`, ['load', 'test']);
        } else if (i % 4 === 1) {
          // 검색
          await simulator.searchMemories('load test');
        } else if (i % 4 === 2) {
          // 프로젝트별 조회
          await simulator.getMemoriesByProject(`project-${i % 10}`);
        } else {
          // 삭제 (메모리가 있는 경우)
          if (simulator.getMemoryCount() > 0) {
            const memories = await simulator.getMemoriesByProject(`project-${(i-1) % 10}`);
            if (memories.length > 0) {
              await simulator.deleteMemory(memories[0].id);
            }
          }
        }
      }

      const totalDuration = performance.now() - startTime;
      const avgOperationTime = totalDuration / totalOperations;

      expect(avgOperationTime).toBeLessThan(10); // 평균 10ms 이내
      expect(totalDuration).toBeLessThan(5000); // 총 5초 이내

      console.log(`Load Test - Total: ${totalDuration.toFixed(2)}ms, Average per operation: ${avgOperationTime.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage Performance', () => {
    it('should handle large datasets efficiently', async () => {
      const startMemory = process.memoryUsage();
      const datasetSize = 500;

      // 대량 데이터 추가
      for (let i = 0; i < datasetSize; i++) {
        await simulator.addMemory(
          `Large dataset memory ${i} with extended content for memory testing`,
          `project-${i % 20}`,
          ['large', 'dataset', `batch-${Math.floor(i / 50)}`]
        );
      }

      const endMemory = process.memoryUsage();
      const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

      expect(simulator.getMemoryCount()).toBe(datasetSize);
      expect(simulator.getIndexSize()).toBeGreaterThan(0);
      
      // 메모리 사용량이 50MB를 넘지 않아야 함
      expect(memoryUsed).toBeLessThan(50 * 1024 * 1024);

      console.log(`Memory Usage - Dataset: ${datasetSize} items, Memory used: ${Math.round(memoryUsed / 1024 / 1024)}MB`);
    });
  });

  describe('Performance Summary', () => {
    it('should provide overall performance metrics', async () => {
      const metrics = {
        add: 0,
        search: 0,
        delete: 0,
        fileIO: 0
      };

      // 추가 성능
      const { avgDuration: addAvg } = await SimpleProfiler.measureMultiple(
        async () => await simulator.addMemory('Summary test', 'summary', ['test']),
        10
      );
      metrics.add = addAvg;

      // 검색 성능
      const { avgDuration: searchAvg } = await SimpleProfiler.measureMultiple(
        async () => await simulator.searchMemories('summary'),
        10
      );
      metrics.search = searchAvg;

      // 삭제 성능
      const memories = await simulator.getMemoriesByProject('summary');
      if (memories.length > 0) {
        const { avgDuration: deleteAvg } = await SimpleProfiler.measureMultiple(
          async () => await simulator.deleteMemory(memories[0].id),
          Math.min(5, memories.length)
        );
        metrics.delete = deleteAvg;
      }

      // 파일 I/O 성능
      const { duration: fileIODuration } = await SimpleProfiler.measureTime(async () => {
        await simulator.saveToFile();
        await simulator.loadFromFile();
      });
      metrics.fileIO = fileIODuration;

      // 성능 기준 확인
      expect(metrics.add).toBeLessThan(10);
      expect(metrics.search).toBeLessThan(5);
      expect(metrics.delete).toBeLessThan(5);
      expect(metrics.fileIO).toBeLessThan(300);

      console.log('Performance Summary:', {
        'Add (avg)': `${metrics.add.toFixed(2)}ms`,
        'Search (avg)': `${metrics.search.toFixed(2)}ms`,
        'Delete (avg)': `${metrics.delete.toFixed(2)}ms`,
        'File I/O': `${metrics.fileIO.toFixed(2)}ms`
      });
    });
  });
});