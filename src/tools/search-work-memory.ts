import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';
import { formatHumanReadableDate, getWorkedEmoji, getWorkedDisplayText } from '../utils/index.js';
import { globalProgressTracker } from '../progress/ProgressTracker.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * search_work_memory MCP 도구
 * 키워드 기반 워크 메모리 검색 기능
 */

export interface SearchWorkMemoryArgs {
  query: string;
  project?: string;
  time_range?: 'today' | 'week' | 'month' | 'all';
  limit?: number;
  sort_by?: 'relevance' | 'date' | 'access_count' | 'importance_score';
  fuzzy_match?: boolean;
  include_archived?: boolean;
  include_full_content?: boolean; // 전체 내용 포함 여부 (기본값: false)
  min_score?: number;
  // 중요도 점수 필터링
  min_importance_score?: number;
  max_importance_score?: number;
  importance_weight?: number; // 검색 결과에서 중요도 가중치 (0-1, 기본값 0.3)
  // 할일 관리 확장 필드
  work_type?: 'memory' | 'todo';
  worked?: '완료' | '미완료';
  tags?: string[];
  // 진행률 추적 옵션
  enable_progress?: boolean; // 진행률 추적 활성화 (기본값: false)
  progress_task_id?: string; // 진행률 추적용 작업 ID (자동 생성 가능)
}

export const searchWorkMemoryTool: Tool = {
  name: 'search_work_memory',
  description: '워크 메모리 데이터베이스에서 키워드 기반 검색을 수행합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '검색할 키워드 또는 문구',
        minLength: 1
      },
      project: {
        type: 'string',
        description: '특정 프로젝트로 검색 범위 제한 (선택사항)',
        minLength: 1
      },
      time_range: {
        type: 'string',
        enum: ['today', 'week', 'month', 'all'],
        description: '시간 범위 필터 (기본값: all)',
        default: 'all'
      },
      limit: {
        type: 'number',
        description: '반환할 최대 결과 수 (기본값: 20)',
        minimum: 1,
        maximum: 100,
        default: 20
      },
      sort_by: {
        type: 'string',
        enum: ['relevance', 'date', 'access_count', 'importance_score'],
        description: '정렬 기준 (기본값: relevance)',
        default: 'relevance'
      },
      fuzzy_match: {
        type: 'boolean',
        description: '퍼지 매칭 활성화 여부 (기본값: false)',
        default: false
      },
      include_archived: {
        type: 'boolean',
        description: '아카이브된 메모리 포함 여부 (기본값: false)',
        default: false
      },
      include_full_content: {
        type: 'boolean',
        description: '전체 내용 포함 여부 (기본값: false, true시 길이 제한 없는 전체 내용)',
        default: false
      },
      min_score: {
        type: 'number',
        description: '최소 관련도 점수 (1-100, 기본값: 10)',
        minimum: 1,
        maximum: 100,
        default: 10
      },
      min_importance_score: {
        type: 'number',
        description: '최소 중요도 점수 (0-100)',
        minimum: 0,
        maximum: 100
      },
      max_importance_score: {
        type: 'number',
        description: '최대 중요도 점수 (0-100)',
        minimum: 0,
        maximum: 100
      },
      importance_weight: {
        type: 'number',
        description: '검색 결과에서 중요도 가중치 (0-1, 기본값: 0.3)',
        minimum: 0,
        maximum: 1,
        default: 0.3
      },
      // 할일 관리 확장 필드
      work_type: {
        type: 'string',
        enum: ['memory', 'todo'],
        description: '작업 유형 필터 (선택사항)'
      },
      worked: {
        type: 'string',
        enum: ['완료', '미완료'],
        description: '작업 완료 상태 필터 (선택사항)'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '특정 태그들로 필터링 (예: ["할일", "미완료"])',
        maxItems: 10
      },
      // 진행률 추적 옵션
      enable_progress: {
        type: 'boolean',
        description: '진행률 추적 활성화 여부 (기본값: false)',
        default: false
      },
      progress_task_id: {
        type: 'string',
        description: '진행률 추적용 작업 ID (자동 생성 가능)',
        minLength: 1
      }
    },
    required: ['query']
  }
};

