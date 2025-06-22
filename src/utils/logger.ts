/**
 * MCP 서버용 로깅 시스템
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4  // 모든 로그 비활성화
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
  error?: Error;
  count?: number; // 중복 메시지 카운트
}

class Logger {
  private logLevel: LogLevel;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private recentMessages: Map<string, { count: number; lastTime: number }> = new Map();
  private throttleWindow: number = 5000; // 5초 스로틀링
  private maxDuplicates: number = 5; // 중복 메시지 최대 개수

  constructor() {
    // 환경변수에서 로그 레벨 설정
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
    switch (envLogLevel) {
      case 'DEBUG':
        this.logLevel = LogLevel.DEBUG;
        break;
      case 'INFO':
        this.logLevel = LogLevel.INFO;
        break;
      case 'WARN':
        this.logLevel = LogLevel.WARN;
        break;
      case 'ERROR':
        this.logLevel = LogLevel.ERROR;
        break;
      case 'NONE':
        this.logLevel = LogLevel.NONE;
        break;
      default:
        this.logLevel = LogLevel.INFO;
    }
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private isDuplicate(component: string, message: string): boolean {
    // MCP 통신 관련 반복 메시지는 더 엄격하게 필터링
    const mcpCommunicationPatterns = [
      'tools/list',
      'resources/list', 
      'prompts/list',
      'Message from client:',
      'Message from server:'
    ];
    
    const isMcpCommunication = mcpCommunicationPatterns.some(pattern => 
      message.includes(pattern)
    );
    
    const key = `${component}:${message}`;
    const now = Date.now();
    const existing = this.recentMessages.get(key);

    if (existing) {
      // MCP 통신 메시지는 더 짧은 윈도우와 낮은 임계값 적용
      const throttleWindow = isMcpCommunication ? 1000 : this.throttleWindow; // 1초 vs 5초
      const maxDuplicates = isMcpCommunication ? 2 : this.maxDuplicates; // 2개 vs 5개
      
      if (now - existing.lastTime < throttleWindow) {
        existing.count++;
        existing.lastTime = now;
        
        if (existing.count > maxDuplicates) {
          return true;
        }
      } else {
        existing.count = 1;
        existing.lastTime = now;
      }
    } else {
      this.recentMessages.set(key, { count: 1, lastTime: now });
    }

    // 메모리 누수 방지: 오래된 엔트리 정리
    if (this.recentMessages.size > 1000) {
      const cutoff = now - this.throttleWindow * 2;
      for (const [key, value] of this.recentMessages.entries()) {
        if (value.lastTime < cutoff) {
          this.recentMessages.delete(key);
        }
      }
    }

    return false;
  }

  private addLog(level: LogLevel, component: string, message: string, data?: any, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    // 중복 메시지 필터링 (ERROR 레벨은 항상 로그)
    if (level !== LogLevel.ERROR && this.isDuplicate(component, message)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      ...(data !== undefined && { data }),
      ...(error !== undefined && { error })
    };

    this.logs.push(entry);

    // 로그 크기 제한
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-Math.floor(this.maxLogs * 0.8)); // 80% 유지
    }

    // 콘솔 출력 (개발용)
    this.outputToConsole(entry);
  }

  private outputToConsole(entry: LogEntry): void {
    // MCP 프로토콜 준수: stdout은 JSON-RPC 전용, 로그는 완전 비활성화
    // 모든 로그 출력은 MCP 클라이언트 파싱 오류를 방지하기 위해 차단
  }

  debug(component: string, message: string, data?: any): void {
    this.addLog(LogLevel.DEBUG, component, message, data);
  }

  info(component: string, message: string, data?: any): void {
    this.addLog(LogLevel.INFO, component, message, data);
  }

  warn(component: string, message: string, data?: any, error?: Error): void {
    this.addLog(LogLevel.WARN, component, message, data, error);
  }

  error(component: string, message: string, data?: any, error?: Error): void {
    this.addLog(LogLevel.ERROR, component, message, data, error);
  }

  // 특정 도구 실행 로그 - 중요한 도구만 INFO, 나머지는 DEBUG
  toolExecution(toolName: string, args: any, startTime: number): void {
    const duration = Date.now() - startTime;
    
    // 중요한 도구들은 INFO 레벨로 기록
    const importantTools = ['add_work_memory', 'search_work_memory', 'delete_work_memory'];
    const isImportant = importantTools.includes(toolName);
    
    if (isImportant) {
      this.info('MCP_TOOL', `Executed ${toolName}`, { 
        duration_ms: duration,
        args_count: Object.keys(args).length
      });
    } else {
      this.debug('MCP_TOOL', `Executed ${toolName}`, { 
        duration_ms: duration,
        args_keys: Object.keys(args)
      });
    }
  }

  // 도구 실행 오류 로그
  toolError(toolName: string, error: Error, args: any): void {
    this.error('MCP_TOOL', `Failed to execute ${toolName}`, { 
      args_keys: Object.keys(args),
      error_message: error.message
    }, error);
  }

  // 서버 상태 로그
  serverStatus(message: string, data?: any): void {
    this.info('MCP_SERVER', message, data);
  }

  // 메모리 작업 로그 - DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
  memoryOperation(operation: string, memoryId?: string, data?: any): void {
    this.debug('MEMORY_OP', `${operation}${memoryId ? ` - ${memoryId}` : ''}`, data);
  }

  // 검색 작업 로그 - DEBUG로 하향: 반복 빈도 높고, 정상 상태에서는 불필요함
  searchOperation(query: string, resultsCount: number, duration: number): void {
    this.debug('SEARCH', `Query executed: "${query}"`, {
      results_count: resultsCount,
      duration_ms: duration
    });
  }

  // 최근 로그 조회
  getRecentLogs(count: number = 50, level?: LogLevel): LogEntry[] {
    let filteredLogs = this.logs;
    
    if (level !== undefined) {
      filteredLogs = this.logs.filter(log => log.level >= level);
    }

    return filteredLogs.slice(-count);
  }

  // 컴포넌트별 로그 조회
  getLogsByComponent(component: string, count: number = 50): LogEntry[] {
    return this.logs
      .filter(log => log.component === component)
      .slice(-count);
  }

  // 로그 통계
  getLogStats(): {
    total: number;
    by_level: Record<string, number>;
    by_component: Record<string, number>;
    recent_errors: LogEntry[];
  } {
    const byLevel: Record<string, number> = {
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0
    };

    const byComponent: Record<string, number> = {};

    this.logs.forEach(log => {
      const levelName = LogLevel[log.level];
      byLevel[levelName] = (byLevel[levelName] || 0) + 1;
      byComponent[log.component] = (byComponent[log.component] || 0) + 1;
    });

    const recentErrors = this.logs
      .filter(log => log.level === LogLevel.ERROR)
      .slice(-10);

    return {
      total: this.logs.length,
      by_level: byLevel,
      by_component: byComponent,
      recent_errors: recentErrors
    };
  }

  // 로그 지우기
  clearLogs(): void {
    this.logs = [];
    this.info('LOGGER', 'Logs cleared');
  }

  // 로그를 파일로 내보내기 (선택적)
  async exportLogs(filePath?: string): Promise<string> {
    const exportData = {
      exported_at: new Date().toISOString(),
      total_logs: this.logs.length,
      logs: this.logs
    };

    const data = JSON.stringify(exportData, null, 2);
    
    if (filePath) {
      // 파일 시스템 작업은 여기서는 구현하지 않음 (의존성 최소화)
      // 실제 구현에서는 fs.writeFile 사용
      // console.log( // JSON-RPC 간섭 방지`Export data ready for file: ${filePath}`);
    }
    
    return data;
  }
}

// Logger 인스턴스 생성 및 export
export const logger = new Logger();

// 개발 환경에서는 DEBUG 레벨, 프로덕션에서는 INFO 레벨
if (process.env.NODE_ENV === 'development') {
  logger.setLogLevel(LogLevel.DEBUG);
} else {
  logger.setLogLevel(LogLevel.INFO);
}