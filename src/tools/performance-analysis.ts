import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';

/**
 * 성능 분석 및 최적화 도구
 * 
 * 기능:
 * 1. 쿼리 성능 분석
 * 2. 인덱스 사용률 확인
 * 3. 테이블 통계 수집
 * 4. 느린 쿼리 식별
 */

export interface PerformanceAnalysisArgs {
  analysis_type?: 'query_plan' | 'index_usage' | 'table_stats' | 'slow_queries' | 'all';
  table_name?: string;
  query?: string;
  include_recommendations?: boolean;
}

export const performanceAnalysisTool: Tool = {
  name: 'analyze_performance',
  description: '데이터베이스 성능을 분석하고 최적화 권장사항을 제공합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      analysis_type: {
        type: 'string',
        enum: ['query_plan', 'index_usage', 'table_stats', 'slow_queries', 'all'],
        description: '분석 유형 (기본값: all)',
        default: 'all'
      },
      table_name: {
        type: 'string',
        description: '특정 테이블에 대한 분석 (선택사항)',
        minLength: 1
      },
      query: {
        type: 'string',
        description: '분석할 특정 쿼리 (선택사항)',
        minLength: 1
      },
      include_recommendations: {
        type: 'boolean',
        description: '최적화 권장사항 포함 여부 (기본값: true)',
        default: true
      }
    }
  }
};

export async function handlePerformanceAnalysis(args: PerformanceAnalysisArgs = {}): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      return '❌ 데이터베이스 연결을 사용할 수 없습니다.';
    }

    const analysisType = args.analysis_type || 'all';
    const includeRecommendations = args.include_recommendations !== false;
    let result = '📊 성능 분석 결과\n\n';

    // 1. 쿼리 실행 계획 분석
    if (analysisType === 'query_plan' || analysisType === 'all') {
      result += await analyzeQueryPlans(connection, args.query);
    }

    // 2. 인덱스 사용률 분석
    if (analysisType === 'index_usage' || analysisType === 'all') {
      result += await analyzeIndexUsage(connection, args.table_name);
    }

    // 3. 테이블 통계 분석
    if (analysisType === 'table_stats' || analysisType === 'all') {
      result += await analyzeTableStats(connection, args.table_name);
    }

    // 4. 느린 쿼리 분석 (시뮬레이션)
    if (analysisType === 'slow_queries' || analysisType === 'all') {
      result += await analyzeSlowQueries(connection);
    }

    // 5. 최적화 권장사항
    if (includeRecommendations) {
      result += await generateOptimizationRecommendations(connection);
    }

    return result;

  } catch (error) {
    return `❌ 성능 분석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}

async function analyzeQueryPlans(connection: any, customQuery?: string): Promise<string> {
  let analysis = '## 🔍 쿼리 실행 계획 분석\n\n';

  const testQueries = [
    {
      name: 'High Importance Filter',
      query: 'SELECT * FROM work_memories WHERE importance_score >= 80 ORDER BY importance_score DESC LIMIT 10'
    },
    {
      name: 'Project + Score Filter',
      query: 'SELECT * FROM work_memories WHERE project = "test" AND importance_score BETWEEN 50 AND 90'
    },
    {
      name: 'Text Search + Score',
      query: 'SELECT * FROM work_memories WHERE content LIKE "%important%" ORDER BY importance_score DESC'
    }
  ];

  if (customQuery) {
    testQueries.unshift({ name: 'Custom Query', query: customQuery });
  }

  for (const testQuery of testQueries) {
    try {
      const plan = await connection.all(`EXPLAIN QUERY PLAN ${testQuery.query}`);
      analysis += `### ${testQuery.name}\n`;
      analysis += '```sql\n' + testQuery.query + '\n```\n\n';
      analysis += '**실행 계획:**\n';
      
      plan.forEach((step: any, index: number) => {
        const usesIndex = step.detail.includes('USING INDEX') || step.detail.includes('INDEX');
        const scanType = step.detail.includes('SCAN') ? '🔍 SCAN' : '⚡ INDEX';
        analysis += `${index + 1}. ${scanType} ${step.detail}\n`;
      });
      
      analysis += '\n';
    } catch (error) {
      analysis += `### ${testQuery.name}\n❌ 분석 실패: ${error}\n\n`;
    }
  }

  return analysis;
}

