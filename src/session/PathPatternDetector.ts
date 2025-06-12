/**
 * PathPatternDetector - 프로젝트 경로 패턴 감지 시스템
 * 프로젝트 루트 디렉토리, Git 저장소, 설정 파일을 기반으로 프로젝트를 감지
 */

import * as path from 'path';
import * as fs from 'fs/promises';

// 프로젝트 타입 정의
export enum ProjectType {
  NODE_JS = 'nodejs',
  PYTHON = 'python',
  JAVA = 'java',
  CSHARP = 'csharp',
  RUST = 'rust',
  GO = 'go',
  TYPESCRIPT = 'typescript',
  REACT = 'react',
  NEXT_JS = 'nextjs',
  VUE = 'vue',
  ANGULAR = 'angular',
  GENERIC = 'generic'
}

// 프로젝트 감지 결과
export interface ProjectDetectionResult {
  projectRoot: string;
  projectName: string;
  projectType: ProjectType[];
  gitRepository?: string;
  configFiles: string[];
  packageManager?: string;
  metadata: ProjectMetadata;
  confidence: number; // 0-100, 감지 신뢰도
}

// 프로젝트 메타데이터
export interface ProjectMetadata {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  license?: string;
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: any;
}

// 경로 패턴 규칙
export interface PathPatternRule {
  name: string;
  patterns: string[];
  projectType: ProjectType;
  configFiles: string[];
  priority: number; // 높을수록 우선순위
  metadataExtractor?: (configPath: string) => Promise<ProjectMetadata>;
}

export class PathPatternDetector {
  private rules: PathPatternRule[] = [];

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * 기본 패턴 규칙 초기화
   */
  private initializeDefaultRules(): void {
    this.rules = [
      // Node.js/TypeScript 프로젝트
      {
        name: 'Node.js/TypeScript',
        patterns: ['**/package.json'],
        projectType: ProjectType.NODE_JS,
        configFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
        priority: 90,
        metadataExtractor: this.extractNodeMetadata.bind(this)
      },

      // Next.js 프로젝트
      {
        name: 'Next.js',
        patterns: ['**/next.config.js', '**/next.config.ts'],
        projectType: ProjectType.NEXT_JS,
        configFiles: ['next.config.js', 'next.config.ts', 'package.json'],
        priority: 95,
        metadataExtractor: this.extractNodeMetadata.bind(this)
      },

      // React 프로젝트
      {
        name: 'React',
        patterns: ['**/src/App.jsx', '**/src/App.tsx', '**/public/index.html'],
        projectType: ProjectType.REACT,
        configFiles: ['package.json', 'src/App.tsx', 'src/App.jsx'],
        priority: 85,
        metadataExtractor: this.extractNodeMetadata.bind(this)
      },

      // Python 프로젝트
      {
        name: 'Python',
        patterns: ['**/requirements.txt', '**/pyproject.toml', '**/setup.py', '**/Pipfile'],
        projectType: ProjectType.PYTHON,
        configFiles: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
        priority: 80,
        metadataExtractor: this.extractPythonMetadata.bind(this)
      },

      // Java 프로젝트  
      {
        name: 'Java',
        patterns: ['**/pom.xml', '**/build.gradle', '**/gradle.properties'],
        projectType: ProjectType.JAVA,
        configFiles: ['pom.xml', 'build.gradle', 'gradle.properties'],
        priority: 80,
        metadataExtractor: this.extractJavaMetadata.bind(this)
      },

      // C# 프로젝트
      {
        name: 'C#',
        patterns: ['**/*.csproj', '**/*.sln', '**/project.json'],
        projectType: ProjectType.CSHARP,
        configFiles: ['*.csproj', '*.sln', 'project.json'],
        priority: 80
      },

      // Rust 프로젝트
      {
        name: 'Rust',
        patterns: ['**/Cargo.toml'],
        projectType: ProjectType.RUST,
        configFiles: ['Cargo.toml', 'Cargo.lock'],
        priority: 90,
        metadataExtractor: this.extractRustMetadata.bind(this)
      },

      // Go 프로젝트
      {
        name: 'Go',
        patterns: ['**/go.mod', '**/go.sum'],
        projectType: ProjectType.GO,
        configFiles: ['go.mod', 'go.sum'],
        priority: 90,
        metadataExtractor: this.extractGoMetadata.bind(this)
      },

      // Vue.js 프로젝트
      {
        name: 'Vue.js',
        patterns: ['**/vue.config.js', '**/vue.config.ts'],
        projectType: ProjectType.VUE,
        configFiles: ['vue.config.js', 'vue.config.ts', 'package.json'],
        priority: 85,
        metadataExtractor: this.extractNodeMetadata.bind(this)
      },

      // Angular 프로젝트
      {
        name: 'Angular',
        patterns: ['**/angular.json', '**/ng-package.json'],
        projectType: ProjectType.ANGULAR,
        configFiles: ['angular.json', 'package.json', 'ng-package.json'],
        priority: 85,
        metadataExtractor: this.extractNodeMetadata.bind(this)
      }
    ];
  }

