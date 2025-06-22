import { Tool } from '@modelcontextprotocol/sdk/types.js';
import databaseManager from '../database/connection.js';

export interface ConnectionMonitorArgs {
  include_performance?: boolean;
  include_stats?: boolean;
}

export const connectionMonitorTool: Tool = {
  name: 'connection_monitor',
  description: '데이터베이스 연결 상태 및 성능을 모니터링합니다',
  inputSchema: {
    type: 'object',
    properties: {
      include_performance: {
        type: 'boolean',
        description: '성능 측정 포함 여부',
        default: true
      },
      include_stats: {
        type: 'boolean',
        description: '연결 통계 포함 여부',
        default: true
      }
    }
  }
};

export async function handleConnectionMonitor(args: ConnectionMonitorArgs): Promise<string> {
  try {
    let result = '🔍 **데이터베이스 연결 모니터링**\n\n';
    
    // 즉시 기본 정보 반환으로 응답성 테스트
    result += '✅ **연결 상태 확인 시작**\n';
    
    // 1. 연결 상태 확인
    if (args.include_stats !== false) {
      try {
        const stats = databaseManager.getConnectionStats();
        result += '📊 **연결 상태:**\n';
        result += `- 캐시 상태: ${stats.cached ? '✅ 활성' : '❌ 비활성'}\n`;
        if (stats.cached) {
          result += `- 사용 횟수: ${stats.useCount}회\n`;
          result += `- 마지막 사용: ${stats.age}ms 전\n`;
          
          // 연결 건강도 확인
          if (stats.useCount > 80) {
            result += `- ⚠️ 연결 사용량 높음 (80회 이상)\n`;
          }
          if (stats.age > 300000) { // 5분 이상
            result += `- 💤 연결 장시간 유휴 상태\n`;
          }
        }
        result += '\n';
      } catch (statsError) {
        result += '❌ **연결 상태 확인 실패**\n';
        result += `오류: ${statsError instanceof Error ? statsError.message : String(statsError)}\n\n`;
      }
    }
    
    // 2. 고급 성능 테스트
    if (args.include_performance !== false) {
      try {
        const connection = databaseManager.getConnection();
      
      result += '⚡ **성능 측정:**\n';
      
      // 다양한 쿼리 성능 테스트
      const performanceTests = [
        {
          name: '연결 테스트',
          query: 'SELECT 1 as test',
          expected: '<2ms'
        },
        {
          name: '메모리 카운트',
          query: 'SELECT COUNT(*) FROM work_memories',
          expected: '<5ms'
        },
        {
          name: '복합 통계',
          query: `
            SELECT 
              COUNT(*) as total,
              COUNT(CASE WHEN is_archived = 0 THEN 1 END) as active,
              COUNT(CASE WHEN is_archived = 1 THEN 1 END) as archived
            FROM work_memories
          `,
          expected: '<10ms'
        },
        {
          name: '인덱스 활용 조회',
          query: 'SELECT * FROM work_memories WHERE is_archived = 0 ORDER BY importance_score DESC LIMIT 5',
          expected: '<15ms'
        },
        {
          name: '키워드 조인',
          query: `
            SELECT w.id, w.content, GROUP_CONCAT(k.keyword) as keywords
            FROM work_memories w 
            LEFT JOIN search_keywords k ON w.id = k.memory_id 
            WHERE w.is_archived = 0 
            GROUP BY w.id 
            LIMIT 3
          `,
          expected: '<25ms'
        }
      ];

      let totalTime = 0;
      let slowQueries = 0;

      for (const test of performanceTests) {
        const start = Date.now();
        try {
          await connection.get(test.query);
          const duration = Date.now() - start;
          totalTime += duration;
          
          let status = '🚀';
          if (duration > 50) {
            status = '🐌';
            slowQueries++;
          } else if (duration > 20) {
            status = '⚠️';
          } else if (duration > 10) {
            status = '✅';
          }
          
          result += `${status} ${test.name}: ${duration}ms (목표: ${test.expected})\n`;
        } catch (error) {
          result += `❌ ${test.name}: 오류 - ${error instanceof Error ? error.message : String(error)}\n`;
          slowQueries++;
        }
      }

      // 배치 처리 테스트
      const batchStart = Date.now();
      try {
        await connection.batch([
          { sql: 'SELECT COUNT(*) FROM work_memories', params: [] },
          { sql: 'SELECT COUNT(*) FROM search_keywords', params: [] },
          { sql: 'SELECT COUNT(*) FROM project_index', params: [] }
        ]);
        const batchTime = Date.now() - batchStart;
        totalTime += batchTime;
        
        result += `${batchTime < 20 ? '🚀' : batchTime < 50 ? '✅' : '⚠️'} 배치 처리: ${batchTime}ms (3개 쿼리)\n`;
      } catch (error) {
        result += `❌ 배치 처리: 오류 - ${error instanceof Error ? error.message : String(error)}\n`;
        slowQueries++;
      }
      
      result += '\n';
      
      // 전체 성능 평가
      const avgTime = totalTime / (performanceTests.length + 1);
      result += '📈 **성능 종합 평가:**\n';
      
      if (slowQueries === 0 && avgTime < 10) {
        result += '🚀 **우수** - 모든 쿼리가 빠르게 실행됨\n';
      } else if (slowQueries <= 1 && avgTime < 20) {
        result += '✅ **양호** - 대부분 쿼리가 적절한 성능\n';
      } else if (slowQueries <= 2 && avgTime < 40) {
        result += '⚠️ **보통** - 일부 쿼리 최적화 필요\n';
      } else {
        result += '🐌 **개선 필요** - 성능 최적화 권장\n';
      }
      
      result += `- 평균 응답시간: ${avgTime.toFixed(1)}ms\n`;
      result += `- 느린 쿼리: ${slowQueries}개\n\n`;
      
      } catch (performanceError) {
        result += '❌ **성능 테스트 실패**\n';
        result += `오류: ${performanceError instanceof Error ? performanceError.message : String(performanceError)}\n\n`;
      }
    }
    
    // 3. 데이터베이스 상태 확인
    try {
      const connection = databaseManager.getConnection();
      
      // PRAGMA 설정 확인
      const journalMode = await connection.get('PRAGMA journal_mode');
      const synchronous = await connection.get('PRAGMA synchronous');
      const cacheSize = await connection.get('PRAGMA cache_size');
      const busyTimeout = await connection.get('PRAGMA busy_timeout');
    
    result += '\n🔧 **데이터베이스 설정:**\n';
    result += `- Journal Mode: ${journalMode.journal_mode}\n`;
    result += `- Synchronous: ${synchronous.synchronous}\n`;
    result += `- Cache Size: ${cacheSize.cache_size} pages\n`;
    result += `- Busy Timeout: ${busyTimeout.busy_timeout}ms\n`;
    
    // WAL 파일 상태 (WAL 모드인 경우)
    if (journalMode.journal_mode === 'wal') {
      const walCheckpoint = await connection.get('PRAGMA wal_checkpoint(PASSIVE)');
      result += `- WAL Checkpoint: ${walCheckpoint.busy === 0 ? '✅ 정상' : '⚠️ 진행중'}\n`;
      }
      
      // 4. 권장사항
      result += '\n💡 **최적화 권장사항:**\n';
      
      const stats = databaseManager.getConnectionStats();
      if (!stats.cached) {
        result += '- 🔄 연결 캐싱이 비활성화됨 → 첫 요청 후 활성화 예정\n';
      }
      
      if (stats.useCount > 80) {
        result += '- ♻️ 연결 사용 횟수가 많음 → 곧 새 연결로 갱신 예정\n';
      }
      
      if (journalMode.journal_mode !== 'wal') {
        result += '- 📝 WAL 모드가 아님 → 동시성 성능 제한\n';
      }
    
    } catch (dbStateError) {
      result += '❌ **데이터베이스 상태 확인 실패**\n';
      result += `오류: ${dbStateError instanceof Error ? dbStateError.message : String(dbStateError)}\n`;
    }
    
    return result;
    
  } catch (error) {
    throw new Error(`연결 모니터링 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
} 