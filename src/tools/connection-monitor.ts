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
    
    // 1. 연결 상태 확인
    if (args.include_stats !== false) {
      const stats = databaseManager.getConnectionStats();
      result += '📊 **연결 상태:**\n';
      result += `- 캐시 상태: ${stats.cached ? '✅ 활성' : '❌ 비활성'}\n`;
      if (stats.cached) {
        result += `- 사용 횟수: ${stats.useCount}회\n`;
        result += `- 마지막 사용: ${stats.age}ms 전\n`;
      }
      result += '\n';
    }
    
    // 2. 성능 테스트
    if (args.include_performance !== false) {
      const connection = databaseManager.getConnection();
      
      // 단순 쿼리 성능 측정
      const simpleStart = Date.now();
      await connection.get('SELECT 1 as test');
      const simpleTime = Date.now() - simpleStart;
      
      // 복잡한 쿼리 성능 측정
      const complexStart = Date.now();
      await connection.get(`
        SELECT 
          COUNT(*) as total_memories,
          COUNT(CASE WHEN is_archived = 0 THEN 1 END) as active_memories,
          COUNT(CASE WHEN is_archived = 1 THEN 1 END) as archived_memories
        FROM work_memories
      `);
      const complexTime = Date.now() - complexStart;
      
      // 트랜잭션 성능 측정
      const batchStart = Date.now();
      await connection.batch([
        { sql: 'SELECT 1', params: [] },
        { sql: 'SELECT 2', params: [] },
        { sql: 'SELECT 3', params: [] }
      ]);
      const batchTime = Date.now() - batchStart;
      
      result += '⚡ **성능 측정:**\n';
      result += `- 단순 쿼리: ${simpleTime}ms\n`;
      result += `- 복잡 쿼리: ${complexTime}ms\n`;
      result += `- 배치 처리: ${batchTime}ms (3개 작업)\n`;
      result += '\n';
      
      // 성능 평가
      const avgTime = (simpleTime + complexTime + batchTime) / 3;
      if (avgTime < 5) {
        result += '🚀 **성능 평가: 우수** (5ms 미만)\n';
      } else if (avgTime < 15) {
        result += '✅ **성능 평가: 양호** (15ms 미만)\n';
      } else if (avgTime < 50) {
        result += '⚠️ **성능 평가: 보통** (50ms 미만)\n';
      } else {
        result += '🐌 **성능 평가: 개선 필요** (50ms 이상)\n';
      }
    }
    
    // 3. 데이터베이스 상태 확인
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
    
    return result;
    
  } catch (error) {
    throw new Error(`연결 모니터링 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
} 