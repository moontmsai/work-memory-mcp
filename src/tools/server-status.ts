/**
 * MCP 서버 상태 및 진단 도구
 */

import { logger } from '../utils/logger.js';

export interface ServerStatusTool {
  name: 'get_server_status';
  description: '업무 메모리 MCP 서버의 상태 및 진단 정보 조회';
  inputSchema: {
    type: 'object';
    properties: {
      include_logs?: {
        type: 'boolean';
        description: '최근 로그 포함 여부 (기본값: false)';
      };
      log_level?: {
        type: 'string';
        enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        description: '포함할 로그 레벨 (기본값: INFO)';
      };
      log_count?: {
        type: 'number';
        description: '포함할 로그 개수 (기본값: 10)';
      };
    };
    additionalProperties: false;
  };
}

export const serverStatusTool: ServerStatusTool = {
  name: 'get_server_status',
  description: '업무 메모리 MCP 서버의 상태 및 진단 정보 조회',
  inputSchema: {
    type: 'object',
    properties: {
      include_logs: {
        type: 'boolean',
        description: '최근 로그 포함 여부 (기본값: false)'
      },
      log_level: {
        type: 'string',
        enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'],
        description: '포함할 로그 레벨 (기본값: INFO)'
      },
      log_count: {
        type: 'number',
        description: '포함할 로그 개수 (기본값: 10)'
      }
    },
    additionalProperties: false
  }
};

export interface GetServerStatusArgs {
  include_logs?: boolean;
  log_level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  log_count?: number;
}

export async function handleGetServerStatus(args: GetServerStatusArgs): Promise<string> {
  try {
    const startTime = Date.now();
    
    // 기본값 설정
    const includeLogs = args.include_logs ?? false;
    const logLevel = args.log_level ?? 'INFO';
    const logCount = args.log_count ?? 10;

    // 서버 기본 정보
    const serverInfo = {
      name: 'work-memory-mcp',
      version: '0.1.0',
      uptime: process.uptime(),
      node_version: process.version,
      memory_usage: process.memoryUsage(),
      startup_time: new Date().toISOString()
    };

    // 로그 통계
    const logStats = logger.getLogStats();

    // 메모리 사용량 포맷팅
    const formatBytes = (bytes: number): string => {
      const mb = bytes / 1024 / 1024;
      return `${mb.toFixed(2)} MB`;
    };

    let result = `🧠 **Work Memory MCP Server Status**\n\n`;
    
    // 서버 정보
    result += `📊 **서버 정보**\n`;
    result += `- 이름: ${serverInfo.name}\n`;
    result += `- 버전: ${serverInfo.version}\n`;
    result += `- 가동 시간: ${Math.floor(serverInfo.uptime / 60)}분 ${Math.floor(serverInfo.uptime % 60)}초\n`;
    result += `- Node.js 버전: ${serverInfo.node_version}\n\n`;

    // 메모리 사용량
    result += `💾 **메모리 사용량**\n`;
    result += `- RSS: ${formatBytes(serverInfo.memory_usage.rss)}\n`;
    result += `- Heap Used: ${formatBytes(serverInfo.memory_usage.heapUsed)}\n`;
    result += `- Heap Total: ${formatBytes(serverInfo.memory_usage.heapTotal)}\n`;
    result += `- External: ${formatBytes(serverInfo.memory_usage.external)}\n\n`;

    // 사용 가능한 도구
    result += `🔧 **사용 가능한 도구**\n`;
    const tools = [
      'add_work_memory - 업무 메모리 추가',
      'search_work_memory - 메모리 검색',
      'list_work_memories - 메모리 목록 조회',
      'delete_work_memory - 메모리 삭제',
      'get_related_keywords - 연관 키워드 조회',
      'get_search_stats - 검색 통계',
      'optimize_search_index - 인덱스 최적화',
      'get_server_status - 서버 상태 조회'
    ];
    
    tools.forEach(tool => {
      result += `- ${tool}\n`;
    });
    result += '\n';

    // 로그 통계
    result += `📝 **로그 통계**\n`;
    result += `- 총 로그 수: ${logStats.total}\n`;
    result += `- DEBUG: ${logStats.by_level.DEBUG}\n`;
    result += `- INFO: ${logStats.by_level.INFO}\n`;
    result += `- WARN: ${logStats.by_level.WARN}\n`;
    result += `- ERROR: ${logStats.by_level.ERROR}\n\n`;

    // 컴포넌트별 로그 수
    result += `🏗️ **컴포넌트별 활동**\n`;
    Object.entries(logStats.by_component).forEach(([component, count]) => {
      result += `- ${component}: ${count}개 로그\n`;
    });
    result += '\n';

    // 최근 오류 (있는 경우)
    if (logStats.recent_errors.length > 0) {
      result += `⚠️ **최근 오류 (최대 3개)**\n`;
      logStats.recent_errors.slice(-3).forEach((error, index) => {
        const timeAgo = Math.floor((Date.now() - new Date(error.timestamp).getTime()) / 1000 / 60);
        result += `${index + 1}. [${timeAgo}분 전] ${error.component}: ${error.message}\n`;
      });
      result += '\n';
    }

    // 로그 포함 요청시
    if (includeLogs) {
      const logLevelMap: Record<string, number> = {
        'DEBUG': 0,
        'INFO': 1,
        'WARN': 2,
        'ERROR': 3
      };
      
      const recentLogs = logger.getRecentLogs(logCount, logLevelMap[logLevel]);
      
      result += `📋 **최근 로그 (${logLevel} 이상, 최대 ${logCount}개)**\n`;
      if (recentLogs.length === 0) {
        result += `로그가 없습니다.\n\n`;
      } else {
        recentLogs.forEach((log, index) => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          const levelName = ['DEBUG', 'INFO', 'WARN', 'ERROR'][log.level];
          result += `${index + 1}. [${time}] ${levelName} [${log.component}] ${log.message}\n`;
        });
        result += '\n';
      }
    }

    // 성능 정보
    const duration = Date.now() - startTime;
    result += `⏱️ **진단 완료**: ${duration}ms\n`;
    result += `🕐 **현재 시각**: ${new Date().toLocaleString()}\n`;

    logger.info('SERVER_STATUS', 'Server status queried', {
      include_logs: includeLogs,
      log_level: logLevel,
      log_count: logCount,
      total_logs: logStats.total,
      recent_errors: logStats.recent_errors.length
    });

    return result;

  } catch (error) {
    logger.error('SERVER_STATUS', 'Failed to get server status', {}, error as Error);
    return `❌ 서버 상태 조회 중 오류 발생: ${(error as Error).message}`;
  }
}

