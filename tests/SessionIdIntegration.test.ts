/**
 * Session ID Integration 테스트 파일
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionContextManager } from '../src/session/SessionContextManager.js';
import { SessionMemoryLinker } from '../src/session/SessionMemoryLinker.js';
import { SessionStatus } from '../src/types/session.js';
import { handleAddWorkMemory } from '../src/tools/add-work-memory.js';

// 모킹된 데이터베이스 연결
const mockConnection = {
  query: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
  close: vi.fn()
};

// getDatabaseConnection 모킹
vi.mock('../src/database/index.js', () => ({
  getDatabaseConnection: () => mockConnection
}));

describe('Session ID Integration in Work Memories', () => {
  let contextManager: SessionContextManager;
  let memoryLinker: SessionMemoryLinker;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // SessionContextManager 싱글톤 리셋을 위한 해킹
    (SessionContextManager as any).instance = undefined;
    
    contextManager = SessionContextManager.getInstance(mockConnection as any);
    memoryLinker = new SessionMemoryLinker(mockConnection as any);
  });

  describe('SessionContextManager', () => {
    it('활성 세션을 설정할 수 있어야 함', async () => {
      const mockSession = {
        session_id: 'test_session_123',
        project_name: 'test-project',
        project_path: '/test/project',
        status: SessionStatus.ACTIVE
      };

      mockConnection.get.mockResolvedValue(mockSession);
      mockConnection.query.mockResolvedValue({});

      await contextManager.setActiveSession('test_session_123');

      const currentId = contextManager.getCurrentSessionId();
      expect(currentId).toBe('test_session_123');

      const context = contextManager.getCurrentContext();
      expect(context.current_session_id).toBe('test_session_123');
      expect(context.project_name).toBe('test-project');
      expect(context.project_path).toBe('/test/project');
    });

    it('활성 세션을 자동 감지할 수 있어야 함', async () => {
      const mockSession = {
        session_id: 'auto_detected_session',
        project_name: 'auto-project',
        project_path: '/auto/project',
        status: SessionStatus.ACTIVE
      };

      mockConnection.get
        .mockResolvedValueOnce(mockSession) // 현재 활성 세션 조회
        .mockResolvedValueOnce(mockSession); // 세션 존재 확인

      mockConnection.query.mockResolvedValue({});

      const detectedId = await contextManager.detectAndSetActiveSession();

      expect(detectedId).toBe('auto_detected_session');
      expect(contextManager.getCurrentSessionId()).toBe('auto_detected_session');
    });

    it('활성 세션을 해제할 수 있어야 함', () => {
      contextManager.clearActiveSession();

      expect(contextManager.getCurrentSessionId()).toBeNull();

      const context = contextManager.getCurrentContext();
      expect(context.current_session_id).toBeNull();
      expect(context.project_name).toBeNull();
      expect(context.project_path).toBeNull();
    });

    it('자동 링크 설정을 변경할 수 있어야 함', () => {
      expect(contextManager.isAutoLinkEnabled()).toBe(true); // 기본값

      contextManager.setAutoLinkEnabled(false);
      expect(contextManager.isAutoLinkEnabled()).toBe(false);

      contextManager.setAutoLinkEnabled(true);
      expect(contextManager.isAutoLinkEnabled()).toBe(true);
    });
  });

  describe('SessionMemoryLinker Auto Link', () => {
    it('메모리를 세션에 자동으로 링크할 수 있어야 함', async () => {
      mockConnection.get.mockResolvedValue(null); // 기존 링크 없음
      mockConnection.query.mockResolvedValue({ changes: 1 });

      const result = await memoryLinker.autoLinkMemoryToSession(
        'memory_123',
        'session_123'
      );

      expect(result.success).toBe(true);
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE work_memories SET session_id = ?'),
        expect.arrayContaining(['session_123', expect.any(String), 'memory_123'])
      );
    });

    it('현재 활성 세션에 메모리를 자동으로 링크할 수 있어야 함', async () => {
      const mockActiveSession = {
        session_id: 'active_session_123',
        status: SessionStatus.ACTIVE
      };

      mockConnection.get.mockResolvedValue(mockActiveSession);
      mockConnection.query.mockResolvedValue({ changes: 1 });

      const result = await memoryLinker.autoLinkToActiveSession('memory_123');

      expect(result.success).toBe(true);
      expect(result.session_id).toBe('active_session_123');
    });

    it('활성 세션이 없을 때 새 세션을 생성할 수 있어야 함', async () => {
      mockConnection.get.mockResolvedValue(null); // 활성 세션 없음
      mockConnection.query.mockResolvedValue({ changes: 1 });

      const result = await memoryLinker.autoLinkToActiveSession('memory_123', {
        create_session_if_none: true,
        project_name: 'New Project',
        project_path: '/new/project'
      });

      expect(result.success).toBe(true);
      expect(result.created_session).toBe(true);
      expect(result.session_id).toBeDefined();
    });
  });

  describe('Work Memory Integration', () => {
    it('메모리 저장 시 세션 ID가 자동으로 연결되어야 함', async () => {
      // 활성 세션 설정
      const mockSession = {
        session_id: 'integration_session',
        project_name: 'integration-project',
        status: SessionStatus.ACTIVE
      };

      mockConnection.get.mockResolvedValue(mockSession);
      mockConnection.run.mockResolvedValue({ lastInsertRowid: 1 });
      mockConnection.query.mockResolvedValue({ changes: 1 });

      await contextManager.setActiveSession('integration_session');

      const result = await handleAddWorkMemory({
        content: 'Test memory content',
        project: 'integration-project'
      });

      expect(result).toContain('✅ 새로운 메모리가 저장되었습니다');
      expect(result).toContain('🔗 세션 연동');
    });

    it('자동 링크가 비활성화되면 세션 연결하지 않아야 함', async () => {
      contextManager.setAutoLinkEnabled(false);

      mockConnection.run.mockResolvedValue({ lastInsertRowid: 1 });

      const result = await handleAddWorkMemory({
        content: 'Test memory without session link'
      });

      expect(result).toContain('✅ 새로운 메모리가 저장되었습니다');
      expect(result).not.toContain('🔗 세션 연동');
    });
  });

  describe('Error Handling', () => {
    it('존재하지 않는 세션 설정 시 에러를 발생시켜야 함', async () => {
      mockConnection.get.mockResolvedValue(null);

      await expect(
        contextManager.setActiveSession('nonexistent_session')
      ).rejects.toThrow('Session nonexistent_session not found or not active');
    });

    it('세션 연동 실패 시에도 메모리 저장은 성공해야 함', async () => {
      // 세션 연동은 실패하지만 메모리 저장은 성공하는 시나리오
      mockConnection.run.mockResolvedValue({ lastInsertRowid: 1 });
      mockConnection.get.mockRejectedValue(new Error('Session link failed'));

      const result = await handleAddWorkMemory({
        content: 'Test memory with session link failure'
      });

      expect(result).toContain('✅ 새로운 메모리가 저장되었습니다');
      // 세션 연동 실패는 메모리 저장을 방해하지 않음
    });

    it('자동 세션 감지 실패 시 null을 반환해야 함', async () => {
      mockConnection.get.mockRejectedValue(new Error('Database error'));

      const result = await contextManager.detectAndSetActiveSession();

      expect(result).toBeNull();
      expect(contextManager.getCurrentSessionId()).toBeNull();
    });
  });

  describe('Session Context Status', () => {
    it('세션 컨텍스트 상태를 올바르게 반환해야 함', async () => {
      const mockSession = {
        session_id: 'status_test_session',
        project_name: 'status-project',
        status: SessionStatus.ACTIVE
      };

      mockConnection.get.mockResolvedValue(mockSession);
      mockConnection.query.mockResolvedValue({});

      await contextManager.setActiveSession('status_test_session');
      const status = contextManager.getStatus();

      expect(status.has_active_session).toBe(true);
      expect(status.session_id).toBe('status_test_session');
      expect(status.project_name).toBe('status-project');
      expect(status.auto_link_enabled).toBe(true);
      expect(status.last_updated).toBeDefined();
    });

    it('활성 세션이 없을 때 상태를 올바르게 반환해야 함', () => {
      contextManager.clearActiveSession();
      const status = contextManager.getStatus();

      expect(status.has_active_session).toBe(false);
      expect(status.session_id).toBeNull();
      expect(status.project_name).toBeNull();
      expect(status.auto_link_enabled).toBe(true); // 기본값
    });
  });
});
