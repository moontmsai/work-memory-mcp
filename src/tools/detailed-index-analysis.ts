import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';

export interface DetailedIndexAnalysisArgs {
  show_missing?: boolean;
  show_indexed?: boolean;
  analyze_patterns?: boolean;
}

export const detailedIndexAnalysisTool: Tool = {
  name: 'detailed_index_analysis',
  description: '인덱싱 누락 메모리를 상세 분석하여 근본 원인을 찾습니다',
  inputSchema: {
    type: 'object',
    properties: {
      show_missing: {
        type: 'boolean',
        description: '누락된 메모리 상세 표시',
        default: true
      },
      show_indexed: {
        type: 'boolean',
        description: '인덱싱된 메모리 표시',
        default: false
      },
      analyze_patterns: {
        type: 'boolean',
        description: '패턴 분석 수행',
        default: true
      }
    }
  }
};

export async function handleDetailedIndexAnalysis(args: DetailedIndexAnalysisArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    let result = '🔍 **상세 인덱스 분석**\n\n';

    // 1. 전체 통계
    const totalMemories = await connection.get(`
      SELECT COUNT(*) as count FROM work_memories WHERE is_archived = 0
    `);
    
    const indexedMemories = await connection.get(`
      SELECT COUNT(DISTINCT memory_id) as count FROM search_keywords
    `);

    const coverage = totalMemories.count > 0 
      ? (indexedMemories.count / totalMemories.count * 100).toFixed(1)
      : 0;

    result += `📊 **기본 통계:**\n`;
    result += `- 총 활성 메모리: ${totalMemories.count}개\n`;
    result += `- 인덱싱된 메모리: ${indexedMemories.count}개\n`;
    result += `- 커버리지: ${coverage}%\n`;
    result += `- 누락된 메모리: ${totalMemories.count - indexedMemories.count}개\n\n`;

    // 2. 누락된 메모리 상세 분석
    if (args.show_missing !== false) {
      const missingMemories = await connection.all(`
        SELECT 
          wm.id,
          wm.content,
          wm.project,
          wm.tags,
          wm.created_at,
          wm.created_by,
          wm.work_type,
          wm.importance_score,
          wm.session_id,
          LENGTH(wm.content) as content_length
        FROM work_memories wm
        LEFT JOIN search_keywords sk ON wm.id = sk.memory_id
        WHERE wm.is_archived = 0 AND sk.memory_id IS NULL
        ORDER BY wm.created_at DESC
      `);

      if (missingMemories.length > 0) {
        result += `❌ **인덱싱 누락 메모리 (${missingMemories.length}개):**\n`;
        
        missingMemories.forEach((memory, index) => {
          const preview = memory.content.substring(0, 60) + (memory.content.length > 60 ? '...' : '');
          result += `\n${index + 1}. **ID**: ${memory.id}\n`;
          result += `   **내용**: "${preview}"\n`;
          result += `   **프로젝트**: ${memory.project || 'N/A'}\n`;
          result += `   **생성자**: ${memory.created_by || 'unknown'}\n`;
          result += `   **생성일**: ${memory.created_at}\n`;
          result += `   **작업유형**: ${memory.work_type || 'memory'}\n`;
          result += `   **중요도**: ${memory.importance_score || 50}\n`;
          result += `   **세션ID**: ${memory.session_id || 'N/A'}\n`;
          result += `   **컨텐츠 길이**: ${memory.content_length}자\n`;
          
          // 태그 분석
          let tags = [];
          try {
            if (memory.tags) {
              tags = JSON.parse(memory.tags);
            }
          } catch (e) {
            tags = [];
          }
          result += `   **태그**: ${tags.length > 0 ? tags.join(', ') : 'N/A'}\n`;
        });
        result += '\n';
      }
    }

    // 3. 인덱싱된 메모리 분석 (패턴 찾기용)
    if (args.show_indexed) {
      const indexedMemoriesDetail = await connection.all(`
        SELECT DISTINCT
          wm.id,
          wm.created_by,
          wm.work_type,
          wm.created_at,
          wm.project,
          COUNT(sk.keyword) as keyword_count
        FROM work_memories wm
        JOIN search_keywords sk ON wm.id = sk.memory_id
        WHERE wm.is_archived = 0
        GROUP BY wm.id
        ORDER BY wm.created_at DESC
        LIMIT 10
      `);

      if (indexedMemoriesDetail.length > 0) {
        result += `✅ **인덱싱된 메모리 샘플 (최근 10개):**\n`;
        indexedMemoriesDetail.forEach((memory, index) => {
          result += `${index + 1}. ID: ${memory.id}, 생성자: ${memory.created_by}, 키워드: ${memory.keyword_count}개\n`;
        });
        result += '\n';
      }
    }

    // 4. 패턴 분석
    if (args.analyze_patterns !== false) {
      result += `🔍 **패턴 분석:**\n`;

      // 생성자별 분석
      const creatorAnalysis = await connection.all(`
        SELECT 
          wm.created_by,
          COUNT(wm.id) as total_memories,
          COUNT(sk.memory_id) as indexed_memories,
          ROUND(CAST(COUNT(sk.memory_id) AS FLOAT) / COUNT(wm.id) * 100, 1) as coverage_percent
        FROM work_memories wm
        LEFT JOIN search_keywords sk ON wm.id = sk.memory_id
        WHERE wm.is_archived = 0
        GROUP BY wm.created_by
        ORDER BY total_memories DESC
      `);

      result += `\n**생성자별 인덱싱 현황:**\n`;
      creatorAnalysis.forEach(creator => {
        result += `- ${creator.created_by || 'unknown'}: ${creator.indexed_memories}/${creator.total_memories} (${creator.coverage_percent}%)\n`;
      });

      // 작업 유형별 분석
      const workTypeAnalysis = await connection.all(`
        SELECT 
          COALESCE(wm.work_type, 'memory') as work_type,
          COUNT(wm.id) as total_memories,
          COUNT(sk.memory_id) as indexed_memories,
          ROUND(CAST(COUNT(sk.memory_id) AS FLOAT) / COUNT(wm.id) * 100, 1) as coverage_percent
        FROM work_memories wm
        LEFT JOIN search_keywords sk ON wm.id = sk.memory_id
        WHERE wm.is_archived = 0
        GROUP BY COALESCE(wm.work_type, 'memory')
        ORDER BY total_memories DESC
      `);

      result += `\n**작업 유형별 인덱싱 현황:**\n`;
      workTypeAnalysis.forEach(type => {
        result += `- ${type.work_type}: ${type.indexed_memories}/${type.total_memories} (${type.coverage_percent}%)\n`;
      });

      // 날짜별 분석 (최근 생성된 것들의 인덱싱 현황)
      const dateAnalysis = await connection.all(`
        SELECT 
          DATE(wm.created_at) as creation_date,
          COUNT(wm.id) as total_memories,
          COUNT(sk.memory_id) as indexed_memories,
          ROUND(CAST(COUNT(sk.memory_id) AS FLOAT) / COUNT(wm.id) * 100, 1) as coverage_percent
        FROM work_memories wm
        LEFT JOIN search_keywords sk ON wm.id = sk.memory_id
        WHERE wm.is_archived = 0
        GROUP BY DATE(wm.created_at)
        ORDER BY creation_date DESC
        LIMIT 7
      `);

      result += `\n**최근 7일 생성일별 인덱싱 현황:**\n`;
      dateAnalysis.forEach(date => {
        result += `- ${date.creation_date}: ${date.indexed_memories}/${date.total_memories} (${date.coverage_percent}%)\n`;
      });

      // 컨텐츠 길이별 분석
      const lengthAnalysis = await connection.all(`
        SELECT 
          CASE 
            WHEN LENGTH(wm.content) < 50 THEN '매우짧음(<50자)'
            WHEN LENGTH(wm.content) < 200 THEN '짧음(50-200자)'
            WHEN LENGTH(wm.content) < 1000 THEN '보통(200-1000자)'
            ELSE '긴편(1000자+)'
          END as content_length_category,
          COUNT(wm.id) as total_memories,
          COUNT(sk.memory_id) as indexed_memories,
          ROUND(CAST(COUNT(sk.memory_id) AS FLOAT) / COUNT(wm.id) * 100, 1) as coverage_percent
        FROM work_memories wm
        LEFT JOIN search_keywords sk ON wm.id = sk.memory_id
        WHERE wm.is_archived = 0
        GROUP BY content_length_category
        ORDER BY total_memories DESC
      `);

      result += `\n**컨텐츠 길이별 인덱싱 현황:**\n`;
      lengthAnalysis.forEach(length => {
        result += `- ${length.content_length_category}: ${length.indexed_memories}/${length.total_memories} (${length.coverage_percent}%)\n`;
      });
    }

    // 5. 권장사항
    result += `\n💡 **분석 결과 및 권장사항:**\n`;

    const missingCount = totalMemories.count - indexedMemories.count;
    if (missingCount > 0) {
      result += `- ⚠️ ${missingCount}개 메모리가 인덱싱되지 않음\n`;
      result += `- 🔧 'diagnose' 작업으로 fix_issues=true 실행 권장\n`;
      
      // 패턴 기반 권장사항
      if (missingCount > totalMemories.count * 0.3) {
        result += `- 🔄 rebuild_index=true로 전체 재구성 권장\n`;
      }
    } else {
      result += `- ✅ 모든 메모리가 정상적으로 인덱싱됨\n`;
    }

    return result;

  } catch (error) {
    return `❌ 상세 인덱스 분석 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}