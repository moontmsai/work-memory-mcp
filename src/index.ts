#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './utils/logger.js';

import { addWorkMemoryTool, handleAddWorkMemory, AddWorkMemoryArgs } from './tools/add-work-memory.js';
import { updateWorkMemoryTool, handleUpdateWorkMemory, UpdateWorkMemoryArgs } from './tools/update-work-memory.js';
import {
  searchWorkMemoryTool,
  handleSearchWorkMemory,
  SearchWorkMemoryArgs
} from './tools/search-work-memory.js';
import {
  getRelatedKeywordsTool,
  handleGetRelatedKeywords,
  GetRelatedKeywordsArgs,
  formatRelatedKeywords
} from './tools/get-related-keywords.js';
import {
  getSearchStatsTool,
  handleGetSearchStats,
  GetSearchStatsArgs,
  formatSearchStats
} from './tools/get-search-stats.js';
import {
  optimizeSearchIndexTool,
  handleOptimizeSearchIndex,
  OptimizeSearchIndexArgs,
  formatOptimizationResults
} from './tools/optimize-search-index.js';
import {
  listWorkMemoriesTool,
  handleListWorkMemories,
  ListWorkMemoriesArgs
} from './tools/list-work-memories.js';
import {
  deleteWorkMemoryTool,
  handleDeleteWorkMemory,
  DeleteWorkMemoryArgs
} from './tools/delete-work-memory.js';

import {
  serverStatusTool,
  handleGetServerStatus,
  GetServerStatusArgs
} from './tools/server-status.js';
import {
  getWorkMemoryHistoryTool,
  handleGetWorkMemoryHistory,
  GetWorkMemoryHistoryArgs
} from './tools/get-work-memory-history.js';
import {
  getWorkMemoryVersionsTool,
  handleGetWorkMemoryVersions,
  GetWorkMemoryVersionsArgs
} from './tools/get-work-memory-versions.js';

import {
  restoreMemoryVersionTool,
  handleRestoreMemoryVersion,
  RestoreMemoryVersionArgs,
  listMemoryVersionsTool,
  handleListMemoryVersions,
  ListMemoryVersionsArgs
} from './tools/restore-memory-version.js';

import {
  batchOperationsTool,
  handleBatchOperations,
  BatchOperationArgs
} from './tools/batch-operations.js';
import {
  connectionMonitorTool,
  handleConnectionMonitor,
  ConnectionMonitorArgs
} from './tools/connection-monitor.js';
import {
  optimizeDatabaseTool,
  handleOptimizeDatabase
} from './tools/optimize-database.js';

// 세션 관리 도구들 (통합됨)
import {
  sessionManagerTool,
  handleSessionManager,
  SessionManagerArgs,
  sessionStatusTool,
  handleSessionStatus,
  SessionStatusArgs,
  // 호환성을 위한 기존 함수들
  handleSetActiveSession,
  SetActiveSessionArgs,
  handleDetectActiveSession,
  DetectActiveSessionArgs,
  handleGetSessionContext,
  handleSetAutoLink,
  SetAutoLinkArgs,
  handleClearActiveSession
} from './tools/session-context-tools.js';
// FileLockManager는 SQLite 전환으로 더 이상 필요 없음
import { OptimizedMemoryManager } from './utils/optimized-memory.js';
import { ErrorRecoveryManager } from './utils/error-recovery.js';
import { databaseManager, initializeDatabase, getDatabaseConnection, closeDatabaseConnection } from './database/index.js';
import { initializeExclusiveManager } from './session/SessionExclusiveManager.js';

// checkpoint 스케줄러는 better-sqlite3 환경에서 불필요
import { join } from 'path';

/**
 * 업무 메모리 MCP 서버
 * Claude 앱과 Cursor AI 간 업무 컨텍스트 공유를 위한 초경량 메모리 시스템
 */

class WorkMemoryServer {
  private server: Server;

