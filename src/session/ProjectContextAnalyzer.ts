/**
 * ProjectContextAnalyzer - 프로젝트 컨텍스트 상세 분석 시스템
 * PathPatternDetector의 결과를 기반으로 프로젝트의 상세 정보와 워크스페이스 구조를 분석
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { PathPatternDetector, ProjectDetectionResult, ProjectType, ProjectMetadata } from './PathPatternDetector.js';

// 워크스페이스 구조 정보
export interface WorkspaceStructure {
  sourceDirectories: string[];      // 소스 코드 디렉토리들
  testDirectories: string[];        // 테스트 디렉토리들
  buildDirectories: string[];       // 빌드 결과물 디렉토리들
  configDirectories: string[];      // 설정 파일 디렉토리들
  documentDirectories: string[];    // 문서 디렉토리들
  totalFiles: number;               // 총 파일 수
  totalDirectories: number;         // 총 디렉토리 수
  mainEntryPoints: string[];        // 메인 진입점 파일들
  keyFiles: string[];               // 중요 파일들
}

// Git 컨텍스트 정보
export interface GitContext {
  isGitRepository: boolean;
  currentBranch?: string;
  remoteUrl?: string;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  hasUncommittedChanges?: boolean;
  ignoredPatterns: string[];
}

// 의존성 분석 정보
export interface DependencyAnalysis {
  productionDependencies: Record<string, string>;
  developmentDependencies: Record<string, string>;
  frameworksDetected: string[];
  majorLibraries: string[];
  buildTools: string[];
  testingFrameworks: string[];
}

// 프로젝트 컨텍스트 (최종 결과)
export interface ProjectContext {
  detection: ProjectDetectionResult;
  workspace: WorkspaceStructure;
  git: GitContext;
  dependencies: DependencyAnalysis;
  sessionHistory?: SessionHistoryInfo[];
  analysisTimestamp: Date;
  analysisVersion: string;
}

// 세션 히스토리 정보
export interface SessionHistoryInfo {
  sessionId: string;
  projectPath: string;
  startTime: Date;
  endTime?: Date;
  memoryCount: number;
  lastActivity: Date;
}

export class ProjectContextAnalyzer {
  private detector: PathPatternDetector;

  constructor() {
    this.detector = new PathPatternDetector();
  }

  /**
   * 프로젝트 경로에 대한 완전한 컨텍스트 분석 수행
   */
  async analyzeProjectContext(projectPath: string): Promise<ProjectContext> {
    try {
      // 1. 기본 프로젝트 감지
      const detection = await this.detector.detectProject(projectPath);
      
      if (!detection) {
        throw new Error(`프로젝트를 감지할 수 없습니다: ${projectPath}`);
      }

      // 2. 워크스페이스 구조 분석
      const workspace = await this.analyzeWorkspaceStructure(detection.projectRoot);

      // 3. Git 컨텍스트 분석
      const git = await this.analyzeGitContext(detection.projectRoot);

      // 4. 의존성 분석
      const dependencies = await this.analyzeDependencies(detection);

      // 5. 세션 히스토리 조회 (옵션)
      const sessionHistory = await this.getSessionHistory(detection.projectRoot);

      return {
        detection,
        workspace,
        git,
        dependencies,
        sessionHistory,
        analysisTimestamp: new Date(),
        analysisVersion: '1.0.0'
      };

    } catch (error) {
      throw new Error(`프로젝트 컨텍스트 분석 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * analyzeContext 메서드 (호환성을 위한 별칭)
   * analyzeProjectContext와 동일한 기능을 제공
   */
  async analyzeContext(projectPath: string): Promise<ProjectContext> {
    return this.analyzeProjectContext(projectPath);
  }

  /**
   * 워크스페이스 구조 분석
   */
  private async analyzeWorkspaceStructure(projectRoot: string): Promise<WorkspaceStructure> {
    const structure: WorkspaceStructure = {
      sourceDirectories: [],
      testDirectories: [],
      buildDirectories: [],
      configDirectories: [],
      documentDirectories: [],
      totalFiles: 0,
      totalDirectories: 0,
      mainEntryPoints: [],
      keyFiles: []
    };

    try {
      await this.scanDirectory(projectRoot, structure, projectRoot);
      await this.identifyKeyFiles(projectRoot, structure);
      await this.identifyMainEntryPoints(projectRoot, structure);
      
      return structure;
    } catch (error) {
      console.warn(`워크스페이스 구조 분석 경고: ${error instanceof Error ? error.message : String(error)}`);
      return structure;
    }
  }

  /**
   * 디렉토리 재귀 스캔
   */
  private async scanDirectory(dirPath: string, structure: WorkspaceStructure, projectRoot: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(projectRoot, fullPath);

        // 숨김 파일/디렉토리와 node_modules 스킵
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        if (entry.isDirectory()) {
          structure.totalDirectories++;
          this.categorizeDirectory(relativePath, structure);
          
          // 재귀적으로 스캔 (깊이 제한)
          const depth = relativePath.split(path.sep).length;
          if (depth < 5) {
            await this.scanDirectory(fullPath, structure, projectRoot);
          }
        } else {
          structure.totalFiles++;
        }
      }
    } catch (error) {
      // 접근 권한 없는 디렉토리는 무시
      console.warn(`디렉토리 스캔 실패: ${dirPath}`);
    }
  }

  /**
   * 디렉토리 분류
   */
  private categorizeDirectory(relativePath: string, structure: WorkspaceStructure): void {
    const dirName = path.basename(relativePath).toLowerCase();
    const fullPath = relativePath.toLowerCase();

    // 소스 디렉토리
    if (['src', 'source', 'lib', 'app', 'components', 'pages'].includes(dirName)) {
      structure.sourceDirectories.push(relativePath);
    }
    // 테스트 디렉토리
    else if (['test', 'tests', '__tests__', 'spec', 'specs'].includes(dirName) || 
             fullPath.includes('test')) {
      structure.testDirectories.push(relativePath);
    }
    // 빌드 디렉토리
    else if (['dist', 'build', 'out', 'target', 'bin', 'release'].includes(dirName)) {
      structure.buildDirectories.push(relativePath);
    }
    // 설정 디렉토리
    else if (['config', 'configs', 'conf', 'settings'].includes(dirName) ||
             dirName.startsWith('.')) {
      structure.configDirectories.push(relativePath);
    }
    // 문서 디렉토리
    else if (['docs', 'doc', 'documentation', 'readme'].includes(dirName)) {
      structure.documentDirectories.push(relativePath);
    }
  }

  /**
   * 주요 파일들 식별
   */
  private async identifyKeyFiles(projectRoot: string, structure: WorkspaceStructure): Promise<void> {
    const keyFilePatterns = [
      'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
      'tsconfig.json', 'jsconfig.json',
      'webpack.config.js', 'vite.config.js', 'rollup.config.js',
      'next.config.js', 'next.config.ts',
      'tailwind.config.js', 'tailwind.config.ts',
      'README.md', 'README.txt',
      '.gitignore', '.env', '.env.example',
      'docker-compose.yml', 'Dockerfile',
      'LICENSE', 'LICENSE.txt'
    ];

    for (const pattern of keyFilePatterns) {
      const filePath = path.join(projectRoot, pattern);
      try {
        await fs.access(filePath);
        structure.keyFiles.push(pattern);
      } catch {
        // 파일이 없으면 무시
      }
    }
  }

  /**
   * 메인 진입점 파일들 식별
   */
  private async identifyMainEntryPoints(projectRoot: string, structure: WorkspaceStructure): Promise<void> {
    const entryPointPatterns = [
      'index.js', 'index.ts', 'index.jsx', 'index.tsx',
      'main.js', 'main.ts', 'main.jsx', 'main.tsx',
      'app.js', 'app.ts', 'app.jsx', 'app.tsx',
      'src/index.js', 'src/index.ts', 'src/index.jsx', 'src/index.tsx',
      'src/main.js', 'src/main.ts', 'src/main.jsx', 'src/main.tsx',
      'src/app.js', 'src/app.ts', 'src/app.jsx', 'src/app.tsx',
      'pages/_app.js', 'pages/_app.ts', 'pages/_app.jsx', 'pages/_app.tsx'
    ];

    for (const pattern of entryPointPatterns) {
      const filePath = path.join(projectRoot, pattern);
      try {
        await fs.access(filePath);
        structure.mainEntryPoints.push(pattern);
      } catch {
        // 파일이 없으면 무시
      }
    }
  }
  /**
   * Git 컨텍스트 분석
   */
  private async analyzeGitContext(projectRoot: string): Promise<GitContext> {
    const gitContext: GitContext = {
      isGitRepository: false,
      ignoredPatterns: []
    };

    try {
      const gitDir = path.join(projectRoot, '.git');
      await fs.access(gitDir);
      gitContext.isGitRepository = true;

      // Git 정보 추출
      await this.extractGitInfo(projectRoot, gitContext);
      await this.parseGitIgnore(projectRoot, gitContext);

    } catch {
      // .git 디렉토리가 없으면 Git 저장소가 아님
      gitContext.isGitRepository = false;
    }

    return gitContext;
  }

  /**
   * Git 정보 추출
   */
  private async extractGitInfo(projectRoot: string, gitContext: GitContext): Promise<void> {
    try {
      // 현재 브랜치 조회
      const headPath = path.join(projectRoot, '.git', 'HEAD');
      const headContent = await fs.readFile(headPath, 'utf-8');
      
      if (headContent.startsWith('ref: refs/heads/')) {
        gitContext.currentBranch = headContent.replace('ref: refs/heads/', '').trim();
      }

      // 원격 저장소 URL 조회 (config 파일에서)
      try {
        const configPath = path.join(projectRoot, '.git', 'config');
        const configContent = await fs.readFile(configPath, 'utf-8');
        const urlMatch = configContent.match(/url\s*=\s*(.+)/);
        if (urlMatch) {
          gitContext.remoteUrl = urlMatch[1].trim();
        }
      } catch {
        // config 파일 읽기 실패는 무시
      }

    } catch (error) {
      console.warn(`Git 정보 추출 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * .gitignore 파일 파싱
   */
  private async parseGitIgnore(projectRoot: string, gitContext: GitContext): Promise<void> {
    try {
      const gitIgnorePath = path.join(projectRoot, '.gitignore');
      const gitIgnoreContent = await fs.readFile(gitIgnorePath, 'utf-8');
      
      gitContext.ignoredPatterns = gitIgnoreContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    } catch {
      // .gitignore 파일이 없으면 빈 배열
      gitContext.ignoredPatterns = [];
    }
  }

  /**
   * 의존성 분석
   */
  private async analyzeDependencies(detection: ProjectDetectionResult): Promise<DependencyAnalysis> {
    const analysis: DependencyAnalysis = {
      productionDependencies: {},
      developmentDependencies: {},
      frameworksDetected: [],
      majorLibraries: [],
      buildTools: [],
      testingFrameworks: []
    };

    // 프로젝트 타입별 의존성 분석
    if (detection.projectType.includes(ProjectType.NODE_JS) || 
        detection.projectType.includes(ProjectType.TYPESCRIPT)) {
      await this.analyzeNodeDependencies(detection, analysis);
    }

    return analysis;
  }

  /**
   * Node.js 의존성 분석
   */
  private async analyzeNodeDependencies(detection: ProjectDetectionResult, analysis: DependencyAnalysis): Promise<void> {
    try {
      const packageJsonPath = path.join(detection.projectRoot, 'package.json');
      const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageData = JSON.parse(packageContent);

      // 의존성 추출
      analysis.productionDependencies = packageData.dependencies || {};
      analysis.developmentDependencies = packageData.devDependencies || {};

      // 프레임워크 감지
      this.detectFrameworks(analysis);
      
      // 주요 라이브러리 감지
      this.detectMajorLibraries(analysis);
      
      // 빌드 도구 감지
      this.detectBuildTools(analysis);
      
      // 테스팅 프레임워크 감지
      this.detectTestingFrameworks(analysis);

    } catch (error) {
      console.warn(`Node.js 의존성 분석 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 프레임워크 감지
   */
  private detectFrameworks(analysis: DependencyAnalysis): void {
    const allDeps = { ...analysis.productionDependencies, ...analysis.developmentDependencies };
    const frameworks: string[] = [];

    if (allDeps['react']) frameworks.push('React');
    if (allDeps['vue']) frameworks.push('Vue.js');
    if (allDeps['@angular/core']) frameworks.push('Angular');
    if (allDeps['next']) frameworks.push('Next.js');
    if (allDeps['nuxt']) frameworks.push('Nuxt.js');
    if (allDeps['svelte']) frameworks.push('Svelte');
    if (allDeps['express']) frameworks.push('Express.js');
    if (allDeps['koa']) frameworks.push('Koa.js');
    if (allDeps['nestjs']) frameworks.push('NestJS');

    analysis.frameworksDetected = frameworks;
  }

  /**
   * 주요 라이브러리 감지
   */
  private detectMajorLibraries(analysis: DependencyAnalysis): void {
    const allDeps = { ...analysis.productionDependencies, ...analysis.developmentDependencies };
    const libraries: string[] = [];

    // UI 라이브러리
    if (allDeps['@mui/material']) libraries.push('Material-UI');
    if (allDeps['antd']) libraries.push('Ant Design');
    if (allDeps['bootstrap']) libraries.push('Bootstrap');
    if (allDeps['tailwindcss']) libraries.push('Tailwind CSS');

    // 상태 관리
    if (allDeps['redux']) libraries.push('Redux');
    if (allDeps['zustand']) libraries.push('Zustand');
    if (allDeps['mobx']) libraries.push('MobX');

    // 데이터베이스
    if (allDeps['mongoose']) libraries.push('Mongoose');
    if (allDeps['prisma']) libraries.push('Prisma');
    if (allDeps['typeorm']) libraries.push('TypeORM');

    analysis.majorLibraries = libraries;
  }

  /**
   * 빌드 도구 감지
   */
  private detectBuildTools(analysis: DependencyAnalysis): void {
    const allDeps = { ...analysis.productionDependencies, ...analysis.developmentDependencies };
    const buildTools: string[] = [];

    if (allDeps['webpack']) buildTools.push('Webpack');
    if (allDeps['vite']) buildTools.push('Vite');
    if (allDeps['rollup']) buildTools.push('Rollup');
    if (allDeps['parcel']) buildTools.push('Parcel');
    if (allDeps['esbuild']) buildTools.push('ESBuild');
    if (allDeps['typescript']) buildTools.push('TypeScript');
    if (allDeps['babel']) buildTools.push('Babel');

    analysis.buildTools = buildTools;
  }

  /**
   * 테스팅 프레임워크 감지
   */
  private detectTestingFrameworks(analysis: DependencyAnalysis): void {
    const allDeps = { ...analysis.productionDependencies, ...analysis.developmentDependencies };
    const testFrameworks: string[] = [];

    if (allDeps['jest']) testFrameworks.push('Jest');
    if (allDeps['vitest']) testFrameworks.push('Vitest');
    if (allDeps['mocha']) testFrameworks.push('Mocha');
    if (allDeps['jasmine']) testFrameworks.push('Jasmine');
    if (allDeps['cypress']) testFrameworks.push('Cypress');
    if (allDeps['playwright']) testFrameworks.push('Playwright');
    if (allDeps['@testing-library/react']) testFrameworks.push('React Testing Library');

    analysis.testingFrameworks = testFrameworks;
  }

  /**
   * 세션 히스토리 조회 (추후 구현)
   */
  private async getSessionHistory(projectRoot: string): Promise<SessionHistoryInfo[]> {
    // TODO: 세션 관리 시스템과 연동하여 해당 프로젝트의 세션 히스토리 조회
    // 현재는 빈 배열 반환
    return [];
  }

  /**
   * 프로젝트 요약 정보 생성
   */
  generateProjectSummary(context: ProjectContext): string {
    const { detection, workspace, git, dependencies } = context;
    
    let summary = `🏗️ 프로젝트: ${detection.projectName}\n`;
    summary += `📁 경로: ${detection.projectRoot}\n`;
    summary += `🏷️ 타입: ${detection.projectType.join(', ')}\n`;
    summary += `🎯 신뢰도: ${detection.confidence}%\n\n`;

    // 워크스페이스 정보
    summary += `📊 워크스페이스:\n`;
    summary += `  • 파일: ${workspace.totalFiles}개, 디렉토리: ${workspace.totalDirectories}개\n`;
    summary += `  • 소스 디렉토리: ${workspace.sourceDirectories.length}개\n`;
    summary += `  • 진입점: ${workspace.mainEntryPoints.join(', ') || '없음'}\n\n`;

    // Git 정보
    if (git.isGitRepository) {
      summary += `🌿 Git:\n`;
      summary += `  • 브랜치: ${git.currentBranch || '알 수 없음'}\n`;
      if (git.remoteUrl) {
        summary += `  • 원격: ${git.remoteUrl}\n`;
      }
      summary += `\n`;
    }

    // 의존성 정보
    if (dependencies.frameworksDetected.length > 0) {
      summary += `🚀 프레임워크: ${dependencies.frameworksDetected.join(', ')}\n`;
    }
    if (dependencies.buildTools.length > 0) {
      summary += `🔧 빌드 도구: ${dependencies.buildTools.join(', ')}\n`;
    }

    return summary;
  }
}
