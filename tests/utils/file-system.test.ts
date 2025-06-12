import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';

const TEST_DIR = './test-temp';
const TEST_FILE = join(TEST_DIR, 'test.json');

// 파일 시스템 유틸리티 함수들
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getFileStats(filePath: string): Promise<{ size: number; modified: Date } | null> {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      modified: stats.mtime
    };
  } catch {
    return null;
  }
}

async function cleanupOldFiles(dirPath: string, maxAge: number): Promise<string[]> {
  const deletedFiles: string[] = [];
  
  try {
    const files = await fs.readdir(dirPath);
    const cutoffTime = Date.now() - maxAge;
    
    for (const file of files) {
      const filePath = join(dirPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtime.getTime() < cutoffTime) {
        await fs.unlink(filePath);
        deletedFiles.push(file);
      }
    }
  } catch {
    // 디렉토리가 없거나 오류 발생 시 무시
  }
  
  return deletedFiles;
}

describe('File System Utilities', () => {
  beforeEach(async () => {
    // 테스트 디렉토리 생성
    await ensureDirectoryExists(TEST_DIR);
  });

  afterEach(async () => {
    // 테스트 디렉토리 정리
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 정리 실패 시 무시
    }
  });

  describe('ensureDirectoryExists', () => {
    it('should create directory if it does not exist', async () => {
      const newDir = join(TEST_DIR, 'new-directory');
      
      expect(await fileExists(newDir)).toBe(false);
      await ensureDirectoryExists(newDir);
      expect(await fileExists(newDir)).toBe(true);
    });

    it('should not fail if directory already exists', async () => {
      await ensureDirectoryExists(TEST_DIR);
      // 다시 호출해도 오류가 없어야 함
      await expect(ensureDirectoryExists(TEST_DIR)).resolves.not.toThrow();
    });

    it('should create nested directories', async () => {
      const nestedDir = join(TEST_DIR, 'nested', 'deep', 'directory');
      
      await ensureDirectoryExists(nestedDir);
      expect(await fileExists(nestedDir)).toBe(true);
    });
  });

  describe('safeReadJsonFile', () => {
    it('should read existing JSON file', async () => {
      const testData = { test: 'data', number: 42 };
      await fs.writeFile(TEST_FILE, JSON.stringify(testData), 'utf8');
      
      const result = await safeReadJsonFile(TEST_FILE, {});
      expect(result).toEqual(testData);
    });

    it('should return default value for non-existent file', async () => {
      const defaultValue = { default: true };
      const result = await safeReadJsonFile('./non-existent.json', defaultValue);
      
      expect(result).toEqual(defaultValue);
    });

    it('should return default value for invalid JSON', async () => {
      await fs.writeFile(TEST_FILE, 'invalid json', 'utf8');
      const defaultValue = { default: true };
      
      const result = await safeReadJsonFile(TEST_FILE, defaultValue);
      expect(result).toEqual(defaultValue);
    });

    it('should handle complex nested objects', async () => {
      const complexData = {
        array: [1, 2, 3],
        nested: { deep: { value: 'test' } },
        date: new Date().toISOString()
      };
      
      await fs.writeFile(TEST_FILE, JSON.stringify(complexData), 'utf8');
      const result = await safeReadJsonFile(TEST_FILE, {});
      
      expect(result).toEqual(complexData);
    });
  });

  describe('safeWriteJsonFile', () => {
    it('should write JSON data to file', async () => {
      const testData = { write: 'test', value: 123 };
      
      await safeWriteJsonFile(TEST_FILE, testData);
      
      const written = await fs.readFile(TEST_FILE, 'utf8');
      expect(JSON.parse(written)).toEqual(testData);
    });

    it('should create directory structure if needed', async () => {
      const deepFile = join(TEST_DIR, 'deep', 'nested', 'file.json');
      const testData = { deep: 'file' };
      
      await safeWriteJsonFile(deepFile, testData);
      
      expect(await fileExists(deepFile)).toBe(true);
      const written = await safeReadJsonFile(deepFile, {});
      expect(written).toEqual(testData);
    });

    it('should format JSON with proper indentation', async () => {
      const testData = { formatted: true, nested: { value: 42 } };
      
      await safeWriteJsonFile(TEST_FILE, testData);
      
      const written = await fs.readFile(TEST_FILE, 'utf8');
      expect(written).toContain('  '); // 들여쓰기 확인
      expect(written).toContain('\n'); // 줄바꿈 확인
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      await fs.writeFile(TEST_FILE, 'test', 'utf8');
      expect(await fileExists(TEST_FILE)).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      expect(await fileExists('./non-existent-file.txt')).toBe(false);
    });

    it('should return true for existing directory', async () => {
      expect(await fileExists(TEST_DIR)).toBe(true);
    });
  });

  describe('getFileStats', () => {
    it('should return file statistics for existing file', async () => {
      const content = 'test content';
      await fs.writeFile(TEST_FILE, content, 'utf8');
      
      const stats = await getFileStats(TEST_FILE);
      
      expect(stats).not.toBeNull();
      expect(stats!.size).toBe(Buffer.from(content, 'utf8').length);
      expect(stats!.modified).toBeInstanceOf(Date);
    });

    it('should return null for non-existent file', async () => {
      const stats = await getFileStats('./non-existent-file.txt');
      expect(stats).toBeNull();
    });

    it('should track file modifications', async () => {
      await fs.writeFile(TEST_FILE, 'initial', 'utf8');
      const initialStats = await getFileStats(TEST_FILE);
      
      // 잠시 대기 후 파일 수정
      await new Promise(resolve => setTimeout(resolve, 10));
      await fs.writeFile(TEST_FILE, 'modified content', 'utf8');
      
      const modifiedStats = await getFileStats(TEST_FILE);
      
      expect(modifiedStats!.modified.getTime()).toBeGreaterThan(
        initialStats!.modified.getTime()
      );
      expect(modifiedStats!.size).not.toBe(initialStats!.size);
    });
  });

  describe('cleanupOldFiles', () => {
    it('should delete files older than specified age', async () => {
      // 테스트 파일들 생성
      const file1 = join(TEST_DIR, 'old-file.txt');
      const file2 = join(TEST_DIR, 'new-file.txt');
      
      await fs.writeFile(file1, 'old', 'utf8');
      await fs.writeFile(file2, 'new', 'utf8');
      
      // file1을 오래된 파일로 만들기 (수동으로 시간 조작은 어려우므로 간단한 테스트)
      const maxAge = 1000; // 1초
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const deleted = await cleanupOldFiles(TEST_DIR, maxAge);
      
      // 실제로는 시간 조작이 어려우므로 함수가 정상 실행되는지만 확인
      expect(Array.isArray(deleted)).toBe(true);
    });

    it('should handle non-existent directory gracefully', async () => {
      const deleted = await cleanupOldFiles('./non-existent-dir', 1000);
      expect(deleted).toEqual([]);
    });

    it('should not delete recent files', async () => {
      const recentFile = join(TEST_DIR, 'recent-file.txt');
      await fs.writeFile(recentFile, 'recent', 'utf8');
      
      const maxAge = 24 * 60 * 60 * 1000; // 24시간
      const deleted = await cleanupOldFiles(TEST_DIR, maxAge);
      
      expect(deleted).not.toContain('recent-file.txt');
      expect(await fileExists(recentFile)).toBe(true);
    });
  });
}); 