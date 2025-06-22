import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';

export const optimizeDatabaseTool: Tool = {
  name: 'optimize_database',
  description: '데이터베이스를 최적화하고 인덱스 커버리지를 분석합니다. VACUUM, ANALYZE, 인덱스 최적화 포함',
  inputSchema: {
    type: 'object',
    properties: {
      vacuum_type: {
        type: 'string',
        enum: ['full', 'incremental'],
        description: 'VACUUM 유형 (기본: incremental)',
        default: 'incremental'
      },
      analyze: {
        type: 'boolean',
        description: 'ANALYZE 실행 여부 (기본: true)',
        default: true
      },
      index_analysis: {
        type: 'boolean',
        description: '인덱스 커버리지 분석 수행 (기본: true)',
        default: true
      },
      performance_report: {
        type: 'boolean',
        description: '성능 리포트 생성 (기본: true)',
        default: true
      }
    }
  }
};

export interface OptimizeOptions {
  vacuum_type?: 'full' | 'incremental';
  analyze?: boolean;
  index_analysis?: boolean;
  performance_report?: boolean;
}

export async function handleOptimizeDatabase(dbPath: string, options: OptimizeOptions = {}): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    const {
      vacuum_type = 'incremental',
      analyze = true,
      index_analysis = true,
      performance_report = true
    } = options;

    let result = '🔧 **데이터베이스 최적화 시작**\n\n';

    // 1. 초기 상태 분석
    const initialSize = await getFileSize(dbPath);
    const initialStats = await getDatabaseStats(connection);
    
    result += `📊 **초기 상태:**\n`;
    result += `- 파일 크기: ${formatBytes(initialSize)}\n`;
    result += `- 총 메모리: ${initialStats.total_memories}개\n`;
    result += `- 활성 메모리: ${initialStats.active_memories}개\n`;
    result += `- 아카이브: ${initialStats.archived_memories}개\n\n`;

    // 2. 인덱스 커버리지 분석
    if (index_analysis) {
      result += await analyzeIndexCoverage(connection);
    }

    // 3. WAL 체크포인트
    const walResult = await connection.get('PRAGMA wal_checkpoint(TRUNCATE)');
    result += `📝 **WAL 체크포인트:** ${walResult.busy === 0 ? '✅ 완료' : '⚠️ 진행중'}\n\n`;

    // 4. VACUUM 실행
    const vacuumStart = Date.now();
    if (vacuum_type === 'full') {
      await connection.run('VACUUM;');
      result += `🧹 **VACUUM 완료** (전체, ${Date.now() - vacuumStart}ms)\n`;
    } else {
      await connection.run('PRAGMA incremental_vacuum;');
      result += `🧹 **증분 VACUUM 완료** (${Date.now() - vacuumStart}ms)\n`;
    }

    // 5. ANALYZE 실행
    if (analyze) {
      const analyzeStart = Date.now();
      await connection.run('ANALYZE;');
      result += `📈 **ANALYZE 완료** (${Date.now() - analyzeStart}ms)\n\n`;
    }

    // 6. 최종 상태 분석
    const finalSize = await getFileSize(dbPath);
    const finalStats = await getDatabaseStats(connection);
    
    const reduction = initialSize - finalSize;
    const reductionPercent = initialSize > 0 ? (reduction / initialSize * 100).toFixed(2) : 0;

    result += `✅ **최적화 완료:**\n`;
    result += `- 파일 크기: ${formatBytes(initialSize)} → ${formatBytes(finalSize)}\n`;
    result += `- 공간 회수: ${formatBytes(reduction)} (${reductionPercent}%)\n`;
    result += `- 처리 시간: ${Date.now() - vacuumStart}ms\n\n`;

    // 7. 성능 리포트
    if (performance_report) {
      result += await generatePerformanceReport(connection);
    }

    // 8. 권장사항
    result += await generateOptimizationRecommendations(connection, initialStats, finalStats);

    return result;

  } catch (error) {
    return `❌ 데이터베이스 최적화 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}

// 파일 크기를 가져오는 헬퍼 함수
async function getFileSize(filePath: string): Promise<number> {
  try {
    const fs = await import('fs/promises');
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    return 0; // 파일이 없거나 오류 발생 시 0 반환
  }
}

// 데이터베이스 통계 조회
async function getDatabaseStats(connection: any): Promise<{
  total_memories: number;
  active_memories: number;
  archived_memories: number;
  total_keywords: number;
  total_projects: number;
  total_sessions: number;
}> {
  const [memories, keywords, projects, sessions] = await Promise.all([
    connection.get(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_archived = 0 THEN 1 END) as active,
        COUNT(CASE WHEN is_archived = 1 THEN 1 END) as archived
      FROM work_memories
    `),
    connection.get('SELECT COUNT(*) as count FROM search_keywords'),
    connection.get('SELECT COUNT(*) as count FROM project_index'),
    connection.get('SELECT COUNT(*) as count FROM work_sessions')
  ]);

  return {
    total_memories: memories.total || 0,
    active_memories: memories.active || 0,
    archived_memories: memories.archived || 0,
    total_keywords: keywords.count || 0,
    total_projects: projects.count || 0,
    total_sessions: sessions.count || 0
  };
}