async function analyzeIndexUsage(connection: any, tableName?: string): Promise<string> {
  let analysis = '## 📈 인덱스 사용률 분석\n\n';

  try {
    // 인덱스 목록 조회
    const tables = tableName ? [tableName] : ['work_memories', 'search_keywords', 'project_index'];
    
    for (const table of tables) {
      analysis += `### ${table} 테이블\n`;
      
      const indexes = await connection.all(`
        SELECT name, sql FROM sqlite_master 
        WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_%'
      `, [table]);

      if (indexes.length === 0) {
        analysis += '❌ 사용자 정의 인덱스가 없습니다.\n\n';
        continue;
      }

      analysis += '**인덱스 목록:**\n';
      indexes.forEach((index: any, i: number) => {
        analysis += `${i + 1}. **${index.name}**\n`;
        if (index.sql) {
          analysis += `   - SQL: \`${index.sql}\`\n`;
        }
      });

      // 테이블 정보 조회
      const tableInfo = await connection.get(`
        SELECT COUNT(*) as row_count FROM ${table}
      `);
      
      analysis += `   - **레코드 수**: ${tableInfo.row_count.toLocaleString()}개\n\n`;
    }

    // importance_score 관련 인덱스 특별 분석
    analysis += '### 🎯 importance_score 인덱스 분석\n';
    const importanceIndexes = await connection.all(`
      SELECT name, sql FROM sqlite_master 
      WHERE type = 'index' AND sql LIKE '%importance_score%'
    `);

    if (importanceIndexes.length > 0) {
      analysis += '**importance_score 관련 인덱스:**\n';
      importanceIndexes.forEach((index: any) => {
        analysis += `- ${index.name}: ${index.sql}\n`;
      });
    } else {
      analysis += '❌ importance_score 관련 인덱스가 누락되었습니다.\n';
    }

  } catch (error) {
    analysis += `❌ 인덱스 분석 실패: ${error}\n`;
  }

  return analysis + '\n';
}

async function analyzeTableStats(connection: any, tableName?: string): Promise<string> {
  let analysis = '## 📊 테이블 통계 분석\n\n';

  try {
    const tables = tableName ? [tableName] : ['work_memories', 'search_keywords', 'project_index', 'change_history'];

    for (const table of tables) {
      analysis += `### ${table}\n`;

      // 기본 통계
      const basicStats = await connection.get(`
        SELECT COUNT(*) as total_rows FROM ${table}
      `);

      analysis += `- **총 레코드 수**: ${basicStats.total_rows.toLocaleString()}개\n`;

      // work_memories 테이블 상세 분석
      if (table === 'work_memories') {
        const detailedStats = await connection.get(`
          SELECT 
            AVG(length(content)) as avg_content_length,
            MIN(importance_score) as min_score,
            MAX(importance_score) as max_score,
            AVG(importance_score) as avg_score,
            COUNT(DISTINCT project) as unique_projects,
            COUNT(DISTINCT created_by) as unique_creators
          FROM work_memories
          WHERE is_archived = 0
        `);

        analysis += `- **평균 컨텐츠 길이**: ${Math.round(detailedStats.avg_content_length || 0)}자\n`;
        analysis += `- **중요도 점수**: ${detailedStats.min_score}-${detailedStats.max_score} (평균: ${Math.round(detailedStats.avg_score || 0)})\n`;
        analysis += `- **고유 프로젝트**: ${detailedStats.unique_projects}개\n`;
        analysis += `- **고유 작성자**: ${detailedStats.unique_creators}명\n`;

        // 중요도 분포 분석
        const scoreDistribution = await connection.all(`
          SELECT 
            CASE 
              WHEN importance_score >= 90 THEN '매우높음 (90-100)'
              WHEN importance_score >= 70 THEN '높음 (70-89)'
              WHEN importance_score >= 30 THEN '보통 (30-69)'
              WHEN importance_score >= 10 THEN '낮음 (10-29)'
              ELSE '최소 (0-9)'
            END as score_level,
            COUNT(*) as count,
            ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM work_memories WHERE is_archived = 0), 1) as percentage
          FROM work_memories 
          WHERE is_archived = 0
          GROUP BY score_level
          ORDER BY MIN(importance_score) DESC
        `);

        analysis += '\n**중요도 분포:**\n';
        scoreDistribution.forEach((dist: any) => {
          analysis += `- ${dist.score_level}: ${dist.count}개 (${dist.percentage}%)\n`;
        });
      }

      analysis += '\n';
    }

    // 데이터베이스 파일 크기 분석
    const dbStats = await connection.all('PRAGMA database_list');
    analysis += '### 💾 데이터베이스 파일 정보\n';
    dbStats.forEach((db: any) => {
      analysis += `- **${db.name}**: ${db.file || 'memory'}\n`;
    });

  } catch (error) {
    analysis += `❌ 테이블 통계 분석 실패: ${error}\n`;
  }

  return analysis + '\n';
}

