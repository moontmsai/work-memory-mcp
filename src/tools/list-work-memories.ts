import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';
import { formatHumanReadableDate } from '../utils/index.js';

export interface ListWorkMemoriesArgs {
  project?: string;
  tags?: string[];
  importance_score?: number; // 특정 점수로 필터링
  min_importance_score?: number; // 최소 중요도 점수
  max_importance_score?: number; // 최대 중요도 점수
  time_range?: 'today' | 'week' | 'month' | 'all';
  created_by?: string;
  sort_by?: 'created_at' | 'updated_at' | 'access_count' | 'importance_score' | 'project';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  include_content?: boolean;
  include_stats?: boolean;
  search_keyword?: string;
  work_type?: 'memory' | 'todo';
  worked?: '완료' | '미완료';
}

export const listWorkMemoriesTool: Tool = {
  name: 'list_work_memories',
  description: '저장된 워크 메모리 목록을 조회합니다. 다양한 필터링과 정렬 옵션을 제공합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      project: {
        type: 'string',
        description: '특정 프로젝트로 필터링',
        minLength: 1
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '특정 태그들로 필터링 (AND 조건)',
        maxItems: 10
      },
      importance_score: {
        type: 'number',
        description: '특정 중요도 점수로 필터링 (0-100)',
        minimum: 0,
        maximum: 100
      },
      min_importance_score: {
        type: 'number',
        description: '최소 중요도 점수 (이상)',
        minimum: 0,
        maximum: 100
      },
      max_importance_score: {
        type: 'number',
        description: '최대 중요도 점수 (이하)',
        minimum: 0,
        maximum: 100
      },
      time_range: {
        type: 'string',
        enum: ['today', 'week', 'month', 'all'],
        description: '시간 범위로 필터링 (기본값: all)',
        default: 'all'
      },
      created_by: {
        type: 'string',
        description: '작성자로 필터링',
        minLength: 1
      },
      sort_by: {
        type: 'string',
        enum: ['created_at', 'updated_at', 'access_count', 'importance_score', 'project'],
        description: '정렬 기준 (기본값: updated_at)',
        default: 'updated_at'
      },
      sort_order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: '정렬 순서 (기본값: desc)',
        default: 'desc'
      },
      limit: {
        type: 'number',
        description: '페이지당 결과 수 (기본값: 20)',
        minimum: 1,
        maximum: 100,
        default: 20
      },
      offset: {
        type: 'number',
        description: '시작 위치 (기본값: 0)',
        minimum: 0,
        default: 0
      },
      include_content: {
        type: 'boolean',
        description: '전체 내용 포함 여부 (기본값: true)',
        default: true
      },
      include_stats: {
        type: 'boolean',
        description: '통계 정보 포함 여부 (기본값: true)',
        default: true
      },
      search_keyword: {
        type: 'string',
        description: '내용에서 검색할 키워드 (간단한 텍스트 매칭)',
        minLength: 1
      },
      work_type: {
        type: 'string',
        enum: ['memory', 'todo'],
        description: '작업 유형으로 필터링 (선택사항)'
      },
      worked: {
        type: 'string',
        enum: ['완료', '미완료'],
        description: '작업 완료 상태로 필터링 (선택사항)'
      }
    }
  }
};

