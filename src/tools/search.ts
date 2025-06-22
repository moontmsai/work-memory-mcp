import { z } from 'zod';
import { 
  handleSearchWorkMemory, 
  SearchWorkMemoryArgs 
} from './search-work-memory.js';
import { 
  handleGetRelatedKeywords, 
  GetRelatedKeywordsArgs,
  formatRelatedKeywords
} from './get-related-keywords.js';
import { 
  handleGetSearchStats, 
  GetSearchStatsArgs,
  formatSearchStats
} from './get-search-stats.js';
import { 
  handleOptimizeSearchIndex, 
  OptimizeSearchIndexArgs
} from './optimize-search-index.js';

// 통합 검색 작업 스키마
const SearchOperationSchema = z.object({
  operation: z.enum(['search', 'keywords', 'stats', 'optimize']),
  
  // search 작업용 필드
  query: z.string().optional(),
  project: z.string().optional(),
  tags: z.array(z.string()).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  importance_min: z.number().min(0).max(10).optional(),
  worked: z.enum(['완료', '미완료']).optional(),
  work_type: z.array(z.enum(['memory', 'todo'])).optional(),
  limit: z.number().positive().optional(),
  offset: z.number().min(0).optional(),
  match_threshold: z.number().min(0).max(1).optional(),
  include_content: z.boolean().optional(),
  highlight_matches: z.boolean().optional(),
  session_id: z.string().optional(),
  include_archived: z.boolean().optional(),
  
  // keywords 작업용 필드
  keyword: z.string().optional(),
  top_n: z.number().positive().optional(),
  
  // stats 작업용 필드
  days: z.number().positive().optional(),
  
  // optimize 작업용 필드
  rebuild_index: z.boolean().optional(),
  cleanup_orphans: z.boolean().optional()
});

export type SearchOperationArgs = z.infer<typeof SearchOperationSchema>;

export const searchTool = {
  name: 'search',
  description: `통합 검색 및 분석 도구 - 메모리 검색, 키워드 분석, 통계 조회, 인덱스 최적화를 수행합니다.

사용법:
1. 검색: { "operation": "search", "query": "검색어", "project": "프로젝트명" }
2. 연관 키워드: { "operation": "keywords", "keyword": "키워드", "top_n": 10 }
3. 검색 통계: { "operation": "stats", "days": 30 }
4. 인덱스 최적화: { "operation": "optimize", "rebuild_index": true }

각 작업별 상세 옵션:
- search: query(필수), project, tags, date_from/to, importance_min, worked, work_type, limit/offset, match_threshold, include_content, highlight_matches, session_id, include_archived
- keywords: keyword(필수), top_n
- stats: days
- optimize: rebuild_index, cleanup_orphans`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['search', 'keywords', 'stats', 'optimize'],
        description: '수행할 작업: search(검색), keywords(연관키워드), stats(통계), optimize(최적화)'
      },
      
      // search 작업 필드
      query: {
        type: 'string',
        description: '검색 쿼리 (search 작업에 필수)'
      },
      project: {
        type: 'string',
        description: '프로젝트 필터'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '태그 필터'
      },
      date_from: {
        type: 'string',
        description: '시작 날짜 (YYYY-MM-DD)'
      },
      date_to: {
        type: 'string',
        description: '종료 날짜 (YYYY-MM-DD)'
      },
      importance_min: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: '최소 중요도'
      },
      worked: {
        type: 'string',
        enum: ['완료', '미완료'],
        description: '완료 여부 필터'
      },
      work_type: {
        type: 'array',
        items: { 
          type: 'string',
          enum: ['memory', 'todo']
        },
        description: '작업 유형 필터'
      },
      limit: {
        type: 'number',
        description: '결과 개수 제한 (기본: 20)'
      },
      offset: {
        type: 'number',
        description: '결과 오프셋'
      },
      match_threshold: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: '매칭 임계값 (0-1, 기본: 0.3)'
      },
      include_content: {
        type: 'boolean',
        description: '전체 내용 포함 여부'
      },
      highlight_matches: {
        type: 'boolean',
        description: '매칭 부분 하이라이트'
      },
      session_id: {
        type: 'string',
        description: '세션 ID 필터'
      },
      include_archived: {
        type: 'boolean',
        description: '아카이브 포함 여부'
      },
      
      // keywords 작업 필드
      keyword: {
        type: 'string',
        description: '분석할 키워드 (keywords 작업에 필수)'
      },
      top_n: {
        type: 'number',
        description: '상위 N개 결과 (기본: 10)'
      },
      
      // stats 작업 필드
      days: {
        type: 'number',
        description: '통계 기간 (일 단위, 기본: 30)'
      },
      
      // optimize 작업 필드
      rebuild_index: {
        type: 'boolean',
        description: '인덱스 재구축 여부'
      },
      cleanup_orphans: {
        type: 'boolean',
        description: '고아 레코드 정리 여부'
      }
    },
    required: ['operation']
  }
};

export async function handleSearch(args: SearchOperationArgs): Promise<string> {
  const { operation } = args;

  switch (operation) {
    case 'search': {
      if (!args.query) throw new Error('search 작업에는 query가 필수입니다');
      
      const searchArgs: SearchWorkMemoryArgs = {
        query: args.query,
        project: args.project,
        tags: args.tags,
        // date_from/date_to 필드는 SearchWorkMemoryArgs에 없음
        // time_range로 대체
        min_importance_score: args.importance_min,
        worked: args.worked,
        work_type: Array.isArray(args.work_type) ? args.work_type[0] : args.work_type,
        limit: args.limit,
        // offset 필드는 SearchWorkMemoryArgs에 없음
        // match_threshold 필드는 SearchWorkMemoryArgs에 없음
        include_full_content: args.include_content,
        // highlight_matches 필드는 SearchWorkMemoryArgs에 없음
        session_id: args.session_id,
        include_archived: args.include_archived
      };
      return handleSearchWorkMemory(searchArgs);
    }
    
    case 'keywords': {
      if (!args.keyword) throw new Error('keywords 작업에는 keyword가 필수입니다');
      
      const keywordsArgs: GetRelatedKeywordsArgs = {
        keyword: args.keyword,
        // top_n 필드는 GetRelatedKeywordsArgs에 없으므로 제거
      };
      const result = await handleGetRelatedKeywords(keywordsArgs);
      
      if (result.success && result.related_keywords) {
        return formatRelatedKeywords(
          result.keyword, 
          result.related_keywords, 
          result.search_suggestions
        );
      } else {
        return `❌ 연관 키워드 조회 실패: ${result.error}`;
      }
    }
    
    case 'stats': {
      const statsArgs: GetSearchStatsArgs = {
        // days 필드는 GetSearchStatsArgs에 없으므로 제거
      };
      const result = await handleGetSearchStats(statsArgs);
      
      if (result.success) {
        return formatSearchStats(result);
      } else {
        return `❌ 검색 통계 조회 실패: ${result.error}`;
      }
    }
    
    case 'optimize': {
      const optimizeArgs: OptimizeSearchIndexArgs = {
        // rebuild_index와 cleanup_orphans 필드는 OptimizeSearchIndexArgs에 없으므로 제거
      };
      return handleOptimizeSearchIndex(optimizeArgs);
    }
    
    default:
      throw new Error(`알 수 없는 작업: ${operation}`);
  }
}