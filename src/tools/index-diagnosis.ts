import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';
import { SearchManager } from '../utils/search-manager.js';

export interface IndexDiagnosisArgs {
  fix_issues?: boolean;
  rebuild_index?: boolean;
  verbose?: boolean;
}

export const indexDiagnosisTool: Tool = {
  name: 'index_diagnosis',
  description: '인덱싱 문제를 진단하고 해결합니다. 실제 메모리 vs 인덱싱된 메모리 불일치 문제 분석',
  inputSchema: {
    type: 'object',
    properties: {
      fix_issues: {
        type: 'boolean',
        description: '발견된 문제를 자동으로 수정',
        default: false
      },
      rebuild_index: {
        type: 'boolean', 
        description: '인덱스를 완전히 재구성',
        default: false
      },
      verbose: {
        type: 'boolean',
        description: '상세 정보 출력',
        default: true
      }
    }
  }
};

export async function handleIndexDiagnosis(args: IndexDiagnosisArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    let result = '🔍 **인덱스 진단 시작**\n\n';

    // 1. 기본 통계 수집
    const memoryStats = await connection.get(`
      SELECT 
        COUNT(*) as total_memories,
        COUNT(CASE WHEN is_archived = 0 THEN 1 END) as active_memories,
        COUNT(CASE WHEN is_archived = 1 THEN 1 END) as archived_memories
      FROM work_memories
    `);

    const keywordStats = await connection.get(`
      SELECT 
        COUNT(DISTINCT memory_id) as indexed_memories,
        COUNT(DISTINCT keyword) as unique_keywords,
        COUNT(*) as total_keyword_entries
      FROM search_keywords
    `);

    result += '📊 **기본 통계:**\n';
    result += `- 전체 메모리: ${memoryStats.total_memories}개\n`;
    result += `- 활성 메모리: ${memoryStats.active_memories}개\n`;
    result += `- 아카이브 메모리: ${memoryStats.archived_memories}개\n`;
    result += `- 인덱싱된 메모리: ${keywordStats.indexed_memories}개\n`;
    result += `- 고유 키워드: ${keywordStats.unique_keywords}개\n`;
    result += `- 총 키워드 엔트리: ${keywordStats.total_keyword_entries}개\n\n`;

    // 2. 커버리지 계산
    const coverage = memoryStats.active_memories > 0 
      ? (keywordStats.indexed_memories / memoryStats.active_memories * 100).toFixed(1)
      : 0;
    
    result += '📈 **인덱스 커버리지:**\n';
    result += `- 현재 커버리지: ${coverage}%\n`;
    
    if (parseFloat(coverage as string) < 100) {
      result += `⚠️ **문제 발견**: ${memoryStats.active_memories - keywordStats.indexed_memories}개 메모리가 인덱싱되지 않음\n`;
    } else {
      result += `✅ 모든 활성 메모리가 인덱싱됨\n`;
    }
    result += '\n';

    // 3. 누락된 메모리 식별
    const missingMemories = await connection.all(`
      SELECT wm.id, wm.content, wm.project, wm.created_at, wm.tags
      FROM work_memories wm
      LEFT JOIN search_keywords sk ON wm.id = sk.memory_id
      WHERE wm.is_archived = 0 AND sk.memory_id IS NULL
      ORDER BY wm.created_at DESC
    `);

    if (missingMemories.length > 0) {
      result += '❌ **인덱싱 누락 메모리:**\n';
      missingMemories.forEach((memory, index) => {
        const preview = memory.content.substring(0, 50) + (memory.content.length > 50 ? '...' : '');
        result += `${index + 1}. ID: ${memory.id}\n`;
        result += `   내용: "${preview}"\n`;
        result += `   프로젝트: ${memory.project || 'N/A'}\n`;
        result += `   생성일: ${memory.created_at}\n`;
        if (args.verbose) {
          result += `   태그: ${memory.tags || '[]'}\n`;
        }
        result += '\n';
      });
    }

    // 4. 고아 키워드 확인
    const orphanKeywords = await connection.all(`
      SELECT sk.memory_id, sk.keyword, sk.source
      FROM search_keywords sk
      LEFT JOIN work_memories wm ON sk.memory_id = wm.id
      WHERE wm.id IS NULL OR wm.is_archived = 1
      LIMIT 10
    `);

    if (orphanKeywords.length > 0) {
      result += '🗑️ **고아 키워드 (참조 메모리 없음):**\n';
      orphanKeywords.forEach((orphan, index) => {
        result += `${index + 1}. 메모리ID: ${orphan.memory_id}, 키워드: "${orphan.keyword}", 소스: ${orphan.source}\n`;
      });
      result += '\n';
    }

    // 5. 중복 키워드 확인
    const duplicateKeywords = await connection.all(`
      SELECT memory_id, keyword, COUNT(*) as count
      FROM search_keywords
      GROUP BY memory_id, keyword
      HAVING count > 1
      LIMIT 5
    `);

    if (duplicateKeywords.length > 0) {
      result += '🔄 **중복 키워드:**\n';
      duplicateKeywords.forEach((dup, index) => {
        result += `${index + 1}. 메모리ID: ${dup.memory_id}, 키워드: "${dup.keyword}", 중복수: ${dup.count}\n`;
      });
      result += '\n';
    }

    // 6. 문제 해결
    if (args.fix_issues || args.rebuild_index) {
      result += '🔧 **문제 해결 시작...**\n';
      
      const searchManager = new SearchManager();
      
      if (args.rebuild_index) {
        result += '- 전체 인덱스 재구성 중...\n';
        await searchManager.rebuildIndex();
        result += '✅ 인덱스 재구성 완료\n';
      } else if (args.fix_issues) {
        // 누락된 메모리만 인덱싱
        result += `- ${missingMemories.length}개 누락 메모리 인덱싱 중...\n`;
        for (const memory of missingMemories) {
          const workMemory = {
            id: memory.id,
            content: memory.content,
            tags: JSON.parse(memory.tags || '[]'),
            project: memory.project,
            importance_score: 50, // 기본값
            created_at: memory.created_at,
            updated_at: memory.created_at,
            created_by: 'system',
            access_count: 0
          };
          await searchManager.addToSearchIndex(workMemory);
        }
        result += '✅ 누락 메모리 인덱싱 완료\n';
        
        // 고아 키워드 정리
        if (orphanKeywords.length > 0) {
          result += '- 고아 키워드 정리 중...\n';
          await connection.run(`
            DELETE FROM search_keywords 
            WHERE memory_id NOT IN (
              SELECT id FROM work_memories WHERE is_archived = 0
            )
          `);
          result += '✅ 고아 키워드 정리 완료\n';
        }
      }
      
      // 최종 상태 확인
      const finalStats = await connection.get(`
        SELECT 
          COUNT(DISTINCT memory_id) as indexed_memories
        FROM search_keywords
      `);
      
      const finalCoverage = memoryStats.active_memories > 0 
        ? (finalStats.indexed_memories / memoryStats.active_memories * 100).toFixed(1)
        : 0;
      
      result += `\n📊 **수정 후 상태:**\n`;
      result += `- 인덱싱된 메모리: ${finalStats.indexed_memories}개\n`;
      result += `- 최종 커버리지: ${finalCoverage}%\n`;
    }

    // 7. 권장사항
    result += '\n💡 **권장사항:**\n';
    if (parseFloat(coverage as string) < 100) {
      result += '- `fix_issues=true`로 누락된 메모리 인덱싱 수행\n';
    }
    if (orphanKeywords.length > 0) {
      result += '- 고아 키워드 정리 필요\n';
    }
    if (duplicateKeywords.length > 0) {
      result += '- 중복 키워드 정리 필요\n';
    }
    if (parseFloat(coverage as string) < 50) {
      result += '- `rebuild_index=true`로 전체 인덱스 재구성 권장\n';
    }

    return result;

  } catch (error) {
    return `❌ 인덱스 진단 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}