export async function handleListWorkMemories(args: ListWorkMemoriesArgs = {}): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      return '❌ 데이터베이스 연결을 사용할 수 없습니다.';
    }

    // 기본값 설정
    const limit = args.limit || 20;
    const offset = args.offset || 0;
    const sortBy = args.sort_by || 'updated_at';
    const sortOrder = args.sort_order || 'desc';
    const includeContent = args.include_content !== false;
    const includeStats = args.include_stats !== false;

    // WHERE 조건 구성
    const whereConditions: string[] = ['is_archived = 0']; // archived 대신 is_archived 사용
    const params: any[] = [];

    if (args.project) {
      whereConditions.push('project = ?');
      params.push(args.project);
    }

    if (args.importance_score !== undefined) {
      whereConditions.push('importance_score = ?');
      params.push(args.importance_score);
    }

    if (args.min_importance_score !== undefined) {
      whereConditions.push('importance_score >= ?');
      params.push(args.min_importance_score);
    }

    if (args.max_importance_score !== undefined) {
      whereConditions.push('importance_score <= ?');
      params.push(args.max_importance_score);
    }

    if (args.created_by) {
      whereConditions.push('created_by = ?');
      params.push(args.created_by);
    }

    if (args.search_keyword) {
      whereConditions.push('content LIKE ?');
      params.push(`%${args.search_keyword}%`);
    }

    // 시간 범위 필터
    if (args.time_range && args.time_range !== 'all') {
      const now = new Date();
      let dateThreshold: string;
      
      switch (args.time_range) {
        case 'today':
          now.setHours(0, 0, 0, 0);
          dateThreshold = now.toISOString();
          break;
        case 'week':
          now.setDate(now.getDate() - 7);
          dateThreshold = now.toISOString();
          break;
        case 'month':
          now.setMonth(now.getMonth() - 1);
          dateThreshold = now.toISOString();
          break;
        default:
          dateThreshold = '';
      }
      
      if (dateThreshold) {
        whereConditions.push('created_at >= ?');
        params.push(dateThreshold);
      }
    }

    // 태그 필터 (AND 조건)
    if (args.tags && args.tags.length > 0) {
      for (const tag of args.tags) {
        whereConditions.push('tags LIKE ?');
        params.push(`%"${tag}"%`);
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 정렬 처리
    const validSortColumns = ['created_at', 'updated_at', 'access_count', 'importance_score', 'project'];
    const finalSortBy = validSortColumns.includes(sortBy) ? sortBy : 'updated_at';
    const finalSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // 총 개수 조회
    const totalCountQuery = `SELECT COUNT(*) as count FROM work_memories ${whereClause}`;
    const totalResult = await connection.get(totalCountQuery, params);
    const totalCount = totalResult?.count || 0;

    // 내용 선택 (토큰 절약을 위해 기본은 서머리만)
    const contentSelect = includeContent 
      ? 'content, extracted_content'  // 전체 내용 필요시에만
      : 'extracted_content';          // 기본은 서머리만 (토큰 절약)

    // 메모리 목록 조회
    const selectQuery = `
      SELECT 
        id, ${contentSelect}, project, tags, importance_score, created_by,
        created_at, updated_at, access_count, last_accessed_at, is_archived
      FROM work_memories 
      ${whereClause}
      ORDER BY ${finalSortBy} ${finalSortOrder}
      LIMIT ? OFFSET ?
    `;

    const memories = await connection.all(selectQuery, [...params, limit, offset]);

    // 결과 포맷팅
    let result = `📋 워크 메모리 목록 (총 ${totalCount}개)\n\n`;

    if (memories.length === 0) {
      result += '🔍 조건에 맞는 메모리가 없습니다.\n';
      return result;
    }

    memories.forEach((memory: any, index: number) => {
      const tags = memory.tags ? JSON.parse(memory.tags) : [];
      
      // 중요도 점수에 따른 아이콘과 레벨
      const getImportanceDisplay = (score: number): { icon: string; level: string } => {
        if (score >= 90) return { icon: '🔥', level: '매우높음' };
        if (score >= 70) return { icon: '⭐', level: '높음' };
        if (score >= 30) return { icon: '📌', level: '보통' };
        if (score >= 10) return { icon: '📝', level: '낮음' };
        return { icon: '💤', level: '최소' };
      };
      
      const importance = getImportanceDisplay(memory.importance_score);
      
      result += `${offset + index + 1}. ${importance.icon} ${memory.id}\n`;
      
      // 심플한 표시 로직 - 토큰 절약 목적
      const displayContent = includeContent 
        ? (memory.extracted_content || memory.content)  // 전체시엔 서머리 우선
        : memory.extracted_content;                     // 기본은 서머리만
      
      result += `   📝 ${displayContent}\n`;
      
      if (memory.project) {
        result += `   📁 프로젝트: ${memory.project}\n`;
      }
      
      if (tags.length > 0) {
        result += `   🏷️ 태그: ${tags.map((tag: string) => `#${tag}`).join(' ')}\n`;
      }
      
      result += `   👤 작성자: ${memory.created_by}\n`;
      result += `   ⭐ 중요도: ${importance.level} (${memory.importance_score}점)\n`;
      result += `   📅 생성: ${formatHumanReadableDate(memory.created_at)}\n`;
      result += `   👁️ 접근: ${memory.access_count}회\n\n`;
    });

    // 페이지 정보
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = Math.floor(offset / limit) + 1;
    
    result += `📄 페이지: ${currentPage}/${totalPages}`;
    if (offset + limit < totalCount) {
      result += ` (다음 페이지: offset=${offset + limit})`;
    }

    // 통계 정보 (선택적)
    if (includeStats && totalCount > 0) {
      const statsQuery = `
        SELECT 
          COUNT(CASE WHEN importance_score >= 90 THEN 1 END) as critical_count,
          COUNT(CASE WHEN importance_score >= 70 AND importance_score < 90 THEN 1 END) as high_count,
          COUNT(CASE WHEN importance_score >= 30 AND importance_score < 70 THEN 1 END) as medium_count,
          COUNT(CASE WHEN importance_score >= 10 AND importance_score < 30 THEN 1 END) as low_count,
          COUNT(CASE WHEN importance_score < 10 THEN 1 END) as minimal_count,
          COUNT(DISTINCT project) as project_count,
          SUM(access_count) as total_access_count,
          AVG(importance_score) as avg_importance_score,
          MAX(importance_score) as max_importance_score,
          MIN(importance_score) as min_importance_score
        FROM work_memories 
        WHERE is_archived = 0
      `;
      
      const stats = await connection.get(statsQuery);
      
      result += `\n\n📊 통계 정보:\n`;
      result += `   • 중요도별: 매우높음 ${stats.critical_count}, 높음 ${stats.high_count}, 보통 ${stats.medium_count}, 낮음 ${stats.low_count}, 최소 ${stats.minimal_count}\n`;
      result += `   • 평균 중요도: ${Math.round(stats.avg_importance_score || 0)}점 (범위: ${stats.min_importance_score || 0}-${stats.max_importance_score || 0}점)\n`;
      result += `   • 프로젝트: ${stats.project_count}개\n`;
      result += `   • 총 접근 횟수: ${stats.total_access_count}회\n`;
    }

    return result;

  } catch (error) {
    return `❌ 메모리 목록 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
} 