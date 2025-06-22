import { Tool } from '@modelcontextprotocol/sdk/types.js';
import databaseManager from '../database/connection.js';

export interface SimpleConnectionMonitorArgs {
  include_performance?: boolean;
  include_stats?: boolean;
}

export const simpleConnectionMonitorTool: Tool = {
  name: 'simple_connection_monitor',
  description: '단순화된 데이터베이스 연결 상태 및 성능을 모니터링합니다',
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

export async function handleSimpleConnectionMonitor(args: SimpleConnectionMonitorArgs): Promise<string> {
  let result = '🔍 **단순 데이터베이스 모니터링**\n\n';
  
  try {
    // 1. 기본 연결 테스트
    result += '✅ **연결 테스트 시작**\n';
    
    const connection = databaseManager.getConnection();
    if (!connection) {
      return result + '❌ 데이터베이스 연결 실패\n';
    }
    
    result += '✅ 데이터베이스 연결 성공\n\n';
    
    // 2. 연결 상태 확인
    if (args.include_stats !== false) {
      try {
        const stats = databaseManager.getConnectionStats();
        result += '📊 **연결 상태:**\n';
        result += `- 캐시 상태: ${stats.cached ? '✅ 활성' : '❌ 비활성'}\n`;
        result += `- 사용 횟수: ${stats.useCount || 0}회\n`;
        result += `- 마지막 사용: ${stats.age || 0}ms 전\n\n`;
      } catch (statsError) {
        result += '❌ 연결 상태 확인 실패\n\n';
      }
    }
    
    // 3. 기본 성능 테스트
    if (args.include_performance !== false) {
      try {
        result += '⚡ **성능 테스트:**\n';
        
        // 단순 연결 테스트
        const start1 = Date.now();
        await connection.get('SELECT 1 as test');
        const time1 = Date.now() - start1;
        result += `- 연결 테스트: ${time1}ms\n`;
        
        // 메모리 카운트
        const start2 = Date.now();
        const count = await connection.get('SELECT COUNT(*) as count FROM work_memories');
        const time2 = Date.now() - start2;
        result += `- 메모리 카운트: ${time2}ms (총 ${count.count}개)\n`;
        
        // 키워드 카운트
        const start3 = Date.now();
        const keywords = await connection.get('SELECT COUNT(*) as count FROM search_keywords');
        const time3 = Date.now() - start3;
        result += `- 키워드 카운트: ${time3}ms (총 ${keywords.count}개)\n`;
        
        const avgTime = (time1 + time2 + time3) / 3;
        result += `\n📈 **성능 평가:**\n`;
        result += `- 평균 응답시간: ${avgTime.toFixed(1)}ms\n`;
        
        if (avgTime < 5) {
          result += '🚀 **성능: 우수**\n';
        } else if (avgTime < 15) {
          result += '✅ **성능: 양호**\n';
        } else {
          result += '⚠️ **성능: 개선 필요**\n';
        }
        
      } catch (perfError) {
        result += '❌ 성능 테스트 실패\n';
        result += `오류: ${perfError instanceof Error ? perfError.message : String(perfError)}\n`;
      }
    }
    
    return result;
    
  } catch (error) {
    return result + `❌ 모니터링 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`;
  }
}