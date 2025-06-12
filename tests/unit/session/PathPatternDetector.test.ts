/**
 * PathPatternDetector 유닛 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PathPatternDetector, ProjectType, ProjectDetectionResult } from '../../../src/session/PathPatternDetector.js';

// 모의 파일 시스템
const mockFileSystem = new Map<string, string | 'directory'>();

// fs 모듈 모의
vi.mock('fs/promises', () => ({
  stat: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  access: vi.fn()
}));

describe('PathPatternDetector', () => {
  let detector: PathPatternDetector;

  beforeEach(() => {
    detector = new PathPatternDetector();
    mockFileSystem.clear();
    vi.clearAllMocks();
    
    // 기본 모의 구현
    setupMockFileSystem();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupMockFileSystem() {
    (fs.stat as any).mockImplementation(async (filePath: string) => {
      // Windows/Unix 경로를 정규화
      const normalizedPath = filePath.replace(/\\/g, '/');
      
      if (mockFileSystem.has(normalizedPath)) {
        const type = mockFileSystem.get(normalizedPath);
        return {
          isDirectory: () => type === 'directory',
          isFile: () => type !== 'directory'
        };
      }
      
      throw new Error(`File not found: ${filePath}`);
    });

    (fs.access as any).mockImplementation(async (filePath: string) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      if (!mockFileSystem.has(normalizedPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
    });

    (fs.readFile as any).mockImplementation(async (filePath: string) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const content = mockFileSystem.get(normalizedPath);
      if (typeof content === 'string') {
        return content;
      }
      throw new Error(`Cannot read directory as file: ${filePath}`);
    });

    (fs.readdir as any).mockImplementation(async (dirPath: string, options?: any) => {
      const normalizedPath = dirPath.replace(/\\/g, '/');
      const entries = [];
      
      for (const [filePath, type] of mockFileSystem.entries()) {
        const fileDir = path.dirname(filePath).replace(/\\/g, '/');
        if (fileDir === normalizedPath) {
          const name = path.basename(filePath);
          if (options?.withFileTypes) {
            entries.push({
              name,
              isFile: () => type !== 'directory',
              isDirectory: () => type === 'directory'
            });
          } else {
            entries.push(name);
          }
        }
      }
      
      return entries;
    });
  }

  function createMockProject(rootPath: string, projectType: 'node' | 'python' | 'rust' | 'go' | 'java') {
    // Windows/Unix 경로를 정규화
    const normalizedRoot = rootPath.replace(/\\/g, '/');
    
    // 프로젝트 루트 디렉토리
    mockFileSystem.set(normalizedRoot, 'directory');
    
    // Git 저장소
    const gitDir = normalizedRoot + '/.git';
    const gitConfig = gitDir + '/config';
    mockFileSystem.set(gitDir, 'directory');
    mockFileSystem.set(gitConfig, `[remote "origin"]
    url = https://github.com/user/repo.git`);

    switch (projectType) {
      case 'node':
        mockFileSystem.set(normalizedRoot + '/package.json', JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
          description: 'Test Node.js project',
          author: 'Test Author',
          license: 'MIT',
          dependencies: {
            'express': '^4.18.0',
            'typescript': '^5.0.0'
          },
          scripts: {
            'start': 'node index.js',
            'build': 'tsc'
          }
        }));
        mockFileSystem.set(normalizedRoot + '/package-lock.json', '{}');
        break;

      case 'python':
        mockFileSystem.set(normalizedRoot + '/requirements.txt', 
          'django>=4.0.0\nrequests>=2.28.0\npytest>=7.0.0');
        mockFileSystem.set(normalizedRoot + '/setup.py', `
from setuptools import setup

setup(
    name="test-python-project",
    version="1.0.0",
    description="Test Python project"
)`);
        break;

      case 'rust':
        mockFileSystem.set(normalizedRoot + '/Cargo.toml', `
[package]
name = "test-rust-project"
version = "1.0.0"
description = "Test Rust project"
authors = ["Test Author <test@example.com>"]
license = "MIT"

[dependencies]
serde = "1.0"
`);
        mockFileSystem.set(normalizedRoot + '/Cargo.lock', '# This file is automatically @generated');
        break;

      case 'go':
        mockFileSystem.set(normalizedRoot + '/go.mod', `
module github.com/user/test-go-project

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
)
`);
        mockFileSystem.set(normalizedRoot + '/go.sum', 'checksums here');
        break;

      case 'java':
        mockFileSystem.set(normalizedRoot + '/pom.xml', `
<project>
    <groupId>com.example</groupId>
    <artifactId>test-java-project</artifactId>
    <version>1.0.0</version>
    <description>Test Java project</description>
</project>
`);
        break;
    }
  }

  describe('프로젝트 감지', () => {
    it('Node.js 프로젝트를 정확히 감지해야 함', async () => {
      const projectPath = '/test/nodejs-project';
      createMockProject(projectPath, 'node');

      const result = await detector.detectProject(projectPath);

      expect(result).not.toBeNull();
      expect(result?.projectType).toContain(ProjectType.NODE_JS);
      expect(result?.projectName).toBe('test-project');
      expect(result?.gitRepository).toBe('https://github.com/user/repo.git');
      expect(result?.packageManager).toBe('npm');
      expect(result?.metadata.name).toBe('test-project');
      expect(result?.metadata.version).toBe('1.0.0');
      expect(result?.configFiles.some(f => f.includes('package.json'))).toBe(true);
    });

    it('Python 프로젝트를 정확히 감지해야 함', async () => {
      const projectPath = '/test/python-project';
      createMockProject(projectPath, 'python');

      const result = await detector.detectProject(projectPath);

      expect(result).not.toBeNull();
      expect(result?.projectType).toContain(ProjectType.PYTHON);
      expect(result?.packageManager).toBe('pip');
      expect(result?.configFiles.some(f => f.includes('requirements.txt'))).toBe(true);
    });

    it('Rust 프로젝트를 정확히 감지해야 함', async () => {
      const projectPath = '/test/rust-project';
      createMockProject(projectPath, 'rust');

      const result = await detector.detectProject(projectPath);

      expect(result).not.toBeNull();
      expect(result?.projectType).toContain(ProjectType.RUST);
      expect(result?.packageManager).toBe('cargo');
      expect(result?.metadata.name).toBe('test-rust-project');
    });

    it('Go 프로젝트를 정확히 감지해야 함', async () => {
      const projectPath = '/test/go-project';
      createMockProject(projectPath, 'go');

      const result = await detector.detectProject(projectPath);

      expect(result).not.toBeNull();
      expect(result?.projectType).toContain(ProjectType.GO);
      expect(result?.packageManager).toBe('go');
      expect(result?.metadata.module).toBe('github.com/user/test-go-project');
    });

    it('Java 프로젝트를 정확히 감지해야 함', async () => {
      const projectPath = '/test/java-project';
      createMockProject(projectPath, 'java');

      const result = await detector.detectProject(projectPath);

      expect(result).not.toBeNull();
      expect(result?.projectType).toContain(ProjectType.JAVA);
      expect(result?.metadata.name).toBe('test-java-project');
    });
  });

  describe('프로젝트 루트 찾기', () => {
    it('하위 디렉토리에서 프로젝트 루트를 찾아야 함', async () => {
      const projectRoot = '/test/project';
      const subPath = '/test/project/src/components';
      
      createMockProject(projectRoot, 'node');
      
      // 하위 디렉토리들 생성
      mockFileSystem.set('/test/project/src', 'directory');
      mockFileSystem.set('/test/project/src/components', 'directory');

      const result = await detector.detectProject(subPath);

      expect(result).not.toBeNull();
      expect(result?.projectRoot).toBe(projectRoot.replace(/\\/g, '/'));
    });

    it('Git 저장소가 없는 프로젝트도 감지해야 함', async () => {
      const projectPath = '/test/no-git-project';
      
      // Git 없이 Node.js 프로젝트 생성
      mockFileSystem.set('/test/no-git-project', 'directory');
      mockFileSystem.set('/test/no-git-project/package.json', JSON.stringify({
        name: 'no-git-project',
        version: '1.0.0'
      }));

      const result = await detector.detectProject(projectPath);

      expect(result).not.toBeNull();
      expect(result?.projectType).toContain(ProjectType.NODE_JS);
      expect(result?.gitRepository).toBeUndefined();
    });
  });

  describe('메타데이터 추출', () => {
    it('package.json에서 정확한 메타데이터를 추출해야 함', async () => {
      const projectPath = '/test/metadata-project';
      createMockProject(projectPath, 'node');

      const result = await detector.detectProject(projectPath);

      expect(result?.metadata).toEqual({
        name: 'test-project',
        version: '1.0.0',
        description: 'Test Node.js project',
        author: 'Test Author',
        license: 'MIT',
        dependencies: {
          'express': '^4.18.0',
          'typescript': '^5.0.0'
        },
        scripts: {
          'start': 'node index.js',
          'build': 'tsc'
        }
      });
    });

    it('requirements.txt를 정확히 파싱해야 함', async () => {
      const projectPath = '/test/python-deps';
      createMockProject(projectPath, 'python');

      const result = await detector.detectProject(projectPath);

      expect(result?.metadata.dependencies).toEqual({
        'django': '>=4.0.0',
        'requests': '>=2.28.0',
        'pytest': '>=7.0.0'
      });
    });
  });

  describe('패키지 매니저 감지', () => {
    it('yarn.lock이 있으면 yarn을 감지해야 함', async () => {
      const projectPath = '/test/yarn-project';
      createMockProject(projectPath, 'node');
      
      // yarn.lock 추가
      mockFileSystem.set(projectPath.replace(/\\/g, '/') + '/yarn.lock', '# yarn lockfile');

      const result = await detector.detectProject(projectPath);

      expect(result?.packageManager).toBe('yarn');
    });

    it('pnpm-lock.yaml이 있으면 pnpm을 감지해야 함', async () => {
      const projectPath = '/test/pnpm-project';
      createMockProject(projectPath, 'node');
      
      // pnpm-lock.yaml 추가 (우선순위가 가장 높음)
      mockFileSystem.set(projectPath.replace(/\\/g, '/') + '/pnpm-lock.yaml', 'lockfileVersion: 6.0');

      const result = await detector.detectProject(projectPath);

      expect(result?.packageManager).toBe('pnpm');
    });
  });

  describe('커스텀 규칙', () => {
    it('커스텀 패턴 규칙을 추가할 수 있어야 함', () => {
      const customRule = {
        name: 'Custom Framework',
        patterns: ['**/custom.config.js'],
        projectType: ProjectType.GENERIC,
        configFiles: ['custom.config.js'],
        priority: 100
      };

      detector.addCustomRule(customRule);
      const rules = detector.getRules();

      expect(rules).toContainEqual(customRule);
      expect(rules[0]).toBe(customRule); // 가장 높은 우선순위
    });

    it('규칙을 제거할 수 있어야 함', () => {
      const initialRulesCount = detector.getRules().length;
      
      const removed = detector.removeRule('Node.js/TypeScript');
      
      expect(removed).toBe(true);
      expect(detector.getRules()).toHaveLength(initialRulesCount - 1);
    });

    it('존재하지 않는 규칙 제거는 실패해야 함', () => {
      const removed = detector.removeRule('NonExistent');
      
      expect(removed).toBe(false);
    });
  });

  describe('에러 처리', () => {
    it('존재하지 않는 경로에 대해 null을 반환해야 함', async () => {
      const result = await detector.detectProject('/nonexistent/path');
      
      expect(result).toBeNull();
    });

    it('파일을 디렉토리로 감지하려 할 때 null을 반환해야 함', async () => {
      mockFileSystem.set('/test/file.txt', 'file content');
      
      const result = await detector.detectProject('/test/file.txt');
      
      expect(result).toBeNull();
    });

    it('잘못된 JSON 파일이 있어도 기본값으로 처리해야 함', async () => {
      const projectPath = '/test/broken-json';
      
      mockFileSystem.set('/test/broken-json', 'directory');
      mockFileSystem.set('/test/broken-json/package.json', '{ invalid json }');

      const result = await detector.detectProject(projectPath);

      expect(result).not.toBeNull();
      expect(result?.metadata).toEqual({});
    });
  });

  describe('신뢰도 계산', () => {
    it('메타데이터가 있으면 신뢰도가 증가해야 함', async () => {
      const projectPath = '/test/high-confidence';
      createMockProject(projectPath, 'node');

      const result = await detector.detectProject(projectPath);

      expect(result?.confidence).toBeGreaterThan(90);
    });

    it('설정 파일이 많을수록 신뢰도가 높아야 함', async () => {
      const projectPath = '/test/many-configs';
      createMockProject(projectPath, 'node');
      
      // 추가 설정 파일들
      mockFileSystem.set(path.join(projectPath, 'tsconfig.json'), '{}');
      mockFileSystem.set(path.join(projectPath, '.eslintrc.json'), '{}');

      const result = await detector.detectProject(projectPath);

      expect(result?.confidence).toBeGreaterThan(85);
    });
  });
});
