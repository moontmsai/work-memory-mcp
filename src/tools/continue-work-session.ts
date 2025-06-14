/**
 * 작업 세션 이어가기 도구
 * "어제 하던 XXX 프로젝트 이어가자" 기능 구현
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';
import { SessionQueryManager } from '../session/SessionQueryManager.js';
import { getSessionContext } from '../session/SessionContextManager.js';
import { formatHumanReadableDate, getWorkedEmoji, getWorkedDisplayText } from '../utils/index.js';
import { deserializeTags } from '../utils/helpers.js';
import { SessionStatus, WorkSession, SessionWithMemories } from '../types/session.js';

export interface ContinueWorkSessionArgs {
  project_name?: string;
  search_keyword?: string;
  session_id?: string;
  auto_activate?: boolean;
  include_memories?: boolean;
  include_todos?: boolean;
  memory_limit?: number;
}

export const continueWorkSessionTool: Tool = {
  name: 'continue_work_session',
  description: '프로젝트명이나 키워드로 작업 세션을 찾아서 이어가기. 세션 정보와 관련 작업기억들을 함께 로딩하여 컨텍스트를 완전히 복원합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      project_name: {
        type: 'string',
        description: '이어갈 프로젝트명 (정확한 이름)',
        minLength: 1
      },
      search_keyword: {
        type: 'string',
        description: '프로젝트 검색용 키워드 (부분 매칭)',
        minLength: 1
      },
      session_id: {
        type: 'string',
        description: '특정 세션 ID로 직접 이어가기',
        minLength: 1
      },
      auto_activate: {
        type: 'boolean',
        description: '찾은 세션을 자동으로 활성화할지 여부 (기본값: true)',
        default: true
      },
      include_memories: {
        type: 'boolean',
        description: '관련 작업기억들 포함 여부 (기본값: true)',
        default: true
      },
      include_todos: {
        type: 'boolean',
        description: '미완료 할일들 포함 여부 (기본값: true)',
        default: true
      },
      memory_limit: {
        type: 'number',
        description: '로딩할 최대 작업기억 수 (기본값: 10)',
        minimum: 1,
        maximum: 50,
        default: 10
      }
    }
  }
};

export async function handleContinueWorkSession(args: ContinueWorkSessionArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    const sessionQueryManager = new SessionQueryManager(connection);
    const sessionContext = getSessionContext(connection);

    let targetSession: WorkSession | SessionWithMemories | null = null;
    let searchMethod = '';

    // 1. 세션 검색
    if (args.session_id) {
      // 직접 세션 ID로 검색
      targetSession = await sessionQueryManager.getSessionById(args.session_id, true);
      searchMethod = `세션 ID: ${args.session_id}`;
    } else if (args.project_name) {
      // 정확한 프로젝트명으로 검색
      const result = await sessionQueryManager.getSessionsByProject(args.project_name, {
        status: [SessionStatus.ACTIVE, SessionStatus.PAUSED],
        sort_by: 'last_activity_at',
        sort_order: 'DESC',
        limit: 1
      });
      
      if (result.data.length > 0) {
        targetSession = await sessionQueryManager.getSessionById(result.data[0].session_id, true);
        searchMethod = `프로젝트명: ${args.project_name}`;
      }
    } else if (args.search_keyword) {
      // 키워드로 검색
      const result = await sessionQueryManager.searchSessions({
        search_query: args.search_keyword,
        search_fields: ['project_name', 'description'],
        status: [SessionStatus.ACTIVE, SessionStatus.PAUSED, SessionStatus.COMPLETED],
        sort_by: 'last_activity_at',
        sort_order: 'DESC',
        limit: 5,
        include_memories: true
      });

      if (result.data.length > 0) {
        targetSession = result.data[0];
        searchMethod = `키워드: ${args.search_keyword}`;
      }
    } else {
      // 최근 활성 세션 검색
      const recentSessions = await sessionQueryManager.getRecentSessions(5);
      const activeSessions = recentSessions.filter(s => 
        s.status === SessionStatus.ACTIVE || s.status === SessionStatus.PAUSED
      );
      
      if (activeSessions.length > 0) {
        targetSession = await sessionQueryManager.getSessionById(activeSessions[0].session_id, true);
        searchMethod = '최근 활성 세션';
      }
    }

    if (!targetSession) {
      return `❌ 조건에 맞는 작업 세션을 찾을 수 없습니다.\n` +
             `🔍 검색 조건: ${searchMethod}\n` +
             `💡 다른 프로젝트명이나 키워드로 다시 시도해보세요.`;
    }

    // 2. 세션 활성화 (옵션)
    let activationResult = '';
    if (args.auto_activate !== false) {
      try {
        await sessionContext.setActiveSession(targetSession.session_id);
        activationResult = '\n🔄 세션이 활성화되었습니다.';
      } catch (error) {
        activationResult = '\n⚠️ 세션 활성화에 실패했지만 정보는 조회되었습니다.';
      }
    }

    // 3. 세션 정보 포맷팅
    const statusEmoji = {
      [SessionStatus.ACTIVE]: '🟢',
      [SessionStatus.PAUSED]: '🟡', 
      [SessionStatus.COMPLETED]: '✅',
      [SessionStatus.CANCELLED]: '❌'
    };

    let result = `🚀 작업 세션 컨텍스트 복원\n\n`;
    result += `📋 **세션 정보**\n`;
    result += `${statusEmoji[targetSession.status]} **${targetSession.project_name}**\n`;
    result += `🆔 세션 ID: ${targetSession.session_id}\n`;
    result += `📂 프로젝트 경로: ${targetSession.project_path || 'N/A'}\n`;
    result += `📅 시작일: ${formatHumanReadableDate(targetSession.started_at)}\n`;
    result += `⏰ 마지막 활동: ${formatHumanReadableDate(targetSession.last_activity_at)}\n`;
    result += `📊 상태: ${targetSession.status}\n`;
    
    if (targetSession.description) {
      result += `📝 설명: ${targetSession.description}\n`;
    }
    
    result += `📈 통계: 메모리 ${targetSession.memory_count}개, 활동 ${targetSession.activity_count}회\n`;
    
    if (targetSession.total_work_time > 0) {
      const hours = Math.floor(targetSession.total_work_time / 3600);
      const minutes = Math.floor((targetSession.total_work_time % 3600) / 60);
      result += `⏱️ 총 작업시간: ${hours}시간 ${minutes}분\n`;
    }

    // 4. 관련 작업기억들 조회 및 표시
    let sessionMemories: any[] = [];
    if (args.include_memories !== false) {
      const memoryLimit = args.memory_limit || 10;
      
      // change_history에서 해당 세션의 메모리들 찾기 (session_id 컬럼 활용)
      sessionMemories = await connection.all(`
        SELECT DISTINCT wm.* 
        FROM work_memories wm
        INNER JOIN change_history ch ON wm.id = ch.memory_id
        WHERE ch.session_id = ? 
          AND wm.is_archived = 0
        ORDER BY wm.updated_at DESC 
        LIMIT ?
      `, [targetSession.session_id, memoryLimit]);

      if (sessionMemories.length > 0) {
        result += `\n📚 **관련 작업기억들 (최근 ${sessionMemories.length}개)**\n`;
        
        sessionMemories.forEach((memory: any, index: number) => {
          const tags = deserializeTags(memory.tags);
          const typeIcon = memory.work_type === 'todo' ? '📋' : '💭';
          const importance = getImportanceDisplay(memory.importance_score);
          
          result += `\n${index + 1}. ${typeIcon} ${importance.icon} ${memory.extracted_content || memory.content.substring(0, 100)}\n`;
          
          if (memory.worked) {
            result += `   ${getWorkedEmoji(memory.worked)} ${getWorkedDisplayText(memory.worked)}`;
          }
          if (tags.length > 0) {
            result += ` 🏷️ ${tags.slice(0, 3).map((tag: string) => `#${tag}`).join(' ')}`;
          }
          result += `\n   📅 ${formatHumanReadableDate(memory.updated_at)} (중요도: ${memory.importance_score}점)\n`;
        });
      } else {
        result += `\n📚 **관련 작업기억들**\n   ℹ️ 이 세션에 연결된 작업기억이 없습니다.\n`;
      }
    }

    // 5. 미완료 할일들 조회 및 표시
    if (args.include_todos !== false) {
      const todoMemories = await connection.all(`
        SELECT DISTINCT wm.* 
        FROM work_memories wm
        INNER JOIN change_history ch ON wm.id = ch.memory_id
        WHERE ch.session_id = ? 
          AND wm.work_type = 'todo'
          AND wm.worked = '미완료'
          AND wm.is_archived = 0
        ORDER BY wm.importance_score DESC, wm.updated_at DESC
        LIMIT 5
      `, [targetSession.session_id]);

      if (todoMemories.length > 0) {
        result += `\n🎯 **미완료 할일들 (${todoMemories.length}개)**\n`;
        
        todoMemories.forEach((todo: any, index: number) => {
          const importance = getImportanceDisplay(todo.importance_score);
          result += `\n${index + 1}. ${importance.icon} ${todo.extracted_content || todo.content.substring(0, 80)}\n`;
          result += `   📅 ${formatHumanReadableDate(todo.updated_at)} (중요도: ${todo.importance_score}점)\n`;
          
          if (todo.requirements) {
            result += `   ✅ 요구사항: ${todo.requirements.substring(0, 50)}${todo.requirements.length > 50 ? '...' : ''}\n`;
          }
        });
      } else {
        result += `\n🎯 **미완료 할일들**\n   ✅ 이 세션에 미완료 할일이 없습니다.\n`;
      }
    }

    // 6. 다음 단계 제안
    result += `\n💡 **다음 단계 제안**\n`;
    
    if (targetSession.status === SessionStatus.PAUSED) {
      result += `   • 세션이 일시정지 상태입니다. 작업을 재개하시겠습니까?\n`;
    } else if (targetSession.status === SessionStatus.COMPLETED) {
      result += `   • 완료된 세션입니다. 새로운 세션을 시작하거나 이 세션을 재활성화할 수 있습니다.\n`;
    } else {
      result += `   • 현재 활성 세션입니다. 바로 작업을 이어가실 수 있습니다.\n`;
    }

    if (sessionMemories && sessionMemories.length > 0) {
      result += `   • 관련 작업기억들을 참고하여 이전 작업 상황을 파악하세요.\n`;
    }
    
    result += `   • 새로운 작업기억이나 할일을 추가하면 자동으로 이 세션에 연결됩니다.\n`;

    result += activationResult;
    result += `\n🔍 검색 방법: ${searchMethod}`;

    return result;

  } catch (error) {
    if (error instanceof Error) {
      return `❌ 작업 세션 복원 중 오류가 발생했습니다: ${error.message}`;
    }
    return '❌ 알 수 없는 오류가 발생했습니다.';
  }
}

/**
 * 중요도 점수에 따른 아이콘과 레벨 반환
 */
function getImportanceDisplay(score: number): { icon: string; level: string } {
  if (score >= 90) return { icon: '🔥', level: '매우높음' };
  if (score >= 70) return { icon: '⭐', level: '높음' };
  if (score >= 30) return { icon: '📌', level: '보통' };
  if (score >= 10) return { icon: '📝', level: '낮음' };
  return { icon: '💤', level: '최소' };
}