async function analyzeSlowQueries(connection: any): Promise<string> {
  let analysis = '## ⏱️ 성능 테스트\n\n';

  const performanceTests = [
    {
      name: '고중요도 필터링',
      query: 'SELECT COUNT(*) FROM work_memories WHERE importance_score >= 80',
      expected_ms: 50
    },
    {
      name: '점수 범위 검색',
      query: 'SELECT COUNT(*) FROM work_memories WHERE importance_score BETWEEN 30 AND 70',
      expected_ms: 50
    },
    {
      name: '프로젝트별 평균 점수',
      query: 'SELECT project, AVG(importance_score) FROM work_memories WHERE project IS NOT NULL GROUP BY project',
      expected_ms: 100
    },
    {
      name: '복합 인덱스 활용',
      query: 'SELECT * FROM work_memories WHERE importance_score >= 70 AND is_archived = 0 ORDER BY created_at DESC LIMIT 10',
      expected_ms: 100
    }
  ];

  analysis += '**쿼리 성능 테스트 결과:**\n\n';

  for (const test of performanceTests) {
    const startTime = Date.now();
    try {
      await connection.all(test.query);
      const executionTime = Date.now() - startTime;
      
      const status = executionTime <= test.expected_ms ? '✅' : '⚠️';
      const performance = executionTime <= test.expected_ms ? '우수' : '개선필요';
      
      analysis += `${status} **${test.name}**: ${executionTime}ms (${performance})\n`;
      analysis += `   - 기준: ${test.expected_ms}ms 이내\n`;
      analysis += `   - 쿼리: \`${test.query}\`\n\n`;
      
    } catch (error) {
      analysis += `❌ **${test.name}**: 실행 실패 - ${error}\n\n`;
    }
  }

  return analysis;
}

async function generateOptimizationRecommendations(connection: any): Promise<string> {
  let recommendations = '## 🚀 최적화 권장사항\n\n';

  try {
    // 1. 인덱스 분석 기반 권장사항
    const tableCount = await connection.get(`
      SELECT COUNT(*) as count FROM work_memories WHERE is_archived = 0
    `);

    recommendations += '### 1. 인덱스 최적화\n';
    
    if (tableCount.count > 1000) {
      recommendations += '- ✅ **복합 인덱스 활용**: 대용량 데이터에 적합한 인덱스 구성\n';
      recommendations += '- 🎯 **중요도 + 날짜 복합 인덱스**: 자주 사용되는 쿼리 패턴 최적화\n';
    } else {
      recommendations += '- ✅ **현재 인덱스 구성 적절**: 데이터 규모에 맞는 인덱스\n';
    }

    // 2. 쿼리 최적화 권장사항
    recommendations += '\n### 2. 쿼리 최적화\n';
    recommendations += '- ✅ **LIMIT 절 활용**: 대량 결과 조회 시 페이징 구현\n';
    recommendations += '- ✅ **WHERE 절 최적화**: importance_score 범위 조건 우선 배치\n';
    recommendations += '- ✅ **정렬 최적화**: 인덱스 순서와 ORDER BY 일치\n';

    // 3. 메모리 최적화 권장사항
    recommendations += '\n### 3. 메모리 및 저장공간 최적화\n';
    recommendations += '- ✅ **PRAGMA 설정 최적화**: WAL 모드, 캐시 크기 조정\n';
    recommendations += '- ✅ **정기적인 VACUUM**: 삭제된 데이터 공간 회수\n';
    recommendations += '- ✅ **아카이브 정책**: 오래된 데이터 자동 아카이브\n';

    // 4. 응용 프로그램 수준 최적화
    recommendations += '\n### 4. 응용 프로그램 최적화\n';
    recommendations += '- ✅ **배치 작업**: 여러 INSERT를 트랜잭션으로 묶기\n';
    recommendations += '- ✅ **캐싱 전략**: 자주 조회되는 통계 정보 캐싱\n';
    recommendations += '- ✅ **연결 풀링**: 데이터베이스 연결 재사용\n';

    // 5. 모니터링 권장사항
    recommendations += '\n### 5. 성능 모니터링\n';
    recommendations += '- 📊 **정기적인 성능 분석**: 주간 성능 리포트 생성\n';
    recommendations += '- 📈 **메트릭 추적**: 쿼리 실행 시간, 처리량 모니터링\n';
    recommendations += '- 🔍 **느린 쿼리 로깅**: 임계값 초과 쿼리 자동 감지\n';

    // 현재 설정 확인
    const pragmaSettings = await connection.all('PRAGMA compile_options');
    recommendations += '\n### 💡 현재 SQLite 설정\n';
    
    const relevantSettings = pragmaSettings.filter((setting: any) => 
      setting.compile_options.includes('THREADSAFE') ||
      setting.compile_options.includes('MAX_') ||
      setting.compile_options.includes('DEFAULT_')
    );

    if (relevantSettings.length > 0) {
      relevantSettings.forEach((setting: any) => {
        recommendations += `- ${setting.compile_options}\n`;
      });
    } else {
      recommendations += '- 기본 SQLite 설정 사용 중\n';
    }

  } catch (error) {
    recommendations += `❌ 권장사항 생성 실패: ${error}\n`;
  }

  return recommendations;
}