  /**
   * 지정된 경로에서 프로젝트 감지
   */
  async detectProject(targetPath: string): Promise<ProjectDetectionResult | null> {
    try {
      const normalizedPath = path.resolve(targetPath);
      
      // 경로가 존재하는지 확인
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        return null;
      }

      // 프로젝트 루트 찾기
      const projectRoot = await this.findProjectRoot(normalizedPath);
      if (!projectRoot) {
        return null;
      }

      // 프로젝트 타입 및 설정 파일 감지
      const detectionResults = await this.analyzeProjectStructure(projectRoot);
      if (detectionResults.length === 0) {
        return null;
      }

      // 최고 우선순위 결과 선택
      const bestResult = detectionResults.sort((a, b) => b.priority - a.priority)[0];
      
      // Git 저장소 정보 확인
      const gitInfo = await this.detectGitRepository(projectRoot);
      
      // 프로젝트 이름 추출
      const projectName = await this.extractProjectName(projectRoot, bestResult);

      return {
        projectRoot,
        projectName,
        projectType: [bestResult.projectType],
        gitRepository: gitInfo?.remoteUrl,
        configFiles: bestResult.configFiles,
        packageManager: await this.detectPackageManager(projectRoot),
        metadata: bestResult.metadata || {},
        confidence: bestResult.confidence
      };

    } catch (error) {
      console.error('Project detection error:', error);
      return null;
    }
  }

  /**
   * 프로젝트 루트 디렉토리 찾기
   */
  private async findProjectRoot(startPath: string): Promise<string | null> {
    let currentPath = startPath;
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      // Git 저장소 확인
      if (await this.isGitRepository(currentPath)) {
        return currentPath;
      }

      // 주요 프로젝트 설정 파일 확인
      const hasProjectFiles = await this.hasProjectConfigFiles(currentPath);
      if (hasProjectFiles) {
        return currentPath;
      }

      // 상위 디렉토리로 이동
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) break;
      currentPath = parentPath;
    }

    return null;
  }

  /**
   * 프로젝트 구조 분석
   */
  private async analyzeProjectStructure(projectRoot: string): Promise<Array<{
    rule: PathPatternRule;
    projectType: ProjectType;
    configFiles: string[];
    metadata?: ProjectMetadata;
    confidence: number;
    priority: number;
  }>> {
    const results: Array<{
      rule: PathPatternRule;
      projectType: ProjectType;
      configFiles: string[];
      metadata?: ProjectMetadata;
      confidence: number;
      priority: number;
    }> = [];

    for (const rule of this.rules) {
      const matchedFiles = await this.findMatchingFiles(projectRoot, rule.patterns);
      
      if (matchedFiles.length > 0) {
        let metadata: ProjectMetadata = {};
        let confidence = rule.priority;

        // 메타데이터 추출
        if (rule.metadataExtractor) {
          try {
            metadata = await rule.metadataExtractor(matchedFiles[0]);
            confidence += 10; // 메타데이터 추출 성공 시 신뢰도 증가
          } catch (error) {
            console.warn(`Failed to extract metadata for ${rule.name}:`, error);
          }
        }

        // 설정 파일 존재 확인
        const existingConfigFiles = await this.findExistingConfigFiles(projectRoot, rule.configFiles);
        
        results.push({
          rule,
          projectType: rule.projectType,
          configFiles: existingConfigFiles,
          metadata,
          confidence: Math.min(confidence, 100),
          priority: rule.priority
        });
      }
    }

    return results;
  }

  /**
   * 패턴에 매칭되는 파일 찾기
   */
  private async findMatchingFiles(rootPath: string, patterns: string[]): Promise<string[]> {
    const matchedFiles: string[] = [];

    for (const pattern of patterns) {
      try {
        // 간단한 글로브 패턴 구현
        if (pattern.includes('**/')) {
          const fileName = pattern.replace('**/', '');
          const found = await this.searchFileRecursively(rootPath, fileName, 3); // 최대 3레벨까지
          matchedFiles.push(...found);
        } else {
          const filePath = path.join(rootPath, pattern);
          try {
            await fs.access(filePath);
            matchedFiles.push(filePath);
          } catch {
            // 파일이 존재하지 않음
          }
        }
      } catch (error) {
        console.warn(`Pattern matching error for ${pattern}:`, error);
      }
    }

    return matchedFiles;
  }

  /**
   * 파일을 재귀적으로 검색
   */
  private async searchFileRecursively(dir: string, fileName: string, maxDepth: number): Promise<string[]> {
    if (maxDepth <= 0) return [];
    
    const found: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isFile() && entry.name === fileName) {
          found.push(fullPath);
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subResults = await this.searchFileRecursively(fullPath, fileName, maxDepth - 1);
          found.push(...subResults);
        }
      }
    } catch (error) {
      // 디렉토리 읽기 실패 시 무시
    }
    
    return found;
  }
  /**
   * Git 저장소 확인
   */
  private async isGitRepository(dirPath: string): Promise<boolean> {
    try {
      const gitPath = path.join(dirPath, '.git');
      const stats = await fs.stat(gitPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Git 저장소 정보 감지
   */
  private async detectGitRepository(projectRoot: string): Promise<{ remoteUrl?: string } | null> {
    try {
      const gitConfigPath = path.join(projectRoot, '.git', 'config');
      const gitConfig = await fs.readFile(gitConfigPath, 'utf-8');
      
      // remote origin URL 추출
      const remoteMatch = gitConfig.match(/\[remote "origin"\]\s*\n\s*url\s*=\s*(.+)/);
      const remoteUrl = remoteMatch ? remoteMatch[1].trim() : undefined;
      
      return { remoteUrl };
    } catch {
      return null;
    }
  }

  /**
   * 프로젝트 설정 파일 존재 확인
   */
  private async hasProjectConfigFiles(dirPath: string): Promise<boolean> {
    const commonConfigFiles = [
      'package.json', 'requirements.txt', 'pom.xml', 'build.gradle',
      'Cargo.toml', 'go.mod', '*.csproj', '*.sln', 'pyproject.toml'
    ];

    for (const fileName of commonConfigFiles) {
      try {
        if (fileName.includes('*')) {
          // 와일드카드 패턴 처리
          const entries = await fs.readdir(dirPath);
          const pattern = fileName.replace('*', '');
          if (entries.some(entry => entry.includes(pattern))) {
            return true;
          }
        } else {
          const filePath = path.join(dirPath, fileName);
          await fs.access(filePath);
          return true;
        }
      } catch {
        // 파일이 존재하지 않음
      }
    }

    return false;
  }

  /**
   * 존재하는 설정 파일 찾기
   */
  private async findExistingConfigFiles(projectRoot: string, configFiles: string[]): Promise<string[]> {
    const existing: string[] = [];

    for (const fileName of configFiles) {
      try {
        if (fileName.includes('*')) {
          // 와일드카드 패턴 처리
          const entries = await fs.readdir(projectRoot);
          const pattern = fileName.replace('*', '');
          const matches = entries.filter(entry => entry.includes(pattern));
          existing.push(...matches.map(match => path.join(projectRoot, match)));
        } else {
          const filePath = path.join(projectRoot, fileName);
          await fs.access(filePath);
          existing.push(filePath);
        }
      } catch {
        // 파일이 존재하지 않음
      }
    }

    return existing;
  }

  /**
   * 패키지 매니저 감지
   */
  private async detectPackageManager(projectRoot: string): Promise<string | undefined> {
    const packageManagers = [
      { file: 'pnpm-lock.yaml', manager: 'pnpm' },
      { file: 'yarn.lock', manager: 'yarn' },
      { file: 'package-lock.json', manager: 'npm' },
      { file: 'Pipfile', manager: 'pipenv' },
      { file: 'requirements.txt', manager: 'pip' },
      { file: 'Cargo.lock', manager: 'cargo' },
      { file: 'go.sum', manager: 'go' }
    ];

    for (const { file, manager } of packageManagers) {
      try {
        await fs.access(path.join(projectRoot, file));
        return manager;
      } catch {
        // 파일이 존재하지 않음
      }
    }

    return undefined;
  }

  /**
   * 프로젝트 이름 추출
   */
  private async extractProjectName(projectRoot: string, result: any): Promise<string> {
    // 메타데이터에서 이름 추출
    if (result.metadata?.name) {
      return result.metadata.name;
    }

    // 디렉토리 이름 사용
    return path.basename(projectRoot);
  }

  /**
   * Node.js 메타데이터 추출
   */
  private async extractNodeMetadata(configPath: string): Promise<ProjectMetadata> {
    try {
      const packageJson = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      return {
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        author: packageJson.author,
        license: packageJson.license,
        dependencies: packageJson.dependencies,
        scripts: packageJson.scripts
      };
    } catch (error) {
      console.warn('Failed to parse package.json:', error);
      return {};
    }
  }

  /**
   * Python 메타데이터 추출
   */
  private async extractPythonMetadata(configPath: string): Promise<ProjectMetadata> {
    try {
      const fileName = path.basename(configPath);
      
      if (fileName === 'pyproject.toml') {
        return await this.parsePyprojectToml(configPath);
      } else if (fileName === 'setup.py') {
        return await this.parseSetupPy(configPath);
      } else if (fileName === 'requirements.txt') {
        const requirements = await fs.readFile(configPath, 'utf-8');
        const dependencies = this.parseRequirementsTxt(requirements);
        return { dependencies };
      }
    } catch (error) {
      console.warn('Failed to parse Python config:', error);
    }
    
    return {};
  }

  /**
   * Java 메타데이터 추출
   */
  private async extractJavaMetadata(configPath: string): Promise<ProjectMetadata> {
    try {
      const fileName = path.basename(configPath);
      
      if (fileName === 'pom.xml') {
        return await this.parsePomXml(configPath);
      } else if (fileName.includes('build.gradle')) {
        return await this.parseBuildGradle(configPath);
      }
    } catch (error) {
      console.warn('Failed to parse Java config:', error);
    }
    
    return {};
  }

  /**
   * Rust 메타데이터 추출
   */
  private async extractRustMetadata(configPath: string): Promise<ProjectMetadata> {
    try {
      const cargoToml = await fs.readFile(configPath, 'utf-8');
      const metadata = this.parseToml(cargoToml);
      
      return {
        name: metadata.package?.name,
        version: metadata.package?.version,
        description: metadata.package?.description,
        author: metadata.package?.authors?.[0],
        license: metadata.package?.license,
        dependencies: metadata.dependencies
      };
    } catch (error) {
      console.warn('Failed to parse Cargo.toml:', error);
      return {};
    }
  }

  /**
   * Go 메타데이터 추출
   */
  private async extractGoMetadata(configPath: string): Promise<ProjectMetadata> {
    try {
      const goMod = await fs.readFile(configPath, 'utf-8');
      const lines = goMod.split('\n');
      
      let moduleName = '';
      let goVersion = '';
      
      for (const line of lines) {
        if (line.startsWith('module ')) {
          moduleName = line.replace('module ', '').trim();
        } else if (line.startsWith('go ')) {
          goVersion = line.replace('go ', '').trim();
        }
      }
      
      return {
        name: moduleName.split('/').pop() || moduleName,
        version: goVersion,
        module: moduleName
      };
    } catch (error) {
      console.warn('Failed to parse go.mod:', error);
      return {};
    }
  }

  // 간단한 헬퍼 메서드들
  private async parsePyprojectToml(configPath: string): Promise<ProjectMetadata> {
    // 간단한 TOML 파싱 (실제로는 toml 라이브러리 사용 권장)
    const content = await fs.readFile(configPath, 'utf-8');
    const projectMatch = content.match(/\[project\]([\s\S]*?)(?=\[|$)/);
    
    if (projectMatch) {
      const projectSection = projectMatch[1];
      const name = projectSection.match(/name\s*=\s*"([^"]+)"/)?.[1];
      const version = projectSection.match(/version\s*=\s*"([^"]+)"/)?.[1];
      const description = projectSection.match(/description\s*=\s*"([^"]+)"/)?.[1];
      
      return { name, version, description };
    }
    
    return {};
  }

  private async parseSetupPy(configPath: string): Promise<ProjectMetadata> {
    // setup.py에서 기본 정보 추출 (정규표현식 기반)
    const content = await fs.readFile(configPath, 'utf-8');
    
    const name = content.match(/name\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const version = content.match(/version\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const description = content.match(/description\s*=\s*['"]([^'"]+)['"]/)?.[1];
    
    return { name, version, description };
  }

  private parseRequirementsTxt(content: string): Record<string, string> {
    const dependencies: Record<string, string> = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([a-zA-Z0-9\-_.]+)([>=<~!].*)?$/);
        if (match) {
          dependencies[match[1]] = match[2] || '*';
        }
      }
    }
    
    return dependencies;
  }

  private async parsePomXml(configPath: string): Promise<ProjectMetadata> {
    // 간단한 XML 파싱 (실제로는 xml2js 라이브러리 사용 권장)
    const content = await fs.readFile(configPath, 'utf-8');
    
    const name = content.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
    const version = content.match(/<version>([^<]+)<\/version>/)?.[1];
    const description = content.match(/<description>([^<]+)<\/description>/)?.[1];
    
    return { name, version, description };
  }

  private async parseBuildGradle(configPath: string): Promise<ProjectMetadata> {
    const content = await fs.readFile(configPath, 'utf-8');
    
    const name = content.match(/name\s*[=:]\s*['"]([^'"]+)['"]/)?.[1];
    const version = content.match(/version\s*[=:]\s*['"]([^'"]+)['"]/)?.[1];
    
    return { name, version };
  }

  private parseToml(content: string): any {
    // 매우 간단한 TOML 파서 (실제로는 @iarna/toml 사용 권장)
    const result: any = {};
    const lines = content.split('\n');
    let currentSection = result;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const sectionName = trimmed.slice(1, -1);
        const sections = sectionName.split('.');
        currentSection = result;
        
        for (const section of sections) {
          if (!currentSection[section]) {
            currentSection[section] = {};
          }
          currentSection = currentSection[section];
        }
      } else if (trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        let value = valueParts.join('=').trim();
        
        // 따옴표 제거
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        currentSection[key.trim()] = value;
      }
    }
    
    return result;
  }

  /**
   * 커스텀 패턴 규칙 추가
   */
  addCustomRule(rule: PathPatternRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 패턴 규칙 제거
   */
  removeRule(ruleName: string): boolean {
    const index = this.rules.findIndex(rule => rule.name === ruleName);
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 현재 등록된 모든 규칙 조회
   */
  getRules(): PathPatternRule[] {
    return [...this.rules];
  }
}