// 인덱스 커버리지 분석
async function analyzeIndexCoverage(connection: any): Promise<string> {
  let result = '📈 **인덱스 커버리지 분석:**\n';
  
  try {
    // 모든 인덱스 조회
    const indexes = await connection.all(`
      SELECT name, tbl_name, sql 
      FROM sqlite_master 
      WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      ORDER BY tbl_name, name
    `);

    // 테이블별 인덱스 분석
    const tableIndexes = {};
    indexes.forEach(idx => {
      if (!tableIndexes[idx.tbl_name]) {
        tableIndexes[idx.tbl_name] = [];
      }
      tableIndexes[idx.tbl_name].push(idx.name);
    });

    // 주요 테이블 인덱스 커버리지 계산
    const expectedIndexes = {
      'work_memories': [
        'idx_work_memories_project',
        'idx_work_memories_importance_score',
        'idx_work_memories_is_archived',
        'idx_work_memories_archived_at',
        'idx_work_memories_work_type',
        'idx_work_memories_worked',
        'idx_work_memories_session_id',
        'idx_work_memories_created_at'
      ],
      'search_keywords': [
        'idx_search_keywords_memory_id',
        'idx_search_keywords_keyword',
        'idx_search_keywords_weight'
      ],
      'project_index': [
        'idx_project_index_normalized',
        'idx_project_index_memory_count'
      ]
    };

    let totalExpected = 0;
    let totalFound = 0;

    for (const [table, expected] of Object.entries(expectedIndexes)) {
      const found = tableIndexes[table] || [];
      const coverage = (found.length / expected.length * 100).toFixed(1);
      
      result += `- ${table}: ${found.length}/${expected.length} (${coverage}%)\n`;
      
      totalExpected += expected.length;
      totalFound += found.length;

      // 누락된 인덱스 확인
      const missing = expected.filter(idx => !found.includes(idx));
      if (missing.length > 0) {
        result += `  ⚠️ 누락: ${missing.join(', ')}\n`;
      }
    }

    const overallCoverage = (totalFound / totalExpected * 100).toFixed(1);
    result += `\n**전체 커버리지: ${totalFound}/${totalExpected} (${overallCoverage}%)**\n`;

    // 권장사항
    if (parseFloat(overallCoverage) < 100) {
      result += `⚠️ 인덱스 커버리지 개선 필요\n`;
    } else {
      result += `✅ 인덱스 커버리지 완료\n`;
    }

  } catch (error) {
    result += `❌ 인뀁스 분석 오류: ${error instanceof Error ? error.message : String(error)}\n`;
  }

  return result + '\n';
}