  constructor() {
    // 유지 (INFO) 또는 DEBUG로 하향: 부트 시점 한정 정보로 필요시 유지
    // logger.serverStatus('Initializing Work Memory MCP Server');
    
    this.server = new Server(
      {
        name: 'work-memory-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
    
    // 유지 (INFO): 최초 성공 메시지로 가치 있음
    logger.serverStatus('Work Memory MCP Server initialized successfully');
  }

  /**
   * SQLite 데이터베이스 초기화 및 데이터 검증
   */
  private async initializeDatabase(): Promise<void> {
    try {
      logger.serverStatus('Initializing SQLite database');
      
      // SQLite 데이터베이스 초기화
      await initializeDatabase();
      const connection = getDatabaseConnection();
      
      if (!connection) {
        throw new Error('Failed to establish database connection');
      }
      
      // 현재 데이터베이스 상태 확인
      const memoryCount = await connection.get('SELECT COUNT(*) as count FROM work_memories WHERE is_archived = 0');
      const keywordCount = await connection.get('SELECT COUNT(*) as count FROM search_keywords');
      const projectCount = await connection.get('SELECT COUNT(*) as count FROM project_index');
      const settingsCount = await connection.get('SELECT COUNT(*) as count FROM system_settings');
      
      logger.serverStatus('SQLite database initialized successfully', {
        active_memories: memoryCount.count,
        keywords: keywordCount.count,
        projects: projectCount.count,
        settings: settingsCount.count
      });
      
      // JSON-RPC 호환성을 위해 console.error 대신 logger 사용
      logger.serverStatus(`Database loaded: ${memoryCount.count} active memories, ${keywordCount.count} keywords, ${projectCount.count} projects, ${settingsCount.count} settings`);
      
      // 데이터베이스 무결성 검사
      const integrityCheck = await connection.get('PRAGMA integrity_check');
      if (integrityCheck.integrity_check !== 'ok') {
        logger.warn('DATABASE', 'Database integrity check failed', {
          result: integrityCheck.integrity_check
        });
      } else {
        logger.serverStatus('Database integrity check passed');
      }
      
      // better-sqlite3는 즉시 파일에 쓰므로 체크포인트 스케줄러 불필요
      logger.serverStatus('Database initialization completed (better-sqlite3)');
      
      // 🚀 세션 독점 관리자 초기화 (30분 타임아웃)
      try {
        initializeExclusiveManager(connection, 30 * 60 * 1000); // 30분
        logger.serverStatus('Session Exclusive Manager initialized (30 min timeout)');
      } catch (exclusiveError) {
        logger.warn('INITIALIZATION', 'Failed to initialize Session Exclusive Manager', {}, exclusiveError as Error);
      }
      
      // 주기적 공간 회수 스케줄러 시작 (1시간마다) - 성능 최적화를 위해 비활성화
      // this.startVacuumScheduler();
      
    } catch (error) {
      logger.error('INITIALIZATION', 'Failed to initialize SQLite database', {}, error as Error);
      throw error; // 데이터베이스 초기화 실패는 치명적
    }
  }

  private setupToolHandlers(): void {
    // 도구 목록 제공 - 로그 완전 비활성화 (너무 빈번함)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          addWorkMemoryTool,
          updateWorkMemoryTool,
          listWorkMemoriesTool,
          deleteWorkMemoryTool,
          searchWorkMemoryTool,
          getRelatedKeywordsTool,
          getSearchStatsTool,
          optimizeSearchIndexTool,
          serverStatusTool,
          getWorkMemoryHistoryTool,
          getWorkMemoryVersionsTool,
          restoreMemoryVersionTool,
          listMemoryVersionsTool,
          batchOperationsTool,
          connectionMonitorTool,
          optimizeDatabaseTool,
          // 세션 관리 도구들 (통합됨)
          sessionManagerTool,
          sessionStatusTool
        ],
      };
    });

    // 리소스 목록 제공 (빈 응답으로 오류 방지)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      // DEBUG로 하향: 자원 없음만 반복 확인 (의미 없음)
      // logger.debug('MCP_HANDLER', 'Listing resources (empty)');
      return {
        resources: []
      };
    });

    // 프롬프트 목록 제공 (빈 응답으로 오류 방지)
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      // DEBUG로 하향: 매번 빈 배열 반환됨
      // logger.debug('MCP_HANDLER', 'Listing prompts (empty)');
      return {
        prompts: []
      };
    });

    // 도구 실행 핸들러
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const startTime = Date.now();

      try {
        // DEBUG 또는 생략: 클라이언트 요청 응답으로, 상태 변화 없음
        // logger.debug('MCP_HANDLER', `Executing tool: ${name}`, { args_keys: Object.keys(args || {}) });

        // 타임아웃을 적용한 도구 실행 (30초)
        const result = await withTimeout(this.executeToolSwitch(name, args, startTime), 30000, `Tool execution: ${name}`);
        return result;
      } catch (error) {
        const err = error as Error;
        logger.toolError(name, err, args);
        
        const formattedError = formatErrorForUser(err);
        return {
          content: [
            {
              type: 'text',
              text: `❌ Error executing ${name}: ${formattedError}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async executeToolSwitch(name: string, args: any, startTime: number): Promise<any> {
    switch (name) {
      case 'add_work_memory': {
        const result = await withErrorHandling('ADD_MEMORY', name, handleAddWorkMemory)(args as unknown as AddWorkMemoryArgs);
        logger.toolExecution(name, args, startTime); // 중요한 작업이므로 INFO 레벨로 기록
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'update_work_memory': {
        const result = await withErrorHandling('UPDATE_MEMORY', name, handleUpdateWorkMemory)(args as unknown as UpdateWorkMemoryArgs);
        logger.toolExecution(name, args, startTime); // 중요한 작업이므로 INFO 레벨로 기록
        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      }

      case 'search_work_memory': {
        const result = await withErrorHandling('SEARCH_MEMORY', name, handleSearchWorkMemory)(args as unknown as SearchWorkMemoryArgs);
        logger.toolExecution(name, args, startTime); // 중요한 작업이므로 INFO 레벨로 기록
        
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'get_related_keywords': {
        const result = await withErrorHandling('GET_KEYWORDS', name, handleGetRelatedKeywords)(args as unknown as GetRelatedKeywordsArgs);
        // DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
        // logger.toolExecution(name, args, startTime);
        
        if (result.success && result.related_keywords) {
          const text = formatRelatedKeywords(
            result.keyword, 
            result.related_keywords, 
            result.search_suggestions
          );
          return {
            content: [{ type: 'text', text }],
          };
        } else {
          return {
            content: [{ type: 'text', text: `❌ 연관 키워드 조회 실패: ${result.error}` }],
            isError: true,
          };
        }
      }

      case 'get_search_stats': {
        const result = await withErrorHandling('SEARCH_STATS', name, handleGetSearchStats)(args as unknown as GetSearchStatsArgs);
        // DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
        // logger.toolExecution(name, args, startTime);
        
        if (result.success) {
          const text = formatSearchStats(result);
          return {
            content: [{ type: 'text', text }],
          };
        } else {
          return {
            content: [{ type: 'text', text: `❌ 검색 통계 조회 실패: ${result.error}` }],
            isError: true,
          };
        }
      }

      case 'optimize_search_index': {
        const result = await withErrorHandling('OPTIMIZE_INDEX', name, handleOptimizeSearchIndex)(args as unknown as OptimizeSearchIndexArgs);
        // DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
        // logger.toolExecution(name, args, startTime);
        
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'list_work_memories': {
        const result = await withErrorHandling('LIST_MEMORIES', name, handleListWorkMemories)(args as unknown as ListWorkMemoriesArgs);
        // DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
        // logger.toolExecution(name, args, startTime);
        
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'delete_work_memory': {
        const result = await withErrorHandling('DELETE_MEMORY', name, handleDeleteWorkMemory)(args as unknown as DeleteWorkMemoryArgs);
        logger.toolExecution(name, args, startTime); // 중요한 작업이므로 INFO 레벨로 기록
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'get_server_status': {
        const result = await withErrorHandling('SERVER_STATUS', name, handleGetServerStatus)(args as unknown as GetServerStatusArgs);
        // DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
        // logger.toolExecution(name, args, startTime);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'get_work_memory_history': {
        const result = await withErrorHandling('HISTORY', name, handleGetWorkMemoryHistory)(args as unknown as GetWorkMemoryHistoryArgs);
        // DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
        // logger.toolExecution(name, args, startTime);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'get_work_memory_versions': {
        const result = await withErrorHandling('VERSIONS', name, handleGetWorkMemoryVersions)(args as unknown as GetWorkMemoryVersionsArgs);
        // DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
        // logger.toolExecution(name, args, startTime);
        return {
          content: [{ type: 'text', text: result }],
        };
      }



      case 'restore_memory_version': {
        const result = await withErrorHandling('RESTORE_VERSION', name, handleRestoreMemoryVersion)(args as unknown as RestoreMemoryVersionArgs);
        // DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
        // logger.toolExecution(name, args, startTime);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'list_memory_versions': {
        const result = await withErrorHandling('LIST_VERSIONS', name, handleListMemoryVersions)(args as unknown as ListMemoryVersionsArgs);
        // DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
        // logger.toolExecution(name, args, startTime);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'batch_operations': {
        const result = await withErrorHandling('BATCH_OPERATIONS', name, handleBatchOperations)(args as unknown as BatchOperationArgs);
        logger.toolExecution(name, args, startTime);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'connection_monitor': {
        const result = await withErrorHandling('CONNECTION_MONITOR', name, handleConnectionMonitor)(args as unknown as ConnectionMonitorArgs);
        logger.toolExecution(name, args, startTime);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'optimize_database': {
        const dbPath = databaseManager.getDbPath();
        const result = await withErrorHandling('OPTIMIZE_DATABASE', name, () => handleOptimizeDatabase(dbPath))();
        logger.toolExecution(name, args, startTime);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      // 세션 관리 도구들 (통합됨)
      case 'session_manager': {
        const result = await withErrorHandling('SESSION_MANAGER', name, handleSessionManager)(args as unknown as SessionManagerArgs);
        logger.toolExecution(name, args, startTime);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'session_status': {
        const result = await withErrorHandling('SESSION_STATUS', name, handleSessionStatus)(args as unknown as SessionStatusArgs);
        logger.toolExecution(name, args, startTime);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private setupErrorHandling(): void {
    // MCP 서버 오류 핸들링 개선
    this.server.onerror = (error) => {
      logger.error('MCP_SERVER', 'Server error occurred', {
        errorType: error.constructor.name,
        timestamp: new Date().toISOString()
      }, error);
      
      // JSON 파싱 오류는 WARNING으로 처리 (통신 문제일 수 있음)
      if (error.message.includes('JSON') || error.message.includes('parse')) {
        logger.warn('MCP', `Communication warning: ${error.message}`);
      } else {
        logger.error('MCP', 'MCP Error', error);
      }
    };

    // 프로세스 신호 처리
    const gracefulShutdown = async (signal: string) => {
      logger.info('SERVER', `Received ${signal}, initiating graceful shutdown...`);
      
      try {
        // better-sqlite3는 즉시 파일에 쓰므로 추가 정리 불필요
        logger.info('SERVER', 'Database cleanup not needed (better-sqlite3)');
        
        // 데이터베이스 연결 정리
        try {
          await closeDatabaseConnection();
          logger.info('SERVER', 'Database connection closed successfully');
        } catch (dbError) {
          logger.warn('SERVER', 'Error closing database connection', {}, dbError as Error);
        }
        
        logger.info('SERVER', 'Graceful shutdown completed');
      } catch (error) {
        logger.warn('SERVER', 'Failed to complete graceful shutdown', {}, error as Error);
      } finally {
        process.exit(0);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // 주기적인 유지보수 작업 (5분마다)
    const maintenanceInterval = setInterval(async () => {
      try {
        // SQLite는 자체 동시성 처리로 락 파일 정리가 불필요
        logger.debug('MAINTENANCE', 'SQLite handles locking automatically');
        
        // 메모리 사용량 모니터링
        const memoryUsage = OptimizedMemoryManager.getMemoryUsage();
        
        // 메모리 사용량이 높으면 경고 (heapUsed가 100MB 이상이면)
        const heapUsedMB = parseInt(memoryUsage.heapUsed);
        if (heapUsedMB > 100) {
          logger.warn('MAINTENANCE', 'High memory usage detected', memoryUsage);
        } else {
          logger.debug('MAINTENANCE', 'Memory usage normal', memoryUsage);
        }
        
        // 로그 통계 확인 (매 5번째 유지보수 때만)
        if (Date.now() % (5 * 300000) < 300000) {
          const logStats = logger.getLogStats();
          if (logStats.by_level.ERROR > 10) {
            logger.warn('MAINTENANCE', 'High error count detected', logStats);
          }
        }
        
      } catch (error) {
        logger.warn('MAINTENANCE', 'Maintenance task failed', {}, error as Error);
      }
    }, 300000);

    // 예상치 못한 예외 처리
    process.on('uncaughtException', (error) => {
      logger.error('UNCAUGHT_EXCEPTION', 'Critical error - uncaught exception', {
        stack: error.stack,
        timestamp: new Date().toISOString()
      }, error);
      
      // 파일 시스템이나 JSON 파싱 오류는 복구 시도
      if (error.message.includes('ENOENT') || error.message.includes('JSON')) {
        logger.warn('UNCAUGHT_EXCEPTION', 'Attempting to continue operation after recoverable error');
        return;
      }
      
      // 치명적인 오류는 종료
      logger.error('CRITICAL', 'Critical error occurred. Shutting down...', {});
      clearInterval(maintenanceInterval);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      
      logger.error('UNHANDLED_REJECTION', 'Unhandled promise rejection', { 
        promise: promise.toString(),
        reason: errorMessage,
        timestamp: new Date().toISOString()
      }, reason instanceof Error ? reason : new Error(String(reason)));
      
      // 통신 관련 오류는 경고로만 처리
      if (errorMessage.includes('JSON') || errorMessage.includes('parse') || errorMessage.includes('ECONNRESET')) {
        logger.warn('UNHANDLED_REJECTION', 'Communication error in promise - continuing operation');
        return;
      }
    });

    // 정상 종료 시 유지보수 작업 정리
    process.on('exit', () => {
      clearInterval(maintenanceInterval);
    });
  }

  /**
   * 주기적 공간 회수 스케줄러 시작
   */
  private startVacuumScheduler(): void {
    logger.info('VACUUM_SCHEDULER', 'Starting automatic space reclamation scheduler');
    
    // 1시간마다 INCREMENTAL VACUUM 실행
    setInterval(async () => {
      try {
        const connection = getDatabaseConnection();
        if (connection) {
          await connection.run('PRAGMA incremental_vacuum;');
          logger.debug('VACUUM_SCHEDULER', 'Incremental vacuum completed');
        }
      } catch (error) {
        logger.warn('VACUUM_SCHEDULER', 'Incremental vacuum failed', {}, error as Error);
      }
    }, 60 * 60 * 1000); // 1시간 = 60분 * 60초 * 1000ms
    
    logger.info('VACUUM_SCHEDULER', 'Vacuum scheduler started (interval: 1 hour)');
  }

  /**
   * 서버 실행
   */
  async run(): Promise<void> {
    try {
      // 서버 시작 시 확실한 로그 남기기
      import('fs').then(fs => 
        fs.appendFileSync('./mcp_server_startup.log', 
          `${new Date().toISOString()} - MCP 서버 시작됨 (PID: ${process.pid})\n`
        )
      ).catch(() => {});
      
      logger.serverStatus('Starting MCP transport connection');
      
      // SQLite 데이터베이스 초기화
      await this.initializeDatabase();
      
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      // 서버 연결 후 로그
      import('fs').then(fs => 
        fs.appendFileSync('./mcp_server_startup.log', 
          `${new Date().toISOString()} - MCP 서버 연결 완료\n`
        )
      ).catch(() => {});
      
      // 유지 (INFO): 최초 성공 메시지로 가치 있음
      logger.serverStatus('MCP Server started successfully');
      
      // 주기적 heartbeat (30초마다)
      setInterval(() => {
        import('fs').then(fs => 
          fs.appendFileSync('./mcp_server_heartbeat.log', 
            `${new Date().toISOString()} - MCP 서버 실행 중 (PID: ${process.pid})\n`
          )
        ).catch(() => {});
      }, 30000);
      
    } catch (error) {
      logger.error('SERVER', 'Failed to start MCP server', {}, error as Error);
      throw error;
    }
  }
}

// 서버 실행
async function main() {
  const server = new WorkMemoryServer();
  await server.run();
}

// 에러 핸들링과 함께 메인 함수 실행
main().catch((error) => {
  logger.error('STARTUP', 'Failed to start Work Memory MCP Server', {}, error as Error);
  process.exit(1);
});

// 간단한 에러 핸들링 함수
const withErrorHandling = (operation: string, toolName: string, handler: Function) => {
  return async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      logger.error(operation, `Error in ${toolName}`, {}, error as Error);
      throw error;
    }
  };
};

// 간단한 타임아웃 함수
const withTimeout = async <T>(promise: Promise<T>, timeout: number, operation: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${operation}`)), timeout)
    )
  ]);
};

// 간단한 에러 포맷팅 함수
const formatErrorForUser = (error: any): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};