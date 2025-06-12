/**
 * SessionFactory - 새로운 세션 생성을 위한 팩토리 클래스
 */

import { randomUUID } from 'crypto';
import { 
  WorkSession, 
  CreateSessionOptions, 
  CreateSessionResult,
  SessionStatus,
  SessionFactoryConfig,
  SessionValidationResult
} from '../types/session.js';

export class SessionFactory {
  private config: SessionFactoryConfig;

  constructor(config?: Partial<SessionFactoryConfig>) {
    this.config = {
      default_created_by: 'system',
      auto_start: true,
      generate_description: true,
      default_tags: [],
      ...config
    };
  }

  /**
   * 새로운 세션 생성
   */
  createSession(options: CreateSessionOptions): CreateSessionResult {
    try {
      // 옵션 검증
      const validation = this.validateCreateOptions(options);
      if (!validation.valid) {
        return {
          session: null as any,
          created: false,
          errors: validation.errors
        };
      }

      // 고유 세션 ID 생성
      const sessionId = this.generateSessionId(options.project_name);
      
      // 현재 시간
      const now = new Date().toISOString();
      
      // 프로젝트명 정규화
      const projectNormalized = this.normalizeProjectName(options.project_name);
      
      // 기본 설명 생성
      const description = options.description || 
        (this.config.generate_description ? 
          this.generateDefaultDescription(options) : undefined);

      // 세션 객체 생성
      const session: WorkSession = {
        session_id: sessionId,
        project_name: options.project_name,
        project_path: options.project_path,
        git_repository: options.git_repository,
        started_at: now,
        ended_at: undefined,
        last_activity_at: now,
        status: this.config.auto_start ? SessionStatus.ACTIVE : SessionStatus.PAUSED,
        description,
        auto_created: options.auto_created ?? false,
        tags: [...(this.config.default_tags || []), ...(options.tags || [])],
        created_by: options.created_by || this.config.default_created_by,
        created_at: now,
        updated_at: now,
        activity_count: 0,
        memory_count: 0,
        total_work_time: 0,
        project_normalized: projectNormalized
      };

      return {
        session,
        created: true
      };

    } catch (error) {
      return {
        session: null as any,
        created: false,
        errors: [`Session creation failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * 프로젝트용 자동 세션 생성 (마이그레이션용)
   */
  createAutoSessionForProject(
    projectName: string, 
    memoryCount: number = 0,
    createdBy: string = 'migration_script'
  ): CreateSessionResult {
    const options: CreateSessionOptions = {
      project_name: projectName === 'unknown' ? 'Uncategorized Memories' : projectName,
      description: `Auto-generated session for migrating ${memoryCount} existing memories`,
      auto_created: true,
      created_by: createdBy,
      tags: ['migration', 'auto-generated']
    };

    const result = this.createSession(options);
    
    if (result.created && result.session) {
      // 마이그레이션 세션은 완료 상태로 설정
      result.session.status = SessionStatus.COMPLETED;
      result.session.memory_count = memoryCount;
      result.session.activity_count = memoryCount;
    }

    return result;
  }

  /**
   * 세션 ID 생성
   */
  private generateSessionId(projectName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const projectPrefix = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .substring(0, 15);
    
    return `session_${projectPrefix}_${timestamp}_${random}`;
  }

  /**
   * 프로젝트명 정규화
   */
  private normalizeProjectName(projectName: string): string {
    return projectName.toLowerCase().trim();
  }

  /**
   * 기본 설명 생성
   */
  private generateDefaultDescription(options: CreateSessionOptions): string {
    const parts = ['Work session for', options.project_name];
    
    if (options.project_path) {
      parts.push(`at ${options.project_path}`);
    }
    
    return parts.join(' ');
  }

  /**
   * 생성 옵션 검증
   */
  private validateCreateOptions(options: CreateSessionOptions): SessionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 프로젝트명 필수 검증
    if (!options.project_name || options.project_name.trim().length === 0) {
      errors.push('Project name is required');
    }

    // 프로젝트명 길이 검증
    if (options.project_name && options.project_name.length > 100) {
      errors.push('Project name must be 100 characters or less');
    }

    // 설명 길이 검증
    if (options.description && options.description.length > 500) {
      warnings.push('Description is longer than 500 characters');
    }

    // 태그 검증
    if (options.tags && options.tags.length > 20) {
      warnings.push('More than 20 tags provided');
    }

    // Git 저장소 URL 검증 (기본적인 형식 확인)
    if (options.git_repository && !this.isValidGitRepository(options.git_repository)) {
      warnings.push('Git repository URL format may be invalid');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Git 저장소 URL 검증
   */
  private isValidGitRepository(url: string): boolean {
    // 기본적인 git URL 패턴 검증
    const gitPatterns = [
      /^https?:\/\/.+\.git$/,
      /^git@.+:.+\.git$/,
      /^ssh:\/\/.+\.git$/
    ];
    
    return gitPatterns.some(pattern => pattern.test(url));
  }

  /**
   * 팩토리 설정 업데이트
   */
  updateConfig(newConfig: Partial<SessionFactoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 현재 팩토리 설정 조회
   */
  getConfig(): SessionFactoryConfig {
    return { ...this.config };
  }
}

// 기본 팩토리 인스턴스 생성
export const sessionFactory = new SessionFactory();

// 팩토리 설정 헬퍼
export class SessionFactoryBuilder {
  private config: Partial<SessionFactoryConfig> = {};

  setDefaultCreatedBy(createdBy: string): this {
    this.config.default_created_by = createdBy;
    return this;
  }

  setAutoStart(autoStart: boolean): this {
    this.config.auto_start = autoStart;
    return this;
  }

  setGenerateDescription(generate: boolean): this {
    this.config.generate_description = generate;
    return this;
  }

  setDefaultTags(tags: string[]): this {
    this.config.default_tags = tags;
    return this;
  }

  build(): SessionFactory {
    return new SessionFactory(this.config);
  }
}
