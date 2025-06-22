#!/usr/bin/env node

// MCP 프로토콜 보호를 위한 console 오버라이드 (가장 먼저 실행)
import { initMcpConsole } from './utils/mcp-console.js';
initMcpConsole();

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './utils/logger.js';

// 통합된 5개 도구 import
import { memoryTool, handleMemory, MemoryOperationArgs } from './tools/memory.js';
import { searchTool, handleSearch, SearchOperationArgs } from './tools/search.js';
import { sessionTool, handleSession, SessionOperationArgs } from './tools/session.js';
import { historyTool, handleHistory, HistoryOperationArgs } from './tools/history.js';
import { systemTool, handleSystem, SystemOperationArgs } from './tools/system.js';
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
  private requestQueue: Map<string, Promise<any>> = new Map();
  private activeRequests: number = 0;
  private maxConcurrentRequests: number = 5;

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
      logger.serverStatus('Database initialization completed ( 대대better-sqlite3)');
      
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
          memoryTool,
          searchTool,
          sessionTool,
          historyTool,
          systemTool
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

    // 도구 실행 핸들러 - 동기화된 처리
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const requestId = Math.random().toString(36).substring(2, 8);
      const startTime = Date.now();

      // 동시 요청 제한 확인
      if (this.activeRequests >= this.maxConcurrentRequests) {
        logger.warn('MCP_HANDLER', `[${requestId}] Too many concurrent requests, queuing...`);
        
        return this.createSafeResponse(
          `⏳ 서버가 현재 많은 요청을 처리 중입니다. 잠시 후 다시 시도해주세요.`,
          requestId
        );
      }

      try {
        this.activeRequests++;
        logger.debug('MCP_HANDLER', `[${requestId}] Executing tool: ${name} (active: ${this.activeRequests})`, { args_keys: Object.keys(args || {}) });

        // 요청 처리 실행
        const executionPromise = this.executeWithSynchronization(name, args, startTime, requestId);
        this.requestQueue.set(requestId, executionPromise);

        const result = await withTimeout(
          executionPromise,
          30000,
          `Tool execution: ${name} [${requestId}]`
        );
        
        logger.debug('MCP_HANDLER', `[${requestId}] Tool execution completed: ${name}`);
        return result;
      } catch (error) {
        const err = error as Error;
        logger.toolError(name, err, args);
        
        const formattedError = formatErrorForUser(err);
        logger.debug('MCP_HANDLER', `[${requestId}] Tool execution failed: ${name}`);
        
        return this.createSafeResponse(
          `❌ Error executing ${name}: ${formattedError}`,
          requestId
        );
      } finally {
        this.activeRequests--;
        this.requestQueue.delete(requestId);
        logger.debug('MCP_HANDLER', `[${requestId}] Request cleanup completed (active: ${this.activeRequests})`);
      }
    });
  }

  /**
   * 동기화된 요청 실행 - 경합 조건 방지
   */
  private async executeWithSynchronization(name: string, args: any, startTime: number, requestId: string): Promise<any> {
    // 상태 플래그로 실행 추적
    const executionState = {
      started: Date.now(),
      name,
      requestId,
      completed: false
    };

    try {
      logger.debug('SYNC_EXEC', `[${requestId}] Starting synchronized execution for ${name}`);
      
      // 실제 도구 실행
      const result = await this.executeToolSwitch(name, args, startTime, requestId);
      
      executionState.completed = true;
      logger.debug('SYNC_EXEC', `[${requestId}] Synchronized execution completed for ${name}`);
      
      return result;
    } catch (error) {
      executionState.completed = true;
      logger.error('SYNC_EXEC', `[${requestId}] Synchronized execution failed for ${name}`, {}, error as Error);
      throw error;
    }
  }

  private async executeToolSwitch(name: string, args: any, startTime: number, requestId?: string): Promise<any> {
    const logPrefix = requestId ? `[${requestId}]` : '';
    
    switch (name) {
      case 'memory': {
        logger.debug('TOOL_EXEC', `${logPrefix} Starting memory operation`, { operation: args?.operation });
        const result = await withErrorHandling('MEMORY', name, handleMemory, requestId)(args as unknown as MemoryOperationArgs);
        logger.toolExecution(name, args, startTime);
        logger.debug('TOOL_EXEC', `${logPrefix} Memory operation completed`);
        
        // 안전한 JSON 응답 생성
        return this.createSafeResponse(result, requestId);
      }

      case 'search': {
        logger.debug('TOOL_EXEC', `${logPrefix} Starting search operation`, { operation: args?.operation });
        const result = await withErrorHandling('SEARCH', name, handleSearch, requestId)(args as unknown as SearchOperationArgs);
        logger.toolExecution(name, args, startTime);
        logger.debug('TOOL_EXEC', `${logPrefix} Search operation completed`);
        return this.createSafeResponse(result, requestId);
      }

      case 'session': {
        logger.debug('TOOL_EXEC', `${logPrefix} Starting session operation`, { operation: args?.operation });
        const result = await withErrorHandling('SESSION', name, handleSession, requestId)(args as unknown as SessionOperationArgs);
        logger.toolExecution(name, args, startTime);
        logger.debug('TOOL_EXEC', `${logPrefix} Session operation completed`);
        return this.createSafeResponse(result, requestId);
      }

      case 'history': {
        logger.debug('TOOL_EXEC', `${logPrefix} Starting history operation`, { operation: args?.operation });
        const result = await withErrorHandling('HISTORY', name, handleHistory, requestId)(args as unknown as HistoryOperationArgs);
        logger.toolExecution(name, args, startTime);
        logger.debug('TOOL_EXEC', `${logPrefix} History operation completed`);
        return this.createSafeResponse(result, requestId);
      }

      case 'system': {
        logger.debug('TOOL_EXEC', `${logPrefix} Starting system operation`, { operation: args?.operation });
        const result = await withErrorHandling('SYSTEM', name, handleSystem, requestId)(args as unknown as SystemOperationArgs);
        logger.toolExecution(name, args, startTime);
        logger.debug('TOOL_EXEC', `${logPrefix} System operation completed`);
        return this.createSafeResponse(result, requestId);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * 안전한 MCP 응답 생성 - race condition 방지
   */
  private createSafeResponse(result: any, requestId?: string): any {
    try {
      // 동기적 처리로 race condition 방지
      let textContent = typeof result === 'string' ? result : String(result);
      
      // MCP 프로토콜 준수를 위한 내용 정화
      textContent = this.sanitizeContent(textContent);
      
      // 최소한의 MCP 응답 구조 (메타데이터 제거로 안정성 향상)
      const response = {
        content: [{ 
          type: 'text', 
          text: textContent 
        }]
      };
      
      // 동기적 직렬화 테스트 - race condition 방지
      const serialized = JSON.stringify(response);
      
      // 안전성 검증
      if (!serialized || serialized.includes('undefined') || serialized.includes('[object Object]')) {
        throw new Error('Invalid response content detected');
      }
      
      return response;
    } catch (error) {
      // 폴백 응답 - 최대한 단순하게
      return {
        content: [{ 
          type: 'text', 
          text: 'Operation completed. Please check the results.' 
        }]
      };
    }
  }

  /**
   * MCP 프로토콜 준수 내용 정화 - 파싱 오류 방지
   */
  private sanitizeContent(content: string): string {
    if (typeof content !== 'string') {
      return String(content || '');
    }
    
    let sanitized = content;
    
    // MCP 클라이언트 파싱 오류를 유발할 수 있는 모든 패턴 제거
    sanitized = sanitized.replace(/async\s+function[^}]*}/g, '');
    sanitized = sanitized.replace(/function\s+\w+[^}]*}/g, '');
    sanitized = sanitized.replace(/Version\s*\{[^}]*}/g, '');
    sanitized = sanitized.replace(/JSON[\s\S]*?parse/gi, '');
    sanitized = sanitized.replace(/parse[\s\S]*?error/gi, '');
    sanitized = sanitized.replace(/stringify[\s\S]*?failed/gi, '');
    
    // 제어 문자 완전 제거
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    sanitized = sanitized.replace(/^\uFEFF/, '');
    
    // 로그 패턴 제거
    sanitized = sanitized.replace(/^\[.*?\].*$/gm, '');
    sanitized = sanitized.replace(/^(Starting|Loading|Initializing|ERROR|WARN|INFO|DEBUG).*$/gmi, '');
    
    // 공백 정리
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    // 길이 제한 (더 보수적으로)
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000);
    }
    
    return sanitized;
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
      // MCP 프로토콜 준수를 위해 모든 파일 로깅 비활성화
      
      logger.serverStatus('Starting MCP transport connection');
      
      // SQLite 데이터베이스 초기화
      await this.initializeDatabase();
      
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      // MCP 프로토콜 준수 - 모든 파일 로깅 비활성화
      
      // 유지 (INFO): 최초 성공 메시지로 가치 있음
      logger.serverStatus('MCP Server started successfully');
      
      // MCP 프로토콜 준수 - heartbeat 완전 비활성화
      
    } catch (error) {
      logger.error('SERVER', 'Failed to start MCP server', {}, error as Error);
      throw error;
    }
  }
}

// 서버 실행
async function main() {
  try {
    const server = new WorkMemoryServer();
    await server.run();
  } catch (error) {
    // 최상위 레벨에서 발생하는 모든 오류를 stderr로 출력
    process.stderr.write(`[CRITICAL_ERROR] MCP server startup failed: ${error}\n`);
    process.exit(1); // 오류 발생 시 비정상 종료
  }
}

main();

// 간단한 에러 핸들링 함수
const withErrorHandling = (operation: string, toolName: string, handler: Function, requestId?: string) => {
  return async (...args: any[]) => {
    const logPrefix = requestId ? `[${requestId}]` : '';
    try {
      logger.debug('ERROR_HANDLER', `${logPrefix} Executing ${toolName}`);
      const result = await handler(...args);
      logger.debug('ERROR_HANDLER', `${logPrefix} ${toolName} completed successfully`);
      return result;
    } catch (error) {
      logger.error(operation, `${logPrefix} Error in ${toolName}`, {}, error as Error);
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