import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';

const TEST_DIR = './test-simple-integration';

describe('Simple Integration Tests', () => {
  beforeEach(async () => {
    try {
      await fs.mkdir(TEST_DIR, { recursive: true });
    } catch (error) {
      // 디렉토리가 이미 존재하는 경우 무시
    }
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 정리 실패 시 무시
    }
  });

  describe('File System Integration', () => {
    it('should create and read JSON files', async () => {
      const testFile = join(TEST_DIR, 'test.json');
      const testData = { message: 'integration test', timestamp: new Date().toISOString() };

      // 파일 작성
      await fs.writeFile(testFile, JSON.stringify(testData, null, 2), 'utf8');

      // 파일 읽기 및 검증
      const fileExists = await fs.access(testFile).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      const readData = JSON.parse(await fs.readFile(testFile, 'utf8'));
      expect(readData.message).toBe('integration test');
      expect(readData.timestamp).toBeTruthy();
    });

    it('should handle multiple file operations', async () => {
      const files = ['file1.json', 'file2.json', 'file3.json'];
      
      // 여러 파일 생성
      for (let i = 0; i < files.length; i++) {
        const filePath = join(TEST_DIR, files[i]);
        const data = { id: i, name: `File ${i}` };
        await fs.writeFile(filePath, JSON.stringify(data), 'utf8');
      }

      // 파일들 확인
      for (let i = 0; i < files.length; i++) {
        const filePath = join(TEST_DIR, files[i]);
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        expect(exists).toBe(true);

        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
        expect(data.id).toBe(i);
        expect(data.name).toBe(`File ${i}`);
      }
    });

    it('should handle data consistency', async () => {
      // 메모리 시뮬레이션 데이터
      const memoryData = {
        version: '1.0',
        memories: [
          { id: 'mem_1', content: 'Test memory 1', project: 'test-project' },
          { id: 'mem_2', content: 'Test memory 2', project: 'test-project' }
        ],
        stats: { total: 2, projects: ['test-project'] }
      };

      // 데이터 저장
      const dataFile = join(TEST_DIR, 'memory_data.json');
      await fs.writeFile(dataFile, JSON.stringify(memoryData, null, 2), 'utf8');

      // 인덱스 시뮬레이션
      const indexData = {
        keywords: { 'test': ['mem_1', 'mem_2'] },
        projects: { 'test-project': ['mem_1', 'mem_2'] }
      };

      const indexFile = join(TEST_DIR, 'search_index.json');
      await fs.writeFile(indexFile, JSON.stringify(indexData, null, 2), 'utf8');

      // 데이터 일관성 확인
      const savedMemory = JSON.parse(await fs.readFile(dataFile, 'utf8'));
      const savedIndex = JSON.parse(await fs.readFile(indexFile, 'utf8'));

      expect(savedMemory.memories).toHaveLength(2);
      expect(savedMemory.stats.total).toBe(2);
      expect(savedIndex.keywords.test).toEqual(['mem_1', 'mem_2']);
      expect(savedIndex.projects['test-project']).toEqual(['mem_1', 'mem_2']);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid JSON gracefully', async () => {
      const invalidFile = join(TEST_DIR, 'invalid.json');
      await fs.writeFile(invalidFile, '{ invalid json content', 'utf8');

      // 파싱 오류 확인
      try {
        const content = await fs.readFile(invalidFile, 'utf8');
        JSON.parse(content);
        expect.fail('Should have thrown JSON parsing error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      // 수정 후 재시도
      await fs.writeFile(invalidFile, '{"fixed": true}', 'utf8');
      const fixedData = JSON.parse(await fs.readFile(invalidFile, 'utf8'));
      expect(fixedData.fixed).toBe(true);
    });

    it('should handle missing files gracefully', async () => {
      const missingFile = join(TEST_DIR, 'nonexistent.json');
      
      const exists = await fs.access(missingFile).then(() => true).catch(() => false);
      expect(exists).toBe(false);

      // 기본값으로 파일 생성
      const defaultData = { created: true, timestamp: new Date().toISOString() };
      await fs.writeFile(missingFile, JSON.stringify(defaultData), 'utf8');

      const createdData = JSON.parse(await fs.readFile(missingFile, 'utf8'));
      expect(createdData.created).toBe(true);
    });
  });

  describe('Performance Integration', () => {
    it('should handle moderate data loads efficiently', async () => {
      const startTime = Date.now();

      // 50개 파일 생성
      const operations = [];
      for (let i = 0; i < 50; i++) {
        const filePath = join(TEST_DIR, `perf_${i}.json`);
        const data = { index: i, content: `Performance test data ${i}` };
        operations.push(fs.writeFile(filePath, JSON.stringify(data), 'utf8'));
      }

      await Promise.all(operations);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 성능 확인 (5초 이내)
      expect(duration).toBeLessThan(5000);

      // 파일들이 제대로 생성되었는지 확인
      const files = await fs.readdir(TEST_DIR);
      const perfFiles = files.filter(f => f.startsWith('perf_'));
      expect(perfFiles).toHaveLength(50);
    });
  });
});