/**
 * 서버 헬스체크
 */
export async function performHealthCheck(): Promise<{
  healthy: boolean;
  issues: string[];
  timestamp: string;
}> {
  const issues: string[] = [];
  const timestamp = new Date().toISOString();

  try {
    // 메모리 사용량 체크
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > 512) { // 512MB 이상
      issues.push(`High memory usage: ${heapUsedMB.toFixed(2)} MB`);
    }

    // 오류 로그 체크
    const logStats = logger.getLogStats();
    const errorCount = logStats.by_level.ERROR || 0;
    
    if (errorCount > 10) {
      issues.push(`High error count: ${errorCount} errors logged`);
    }

    // 최근 오류 체크 (5분 이내)
    const recentErrors = logStats.recent_errors.filter(error => {
      const errorTime = new Date(error.timestamp).getTime();
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      return errorTime > fiveMinutesAgo;
    });

    if (recentErrors.length > 3) {
      issues.push(`Recent errors detected: ${recentErrors.length} in last 5 minutes`);
    }

    const healthy = issues.length === 0;

    logger.info('HEALTH_CHECK', 'Health check performed', {
      healthy,
      issues_count: issues.length,
      memory_mb: heapUsedMB.toFixed(2),
      error_count: errorCount
    });

    return {
      healthy,
      issues,
      timestamp
    };

  } catch (error) {
    logger.error('HEALTH_CHECK', 'Health check failed', {}, error as Error);
    return {
      healthy: false,
      issues: [`Health check failed: ${(error as Error).message}`],
      timestamp
    };
  }
}