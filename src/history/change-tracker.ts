import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ChangeLogEntry, ChangeType, ChangeMetadata, HistoryQuery, HistorySearchResult } from './types.js';
import { ensureDirectoryExists } from '../utils/file-system.js';

/**
 * 메모리 변경 이력을 추적하고 관리하는 클래스
 */
export class ChangeTracker {
  private historyDir: string;
  private changeLogFile: string;
  private isInitialized: boolean = false;

  constructor(workMemoryDir: string) {
    this.historyDir = path.join(workMemoryDir, '.history');
    this.changeLogFile = path.join(this.historyDir, 'change-log.json');
  }

  /**
   * 히스토리 시스템 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await ensureDirectoryExists(this.historyDir);
      
      // change-log.json 파일이 없으면 생성
      try {
        await fs.access(this.changeLogFile);
      } catch {
        await fs.writeFile(this.changeLogFile, JSON.stringify([], null, 2));
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize change tracker: ${error}`);
    }
  }

  /**
   * 변경 이력 로그 추가
   */
  async logChange(
    changeType: ChangeType,
    memoryId: string,
    options: {
      projectName?: string;
      beforeData?: any;
      afterData?: any;
      description?: string;
      metadata?: ChangeMetadata;
    } = {}
  ): Promise<ChangeLogEntry> {
    await this.initialize();

    const changeLog: ChangeLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      changeType,
      memoryId,
      projectName: options.projectName,
      beforeData: options.beforeData,
      afterData: options.afterData,
      description: options.description,
      metadata: options.metadata
    };

    try {
      // 기존 로그 읽기
      const logs = await this.readChangeLogs();
      logs.push(changeLog);

      // 로그 파일 업데이트
      await fs.writeFile(this.changeLogFile, JSON.stringify(logs, null, 2));

      return changeLog;
    } catch (error) {
      throw new Error(`Failed to log change: ${error}`);
    }
  }

  /**
   * 히스토리 조회
   */
  async queryHistory(query: HistoryQuery = {}): Promise<HistorySearchResult> {
    await this.initialize();

    try {
      const logs = await this.readChangeLogs();
      let filteredLogs = logs;

      // 필터링 적용
      if (query.startDate) {
        const startDate = new Date(query.startDate);
        filteredLogs = filteredLogs.filter(log => 
          new Date(log.timestamp) >= startDate
        );
      }

      if (query.endDate) {
        const endDate = new Date(query.endDate);
        filteredLogs = filteredLogs.filter(log => 
          new Date(log.timestamp) <= endDate
        );
      }

      if (query.projectName) {
        filteredLogs = filteredLogs.filter(log => 
          log.projectName === query.projectName
        );
      }

      if (query.changeType) {
        const changeTypes = Array.isArray(query.changeType) 
          ? query.changeType 
          : [query.changeType];
        filteredLogs = filteredLogs.filter(log => 
          changeTypes.includes(log.changeType)
        );
      }

      if (query.memoryId) {
        filteredLogs = filteredLogs.filter(log => 
          log.memoryId === query.memoryId
        );
      }

      // 정렬 (최신순)
      filteredLogs.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // 페이지네이션 적용
      const totalCount = filteredLogs.length;
      const offset = query.offset || 0;
      const limit = query.limit || 100;
      
      const entries = filteredLogs.slice(offset, offset + limit);
      const hasMore = offset + limit < totalCount;

      return {
        entries,
        totalCount,
        hasMore
      };
    } catch (error) {
      throw new Error(`Failed to query history: ${error}`);
    }
  }

  /**
   * 특정 메모리의 변경 이력 조회
   */
  async getMemoryHistory(memoryId: string, limit: number = 50): Promise<ChangeLogEntry[]> {
    const result = await this.queryHistory({
      memoryId,
      limit
    });
    return result.entries;
  }

  /**
   * 프로젝트별 변경 이력 조회
   */
  async getProjectHistory(projectName: string, limit: number = 100): Promise<ChangeLogEntry[]> {
    const result = await this.queryHistory({
      projectName,
      limit
    });
    return result.entries;
  }

  /**
   * 날짜 범위별 변경 이력 조회
   */
  async getHistoryByDateRange(
    startDate: string, 
    endDate: string, 
    limit: number = 200
  ): Promise<ChangeLogEntry[]> {
    const result = await this.queryHistory({
      startDate,
      endDate,
      limit
    });
    return result.entries;
  }

  /**
   * 변경 로그 통계 조회
   */
  async getChangeStatistics(projectName?: string): Promise<{
    totalChanges: number;
    changesByType: Record<ChangeType, number>;
    recentActivity: ChangeLogEntry[];
  }> {
    const query: HistoryQuery = projectName ? { projectName } : {};
    const result = await this.queryHistory(query);

    const changesByType: Record<ChangeType, number> = {
      CREATE: 0,
      UPDATE: 0,
      DELETE: 0,
      ARCHIVE: 0,
      RESTORE: 0
    };

    result.entries.forEach(entry => {
      changesByType[entry.changeType]++;
    });

    // 최근 10개 활동
    const recentActivity = result.entries.slice(0, 10);

    return {
      totalChanges: result.totalCount,
      changesByType,
      recentActivity
    };
  }

  /**
   * 변경 로그 파일 읽기
   */
  private async readChangeLogs(): Promise<ChangeLogEntry[]> {
    try {
      const content = await fs.readFile(this.changeLogFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // 파일이 없거나 읽기 실패 시 빈 배열 반환
      return [];
    }
  }

  /**
   * 히스토리 정리 (오래된 로그 삭제)
   */
  async cleanupHistory(daysToKeep: number = 90): Promise<number> {
    await this.initialize();

    try {
      const logs = await this.readChangeLogs();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const filteredLogs = logs.filter(log => 
        new Date(log.timestamp) >= cutoffDate
      );

      const removedCount = logs.length - filteredLogs.length;

      if (removedCount > 0) {
        await fs.writeFile(this.changeLogFile, JSON.stringify(filteredLogs, null, 2));
      }

      return removedCount;
    } catch (error) {
      throw new Error(`Failed to cleanup history: ${error}`);
    }
  }
}