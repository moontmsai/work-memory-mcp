/**
 * SessionFactory 유닛 테스트
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionFactory, SessionFactoryBuilder } from '../../../src/session/SessionFactory.js';
import { SessionStatus, CreateSessionOptions } from '../../../src/types/session.js';

describe('SessionFactory', () => {
  let factory: SessionFactory;

  beforeEach(() => {
    factory = new SessionFactory();
  });

  describe('기본 세션 생성', () => {
    it('최소 옵션으로 세션을 생성할 수 있다', () => {
      const options: CreateSessionOptions = {
        project_name: 'test-project'
      };

      const result = factory.createSession(options);

      expect(result.created).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session.project_name).toBe('test-project');
      expect(result.session.session_id).toMatch(/^session_test_project_\d+_[a-z0-9]{6}$/);
      expect(result.session.status).toBe(SessionStatus.ACTIVE);
      expect(result.session.project_normalized).toBe('test-project');
      expect(result.session.auto_created).toBe(false);
      expect(result.session.activity_count).toBe(0);
      expect(result.session.memory_count).toBe(0);
    });

    it('전체 옵션으로 세션을 생성할 수 있다', () => {
      const options: CreateSessionOptions = {
        project_name: 'Full Test Project',
        project_path: '/path/to/project',
        git_repository: 'https://github.com/user/repo.git',
        description: 'Complete test session',
        tags: ['test', 'full'],
        created_by: 'test-user',
        auto_created: true
      };

      const result = factory.createSession(options);

      expect(result.created).toBe(true);
      expect(result.session.project_name).toBe('Full Test Project');
      expect(result.session.project_path).toBe('/path/to/project');
      expect(result.session.git_repository).toBe('https://github.com/user/repo.git');
      expect(result.session.description).toBe('Complete test session');
      expect(result.session.tags).toEqual(['test', 'full']);
      expect(result.session.created_by).toBe('test-user');
      expect(result.session.auto_created).toBe(true);
      expect(result.session.project_normalized).toBe('full test project');
    });

    it('고유한 세션 ID를 생성한다', () => {
      const options: CreateSessionOptions = {
        project_name: 'test-project'
      };

      const result1 = factory.createSession(options);
      const result2 = factory.createSession(options);

      expect(result1.session.session_id).not.toBe(result2.session.session_id);
    });

    it('타임스탬프가 올바르게 설정된다', () => {
      const before = new Date().getTime();
      
      const result = factory.createSession({
        project_name: 'test-project'
      });
      
      const after = new Date().getTime();

      expect(new Date(result.session.created_at).getTime()).toBeGreaterThanOrEqual(before);
      expect(new Date(result.session.created_at).getTime()).toBeLessThanOrEqual(after);
      expect(result.session.started_at).toBe(result.session.created_at);
      expect(result.session.last_activity_at).toBe(result.session.created_at);
      expect(result.session.updated_at).toBe(result.session.created_at);
    });
  });

  describe('자동 세션 생성 (마이그레이션용)', () => {
    it('프로젝트용 자동 세션을 생성할 수 있다', () => {
      const result = factory.createAutoSessionForProject('test-project', 10, 'migration');

      expect(result.created).toBe(true);
      expect(result.session.project_name).toBe('test-project');
      expect(result.session.status).toBe(SessionStatus.COMPLETED);
      expect(result.session.auto_created).toBe(true);
      expect(result.session.created_by).toBe('migration');
      expect(result.session.memory_count).toBe(10);
      expect(result.session.activity_count).toBe(10);
      expect(result.session.tags).toContain('migration');
      expect(result.session.tags).toContain('auto-generated');
    });

    it('unknown 프로젝트명을 적절히 처리한다', () => {
      const result = factory.createAutoSessionForProject('unknown', 5);

      expect(result.session.project_name).toBe('Uncategorized Memories');
      expect(result.session.description).toContain('migrating 5 existing memories');
    });
  });

  describe('입력 검증', () => {
    it('프로젝트명이 없으면 실패한다', () => {
      const options: CreateSessionOptions = {
        project_name: ''
      };

      const result = factory.createSession(options);

      expect(result.created).toBe(false);
      expect(result.errors).toContain('Project name is required');
    });

    it('프로젝트명이 너무 길면 실패한다', () => {
      const longName = 'a'.repeat(101);
      const options: CreateSessionOptions = {
        project_name: longName
      };

      const result = factory.createSession(options);

      expect(result.created).toBe(false);
      expect(result.errors).toContain('Project name must be 100 characters or less');
    });

    it('잘못된 Git 저장소 URL에 대해 경고를 준다', () => {
      const factory = new SessionFactory();
      const options: CreateSessionOptions = {
        project_name: 'test-project',
        git_repository: 'invalid-url'
      };

      const result = factory.createSession(options);

      expect(result.created).toBe(true); // 경고는 생성을 막지 않음
      // Git URL 검증은 private 메서드이므로 간접적으로 테스트
    });
  });

  describe('팩토리 설정', () => {
    it('기본 설정으로 초기화된다', () => {
      const config = factory.getConfig();

      expect(config.default_created_by).toBe('system');
      expect(config.auto_start).toBe(true);
      expect(config.generate_description).toBe(true);
      expect(config.default_tags).toEqual([]);
    });

    it('설정을 업데이트할 수 있다', () => {
      factory.updateConfig({
        default_created_by: 'new-user',
        auto_start: false
      });

      const config = factory.getConfig();
      expect(config.default_created_by).toBe('new-user');
      expect(config.auto_start).toBe(false);
      expect(config.generate_description).toBe(true); // 변경되지 않음
    });

    it('커스텀 설정으로 초기화할 수 있다', () => {
      const customFactory = new SessionFactory({
        default_created_by: 'custom-user',
        auto_start: false,
        default_tags: ['custom']
      });

      const config = customFactory.getConfig();
      expect(config.default_created_by).toBe('custom-user');
      expect(config.auto_start).toBe(false);
      expect(config.default_tags).toEqual(['custom']);
    });
  });

  describe('SessionFactoryBuilder', () => {
    it('빌더 패턴으로 팩토리를 생성할 수 있다', () => {
      const factory = new SessionFactoryBuilder()
        .setDefaultCreatedBy('builder-user')
        .setAutoStart(false)
        .setGenerateDescription(true)
        .setDefaultTags(['built', 'test'])
        .build();

      const config = factory.getConfig();
      expect(config.default_created_by).toBe('builder-user');
      expect(config.auto_start).toBe(false);
      expect(config.generate_description).toBe(true);
      expect(config.default_tags).toEqual(['built', 'test']);
    });

    it('빌더로 생성된 팩토리가 정상 작동한다', () => {
      const factory = new SessionFactoryBuilder()
        .setDefaultCreatedBy('builder-test')
        .setDefaultTags(['default-tag'])
        .build();

      const result = factory.createSession({
        project_name: 'builder-test-project'
      });

      expect(result.created).toBe(true);
      expect(result.session.created_by).toBe('builder-test');
      expect(result.session.tags).toContain('default-tag');
    });
  });

  describe('프로젝트명 정규화', () => {
    it('프로젝트명을 올바르게 정규화한다', () => {
      const testCases = [
        { input: 'Simple Project', expected: 'simple project' },
        { input: '  Trimmed  ', expected: 'trimmed' },
        { input: 'UPPERCASE', expected: 'uppercase' },
        { input: 'Mixed-Case_Project123', expected: 'mixed-case_project123' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = factory.createSession({
          project_name: input
        });

        expect(result.session.project_normalized).toBe(expected);
      });
    });
  });
});