/**
 * search_work_memory 도구 핸들러
 */
export async function handleSearchWorkMemory(args: SearchWorkMemoryArgs): Promise<string> {
  const startTime = Date.now();
  
  // 진행률 추적 설정
  let taskId: string | undefined;
  if (args.enable_progress) {
    taskId = args.progress_task_id || uuidv4();
    globalProgressTracker.startTask({
      taskId,
      updateInterval: 500
    });
    
    // SSE에 검색 작업 시작 알림 (ProgressTracker가 자동으로 전송)
    globalProgressTracker.updateProgress(
      taskId,
      0,
      '메모리 스캔 시작',
      `검색어: "${args.query}"`,
      0
    );
  }
  
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      if (taskId) {
        globalProgressTracker.failTask(taskId, '데이터베이스 연결 실패');
      }
      return '❌ 데이터베이스 연결을 사용할 수 없습니다.';
    }

    const query = args.query.trim();
    if (!query) {
      if (taskId) {
        globalProgressTracker.failTask(taskId, '검색 쿼리가 비어있음');
      }
      return '❌ 검색 쿼리가 비어있습니다.';
    }

    const limit = args.limit || 20;
    const includeArchived = args.include_archived || false;

    // WHERE 조건 구성
    const whereConditions: string[] = [];
    const params: any[] = [];

    // 아카이브 필터
    if (!includeArchived) {
      whereConditions.push('is_archived = 0');
    }

    // 프로젝트 필터
    if (args.project) {
      whereConditions.push('project = ?');
      params.push(args.project);
    }

    // 작업 유형 필터
    if (args.work_type) {
      whereConditions.push('work_type = ?');
      params.push(args.work_type);
    }

    // worked 상태 필터
    if (args.worked) {
      whereConditions.push('worked = ?');
      params.push(args.worked);
    }

    // 태그 필터 (모든 태그가 포함되어야 함)
    if (args.tags && args.tags.length > 0) {
      for (const tag of args.tags) {
        whereConditions.push('tags LIKE ?');
        params.push(`%"${tag}"%`);
      }
    }

    // 중요도 점수 필터
    if (args.min_importance_score !== undefined) {
      whereConditions.push('importance_score >= ?');
      params.push(args.min_importance_score);
    }

    if (args.max_importance_score !== undefined) {
      whereConditions.push('importance_score <= ?');
      params.push(args.max_importance_score);
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

    // 검색 조건
    const searchTerms = query.split(/\s+/).filter(term => term.length > 0);
    const searchConditions: string[] = [];
    
    // 진행률 업데이트 - 키워드 매칭 단계
    if (taskId) {
      globalProgressTracker.updateProgress(
        taskId,
        20,
        '키워드 매칭',
        `${searchTerms.length}개 검색어 처리 중`,
        searchTerms.length
      );
    }
    
    for (const term of searchTerms) {
      if (args.fuzzy_match) {
        // 퍼지 매칭 (부분 문자열 검색) - 할일 관리 필드 포함
        searchConditions.push('(content LIKE ? OR tags LIKE ? OR project LIKE ? OR context LIKE ? OR requirements LIKE ? OR result_content LIKE ?)');
        params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
      } else {
        // 정확한 매칭 - 할일 관리 필드 포함
        searchConditions.push('(content LIKE ? OR tags LIKE ? OR context LIKE ? OR requirements LIKE ? OR result_content LIKE ?)');
        params.push(`%${term}%`, `%"${term}"%`, `%${term}%`, `%${term}%`, `%${term}%`);
      }
    }
    
    if (searchConditions.length > 0) {
      whereConditions.push(`(${searchConditions.join(' AND ')})`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 진행률 업데이트 - 필터링 단계
    if (taskId) {
      globalProgressTracker.updateProgress(
        taskId,
        40,
        '필터링 적용',
        '조건에 맞는 메모리 선별 중'
      );
    }

    // 정렬 처리
    const importanceWeight = args.importance_weight ?? 0.3;
    let orderClause = '';
    
    switch (args.sort_by) {
      case 'date':
        orderClause = 'ORDER BY created_at DESC';
        break;
      case 'access_count':
        orderClause = 'ORDER BY access_count DESC';
        break;
      case 'importance_score':
        orderClause = 'ORDER BY importance_score DESC, created_at DESC';
        break;
      default: // relevance - 관련성과 중요도 결합 점수
        orderClause = `ORDER BY 
          ((100 * ${1 - importanceWeight}) + (importance_score * ${importanceWeight})) DESC, 
          created_at DESC`;
    }

    // 진행률 업데이트 - 정렬 단계
    if (taskId) {
      globalProgressTracker.updateProgress(
        taskId,
        60,
        '결과 정렬',
        `${args.sort_by || 'relevance'} 기준으로 정렬 중`
      );
    }

    // 내용 선택 (토큰 절약을 위해 기본은 서머리만)
    const contentFields = args.include_full_content
      ? 'content, extracted_content'  // 상세시: 전체 + 서머리
      : 'extracted_content';          // 기본: 서머리만 (토큰 절약)

    // 검색 실행 - 최적화된 쿼리
    const searchQuery = `
      SELECT 
        id, ${contentFields}, project, tags, importance_score, created_by,
        created_at, updated_at, access_count, last_accessed_at,
        context, requirements, result_content, work_type, worked,
        ((100 * ${1 - importanceWeight}) + (importance_score * ${importanceWeight})) as combined_score
      FROM work_memories 
      ${whereClause}
      ${orderClause}
      LIMIT ?
    `;

    const results = await connection.all(searchQuery, [...params, limit]);
    
    // 진행률 업데이트 - 포맷팅 단계
    if (taskId) {
      globalProgressTracker.updateProgress(
        taskId,
        80,
        '결과 포맷팅',
        `${results.length}개 결과 형식화 중`,
        results.length
      );
    }
    
    const searchTime = Date.now() - startTime;

    // 결과 포맷팅
    let output = `🔍 검색 결과 "${query}" (${results.length}개, ${searchTime}ms)\n\n`;

    if (results.length === 0) {
      output += '🚫 검색 결과가 없습니다.\n\n';
      
      // 검색 제안 (간단한 구현)
      const suggestionQuery = `
        SELECT DISTINCT project 
        FROM work_memories 
        WHERE project IS NOT NULL AND project != '' 
        AND is_archived = 0
        LIMIT 5
      `;
      const suggestions = await connection.all(suggestionQuery);
      
      if (suggestions.length > 0) {
        output += '💡 다음 프로젝트에서 검색해보세요:\n';
        suggestions.forEach((proj: any) => {
          output += `   • ${proj.project}\n`;
        });
      }
      
      return output;
    }

    results.forEach((memory: any, index: number) => {
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
      const workTypeIcon = memory.work_type === 'todo' ? '📋' : '💭';
      
      // 표시 내용 선택 - 심플한 로직
      const displayContent = args.include_full_content 
        ? (memory.content || memory.extracted_content)  // 상세시: 전체 내용 우선 (길이 제한 없음)
        : memory.extracted_content;                     // 기본: 서머리만
      
      // 검색어 하이라이트 (간단한 구현)
      let highlightedContent = displayContent || '';
      for (const term of searchTerms) {
        const regex = new RegExp(`(${term})`, 'gi');
        highlightedContent = highlightedContent.replace(regex, '**$1**');
      }
      
      // 결합 점수 표시 (relevance 정렬일 때만)
      const scoreInfo = args.sort_by === 'relevance' ? 
        ` [결합점수: ${Math.round(memory.combined_score)}]` : '';
      
      output += `${index + 1}. ${workTypeIcon} ${importance.icon} [ID: ${memory.id}]${scoreInfo}\n`;
      
      // 작업 유형에 따라 content 표시 방식 구분 - 길이 제한 없음
      const isCompleted = tags.includes('완료한작업');
      const isMemory = memory.work_type === 'memory';
      
      if (isMemory) {
        output += `   💭 내용: ${highlightedContent}\n`;
      } else if (isCompleted) {
        output += `   📝 작업요약: ${highlightedContent}\n`;
      } else {
        output += `   📋 할일: ${highlightedContent}\n`;
      }
      
      if (memory.context) {
        const contextDisplay = args.include_full_content 
          ? memory.context 
          : `${memory.context.substring(0, 100)}${memory.context.length > 100 ? '...' : ''}`;
        output += `   📋 배경: ${contextDisplay}\n`;
      }
      
      if (memory.requirements) {
        const requirementsDisplay = args.include_full_content 
          ? memory.requirements 
          : `${memory.requirements.substring(0, 100)}${memory.requirements.length > 100 ? '...' : ''}`;
        output += `   ✅ 요구사항: ${requirementsDisplay}\n`;
      }
      
      if (memory.result_content) {
        output += `   🎯 결과물: ${memory.result_content.substring(0, 150)}${memory.result_content.length > 150 ? '...' : ''}\n`;
      }
      
      if (memory.project) {
        output += `   📁 프로젝트: ${memory.project}\n`;
      }
      
      if (tags.length > 0) {
        output += `   🏷️ 태그: ${tags.map((tag: string) => `#${tag}`).join(' ')}\n`;
      }
      
      // worked 상태 표시
      if (memory.worked) {
        output += `   ${getWorkedEmoji(memory.worked)} 상태: ${getWorkedDisplayText(memory.worked)}\n`;
      }
      
      output += `   👤 작성자: ${memory.created_by}\n`;
      output += `   ⭐ 중요도: ${importance.level} (${memory.importance_score}점)\n`;
      output += `   📅 생성: ${formatHumanReadableDate(memory.created_at)}\n`;
      output += `   👁️ 접근: ${memory.access_count}회\n\n`;
    });

    // 검색 통계
    output += `⏱️ 검색 시간: ${searchTime}ms\n`;
    
    // 중요도 통계 추가
    if (results.length > 0) {
      const importanceStats = results.reduce((acc: any, memory: any) => {
        const score = memory.importance_score;
        if (score >= 90) acc.critical++;
        else if (score >= 70) acc.high++;
        else if (score >= 30) acc.medium++;
        else if (score >= 10) acc.low++;
        else acc.minimal++;
        return acc;
      }, { critical: 0, high: 0, medium: 0, low: 0, minimal: 0 });
      
      const avgScore = Math.round(results.reduce((sum: number, memory: any) => sum + memory.importance_score, 0) / results.length);
      
      output += `📊 중요도 분포: 매우높음 ${importanceStats.critical}, 높음 ${importanceStats.high}, 보통 ${importanceStats.medium}, 낮음 ${importanceStats.low}, 최소 ${importanceStats.minimal} (평균: ${avgScore}점)\n`;
    }
    
    if (results.length === limit) {
      output += `📢 더 많은 결과가 있을 수 있습니다. limit을 늘려서 더 많은 결과를 확인하세요.\n`;
    }

    // 진행률 완료 처리
    if (taskId) {
      globalProgressTracker.completeTask(taskId, `검색 완료: ${results.length}개 결과 반환`);
    }

    return output;

  } catch (error) {
    const searchTime = Date.now() - startTime;
    
    // 진행률 실패 처리
    if (taskId) {
      globalProgressTracker.failTask(taskId, error instanceof Error ? error.message : '알 수 없는 오류');
    }
    
    return `❌ 검색 중 오류가 발생했습니다 (${searchTime}ms): ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}