// 성능 리포트 생성
async function generatePerformanceReport(connection: any): Promise<string> {
  let result = '⚡ **성능 리포트:**\n';

  try {
    // 쿼리 성능 테스트
    const tests = [
      {
        name: '단순 메모리 조회',
        query: 'SELECT COUNT(*) FROM work_memories WHERE is_archived = 0'
      },
      {
        name: '프로젝트별 조회',
        query: 'SELECT project, COUNT(*) FROM work_memories GROUP BY project LIMIT 5'
      },
      {
        name: '중요도 정렬 조회',
        query: 'SELECT id, importance_score FROM work_memories ORDER BY importance_score DESC LIMIT 10'
      },
      {
        name: '복합 인덱스 조회',
        query: 'SELECT * FROM work_memories WHERE is_archived = 0 AND importance_score > 70 LIMIT 5'
      },
      {
        name: '키워드 검색',
        query: 'SELECT DISTINCT keyword FROM search_keywords ORDER BY weight DESC LIMIT 10'
      }
    ];

    for (const test of tests) {
      const start = Date.now();
      await connection.get(test.query);
      const duration = Date.now() - start;
      
      let status = '🚀';
      if (duration > 50) status = '🐌';
      else if (duration > 20) status = '⚠️';
      else if (duration > 10) status = '✅';
      
      result += `${status} ${test.name}: ${duration}ms\n`;
    }

    // 데이터베이스 설정 확인
    const settings = await Promise.all([
      connection.get('PRAGMA cache_size'),
      connection.get('PRAGMA journal_mode'),
      connection.get('PRAGMA synchronous'),
      connection.get('PRAGMA temp_store')
    ]);

    result += `\n📋 **DB 설정:**\n`;
    result += `- Cache: ${Math.abs(settings[0].cache_size)} pages\n`;
    result += `- Journal: ${settings[1].journal_mode}\n`;
    result += `- Sync: ${settings[2].synchronous}\n`;
    result += `- Temp: ${settings[3].temp_store}\n`;

  } catch (error) {
    result += `❌ 성능 테스트 오류: ${error instanceof Error ? error.message : String(error)}\n`;
  }

  return result + '\n';
}

// 최적화 권장사항 생성
async function generateOptimizationRecommendations(
  connection: any, 
  initialStats: any, 
  finalStats: any
): Promise<string> {
  let result = '💡 **최적화 권장사항:**\n';

  try {
    // 아카이브 비율 확인
    const archiveRatio = finalStats.total_memories > 0 
      ? (finalStats.archived_memories / finalStats.total_memories * 100).toFixed(1)
      : 0;

    if (typeof archiveRatio === 'string' && parseFloat(archiveRatio) > 30) {
      result += `- 📦 아카이브 비율이 높음 (${archiveRatio}%) → 오래된 아카이브 정리 권장\n`;
    }

    // 프로젝트 수 확인
    if (finalStats.total_projects > 100) {
      result += `- 📁 프로젝트 수가 많음 (${finalStats.total_projects}개) → 비활성 프로젝트 정리 권장\n`;
    }

    // 키워드 밀도 확인
    const keywordDensity = finalStats.total_memories > 0 
      ? (finalStats.total_keywords / finalStats.total_memories).toFixed(1)
      : 0;

    if (typeof keywordDensity === 'string' && parseFloat(keywordDensity) < 3) {
      result += `- 🔍 키워드 밀도 낮음 (${keywordDensity}/메모리) → 키워드 추가 권장\n`;
    }

    // 정기 최적화 권장
    result += `- ⏰ 정기 최적화 권장: 주 1회 VACUUM, 일 1회 ANALYZE\n`;
    result += `- 🔄 자동 아카이브 활성화로 공간 효율성 향상\n`;

    if (result === '💡 **최적화 권장사항:**\n') {
      result += '✅ 현재 최적 상태입니다!\n';
    }

  } catch (error) {
    result += `❌ 권장사항 생성 오류: ${error instanceof Error ? error.message : String(error)}\n`;
  }

  return result;
}

// 바이트를 읽기 쉬운 형식으로 변환하는 헬퍼 함수
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
} 