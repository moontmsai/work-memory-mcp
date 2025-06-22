import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';
import { SearchManager } from '../utils/search-manager.js';

export interface IndexRepairArgs {
  repair_missing?: boolean;
  force_rebuild?: boolean;
}

export const indexRepairTool: Tool = {
  name: 'index_repair',
  description: '누락된 인덱스를 수동으로 복구하고 인덱싱 프로세스를 검증합니다',
  inputSchema: {
    type: 'object',
    properties: {
      repair_missing: {
        type: 'boolean',
        description: '누락된 인덱스를 실제로 복구',
        default: true
      },
      force_rebuild: {
        type: 'boolean',
        description: '모든 인덱스를 강제로 재구성',
        default: false
      }
    }
  }
};

export async function handleIndexRepair(args: IndexRepairArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    let result = '🔧 **인덱스 복구 시작**\n\n';

    // 1. 현재 상태 확인
    const totalMemories = await connection.get(`
      SELECT COUNT(*) as count FROM work_memories WHERE is_archived = 0
    `);
    
    const indexedMemories = await connection.get(`
      SELECT COUNT(DISTINCT memory_id) as count FROM search_keywords
    `);

    const missingCount = totalMemories.count - indexedMemories.count;
    
    result += `📊 **현재 상태:**\n`;
    result += `- 총 활성 메모리: ${totalMemories.count}개\n`;
    result += `- 인덱싱된 메모리: ${indexedMemories.count}개\n`;
    result += `- 누락된 메모리: ${missingCount}개\n\n`;

    if (args.force_rebuild) {
      result += '🔄 **전체 인덱스 재구성 시작...**\n';
      
        const searchManager = new SearchManager();
        
        try {
          // 전체 재구성
          await searchManager.rebuildIndex();
          result += '✅ 전체 인덱스 재구성 완료\n';
          
          // 최종 상태 확인
          const finalIndexed = await connection.get(`
            SELECT COUNT(DISTINCT memory_id) as count FROM search_keywords
          `);
          result += `📊 재구성 후: ${finalIndexed.count}/${totalMemories.count}개 인덱싱\n`;
          
        } catch (rebuildError) {
          result += `❌ 전체 재구성 실패: ${rebuildError instanceof Error ? rebuildError.message : String(rebuildError)}\n`;
        }
      
      return result;
    }

    if (missingCount === 0) {
      result += '✅ 모든 메모리가 이미 인덱싱되어 있습니다.\n';
      return result;
    }

    // 2. 누락된 메모리 목록 조회
    const missingMemories = await connection.all(`
      SELECT 
        wm.id,
        wm.content,
        wm.project,
        wm.tags,
        wm.created_at,
        wm.created_by,
        wm.work_type,
        wm.importance_score
      FROM work_memories wm
      LEFT JOIN search_keywords sk ON wm.id = sk.memory_id
      WHERE wm.is_archived = 0 AND sk.memory_id IS NULL
      ORDER BY wm.created_at DESC
    `);

    result += `❌ **누락된 메모리 발견: ${missingMemories.length}개**\n\n`;

    if (args.repair_missing) {
      result += '🔧 **인덱스 복구 시작...**\n';
      
      const searchManager = new SearchManager();
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const [index, memory] of missingMemories.entries()) {
        try {
          // 태그 파싱
          let tags: string[] = [];
          try {
            if (memory.tags) {
              tags = JSON.parse(memory.tags);
            }
          } catch (tagError) {
            tags = [];
          }

          // WorkMemory 객체 생성
          const workMemory = {
            id: memory.id,
            content: memory.content,
            tags,
            project: memory.project,
            importance_score: memory.importance_score || 50,
            created_at: memory.created_at,
            updated_at: memory.created_at,
            created_by: memory.created_by || 'unknown',
            access_count: 0
          };

          // 인덱싱 수행
          await searchManager.addToSearchIndex(workMemory);
          successCount++;
          
          result += `✅ ${index + 1}/${missingMemories.length}: ${memory.id} 인덱싱 완료\n`;

        } catch (indexError) {
          errorCount++;
          const errorMsg = indexError instanceof Error ? indexError.message : String(indexError);
          errors.push(`${memory.id}: ${errorMsg}`);
          result += `❌ ${index + 1}/${missingMemories.length}: ${memory.id} 인덱싱 실패 - ${errorMsg}\n`;
        }
      }

      result += `\n📊 **복구 결과:**\n`;
      result += `- 성공: ${successCount}개\n`;
      result += `- 실패: ${errorCount}개\n`;

      if (errors.length > 0) {
        result += `\n❌ **실패한 인덱싱:**\n`;
        errors.forEach((error, index) => {
          result += `${index + 1}. ${error}\n`;
        });
      }

      // 최종 상태 확인
      const finalIndexed = await connection.get(`
        SELECT COUNT(DISTINCT memory_id) as count FROM search_keywords
      `);
      const finalCoverage = totalMemories.count > 0 
        ? (finalIndexed.count / totalMemories.count * 100).toFixed(1)
        : 0;
      
      result += `\n📈 **최종 상태:**\n`;
      result += `- 인덱싱된 메모리: ${finalIndexed.count}개\n`;
      result += `- 최종 커버리지: ${finalCoverage}%\n`;

    } else {
      result += '⚠️ repair_missing=true로 설정하여 복구를 수행하세요.\n';
    }

    return result;

  } catch (error) {
    return `❌ 인덱스 복구 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}