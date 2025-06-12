/**
 * AutoSwitchEngine 테스트 파일
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutoSwitchEngine } from '../src/session/AutoSwitchEngine.js';
import { SessionSwitchPolicy, SwitchDecision } from '../src/types/session.js';

// 모킹된 데이터베이스 연결
const mockConnection = {
  query: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
  close: vi.fn()
};

describe('AutoSwitchEngine', () => {
  let engine: AutoSwitchEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new AutoSwitchEngine(mockConnection as any, {
      enabled: true,
      monitor_interval_ms: 100, // 빠른 테스트를 위해 짧게 설정
      debounce_delay_ms: 50,
      auto_switch_threshold: 0.7, // 낮은 임계값으로 테스트
      user_policy: SessionSwitchPolicy.AUTO,
      allowed_paths: [],
      excluded_paths: ['/tmp', 'node_modules'],
      max_switches_per_hour: 10,
      require_confirmation: false
    });
  });

  afterEach(async () => {
    await engine.stop();
  });

  describe('엔진 생명주기', () => {
    it('엔진을 시작할 수 있어야 함', async () => {
      const startedSpy = vi.fn();
      engine.on('started', startedSpy);

      await engine.start();
      const status = engine.getStatus();

      expect(status.running).toBe(true);
      expect(startedSpy).toHaveBeenCalledOnce();
    });

    it('엔진을 중지할 수 있어야 함', async () => {
      const stoppedSpy = vi.fn();
      engine.on('stopped', stoppedSpy);

      await engine.start();
      await engine.stop();
      
      const status = engine.getStatus();

      expect(status.running).toBe(false);
      expect(stoppedSpy).toHaveBeenCalledOnce();
    });

    it('비활성화된 엔진은 시작되지 않아야 함', async () => {
      const disabledEngine = new AutoSwitchEngine(mockConnection as any, {
        enabled: false
      });

      const warningSpy = vi.fn();
      disabledEngine.on('warning', warningSpy);

      await disabledEngine.start();
      const status = disabledEngine.getStatus();

      expect(status.running).toBe(false);
      expect(warningSpy).toHaveBeenCalledWith('Auto switch engine is disabled');
    });
  });

  describe('경로 변경 감지', () => {
    it('수동 경로 변경을 트리거할 수 있어야 함', async () => {
      const pathChangedSpy = vi.fn();
      engine.on('path_changed', pathChangedSpy);

      // 데이터베이스 모킹 (빈 결과)
      mockConnection.all.mockResolvedValue([]);
      mockConnection.get.mockResolvedValue({ count: 0 });

      await engine.start();
      await engine.triggerPathChange('/test/new-project');

      expect(pathChangedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          new_path: '/test/new-project',
          auto_detected: false
        })
      );

      const status = engine.getStatus();
      expect(status.current_path).toBe('/test/new-project');
    });

    it('제외된 경로는 처리하지 않아야 함', async () => {
      const infoSpy = vi.fn();
      engine.on('info', infoSpy);

      await engine.start();
      await engine.triggerPathChange('/tmp/excluded-path');

      expect(infoSpy).toHaveBeenCalledWith(
        'Path excluded from monitoring: /tmp/excluded-path'
      );
    });
  });

  describe('자동 전환 처리', () => {
    it('높은 신뢰도에서 자동 전환해야 함', async () => {
      const switchCompletedSpy = vi.fn();
      engine.on('switch_completed', switchCompletedSpy);

      // 성공적인 전환 모킹
      mockConnection.all.mockResolvedValue([]);
      mockConnection.get.mockResolvedValue({ count: 0 });
      mockConnection.query.mockResolvedValue({});

      await engine.start();
      await engine.triggerPathChange('/test/high-confidence-project');

      // 잠시 대기 (비동기 처리)
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(switchCompletedSpy).toHaveBeenCalled();
    });

    it('시간당 전환 제한을 초과하면 전환하지 않아야 함', async () => {
      const warningSpy = vi.fn();
      engine.on('warning', warningSpy);

      // 시간당 1회로 제한 설정
      engine.updateConfig({ max_switches_per_hour: 1 });

      mockConnection.all.mockResolvedValue([]);
      mockConnection.get.mockResolvedValue({ count: 0 });
      mockConnection.query.mockResolvedValue({});

      await engine.start();

      // 첫 번째 전환
      await engine.triggerPathChange('/test/project1');
      await new Promise(resolve => setTimeout(resolve, 100));

      // 두 번째 전환 (제한 초과)
      await engine.triggerPathChange('/test/project2');
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(warningSpy).toHaveBeenCalledWith(
        expect.stringContaining('Switch rate limit exceeded')
      );
    });
  });

  describe('사용자 정책 처리', () => {
    it('MANUAL 정책에서는 제안만 해야 함', async () => {
      const suggestionSpy = vi.fn();
      engine.on('switch_suggestion', suggestionSpy);

      engine.updateConfig({ user_policy: SessionSwitchPolicy.MANUAL });

      mockConnection.all.mockResolvedValue([]);
      mockConnection.get.mockResolvedValue({ count: 0 });

      await engine.start();
      await engine.triggerPathChange('/test/manual-project');
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(suggestionSpy).toHaveBeenCalled();
    });

    it('PROMPT 정책에서는 사용자 확인을 요청해야 함', async () => {
      const promptSpy = vi.fn();
      engine.on('user_prompt_required', promptSpy);

      engine.updateConfig({ user_policy: SessionSwitchPolicy.PROMPT });

      mockConnection.all.mockResolvedValue([]);
      mockConnection.get.mockResolvedValue({ count: 0 });

      await engine.start();
      await engine.triggerPathChange('/test/prompt-project');
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(promptSpy).toHaveBeenCalled();
    });
  });

  describe('강제 전환', () => {
    it('강제 전환을 수행할 수 있어야 함', async () => {
      const switchCompletedSpy = vi.fn();
      engine.on('switch_completed', switchCompletedSpy);

      mockConnection.all.mockResolvedValue([]);
      mockConnection.get.mockResolvedValue({ count: 0 });
      mockConnection.query.mockResolvedValue({});

      await engine.start();

      const context = {
        project_path: '/test/force-project',
        project_name: 'force-project'
      };

      await engine.forceSwitch(context);

      expect(switchCompletedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluation: expect.objectContaining({
            confidence: 1.0,
            reasons: ['Force switch requested']
          })
        })
      );
    });
  });

  describe('상태 및 통계', () => {
    it('엔진 상태를 정확히 반환해야 함', async () => {
      await engine.start();

      const status = engine.getStatus();

      expect(status).toEqual(
        expect.objectContaining({
          running: true,
          current_path: expect.any(String),
          config: expect.any(Object),
          pending_prompts: 0,
          recent_switches: expect.any(Array),
          statistics: expect.objectContaining({
            total_switches: expect.any(Number),
            successful_switches: expect.any(Number),
            failed_switches: expect.any(Number),
            switches_last_hour: expect.any(Number)
          })
        })
      );
    });

    it('전환 히스토리를 관리해야 함', async () => {
      const initialHistory = engine.getSwitchHistory();
      expect(initialHistory).toEqual([]);

      engine.clearSwitchHistory();

      const clearedHistory = engine.getSwitchHistory();
      expect(clearedHistory).toEqual([]);
    });
  });

  describe('설정 업데이트', () => {
    it('런타임에 설정을 업데이트할 수 있어야 함', () => {
      const configUpdatedSpy = vi.fn();
      engine.on('config_updated', configUpdatedSpy);

      const newConfig = {
        auto_switch_threshold: 0.9,
        max_switches_per_hour: 5
      };

      engine.updateConfig(newConfig);

      const status = engine.getStatus();

      expect(status.config.auto_switch_threshold).toBe(0.9);
      expect(status.config.max_switches_per_hour).toBe(5);
      expect(configUpdatedSpy).toHaveBeenCalledWith(status.config);
    });

    it('비활성화 설정 시 실행 중인 엔진을 중지해야 함', async () => {
      const stoppedSpy = vi.fn();
      engine.on('stopped', stoppedSpy);

      await engine.start();
      expect(engine.getStatus().running).toBe(true);

      engine.updateConfig({ enabled: false });

      expect(stoppedSpy).toHaveBeenCalled();
      expect(engine.getStatus().running).toBe(false);
    });
  });
});
