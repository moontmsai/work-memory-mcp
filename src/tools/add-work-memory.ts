import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';
import { generateMemoryId, getCurrentISOString, extractKeywords, determineOptimalWorkedStatus, getWorkedEmoji, getWorkedDisplayText } from '../utils/index.js';
import { generateSummary } from '../utils/summary-generator.js';
import { DatabaseConnection } from '../database/connection.js';
import { validateWorkMemory } from '../utils/validation.js';
import { VersionManager } from '../history/version-manager.js';
import { WorkMemory } from '../types/memory.js';
import { safeTagsStringify, safeStringify } from '../utils/safe-json.js';
import { SearchManager } from '../utils/search-manager.js';

export interface AddWorkMemoryArgs {
  content: string;
  project?: string;
  tags?: string[];
  created_by?: string;
  importance_score?: number; // 0-100 범위의 중요도 점수
  // 할일 관리 확장 필드
  context?: string;
  requirements?: string;
  result_content?: string;
  work_type?: 'memory' | 'todo';
  worked?: '완료' | '미완료';
}

export const addWorkMemoryTool: Tool = {
  name: 'add_work_memory',
  description: '작업 내용을 SQLite 데이터베이스에 저장합니다. 할일 저장 시 context(배경정보)와 content(작업내용)가 필요합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '저장할 작업 내용',
        minLength: 1,
        maxLength: 10000
      },
      project: {
        type: 'string',
        description: '프로젝트명 (선택사항)',
        maxLength: 100
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '태그 목록 (선택사항)',
        maxItems: 20
      },
      created_by: {
        type: 'string',
        description: '작성자',
        default: 'unknown'
      },
      importance_score: {
        type: 'number',
        description: '중요도 점수 (0-100, 기본값: 50)',
        minimum: 0,
        maximum: 100,
        default: 50
      },
      // 할일 관리 확장 필드
      context: {
        type: 'string',
        description: '현재 상황, 배경 정보 (선택사항)',
        maxLength: 5000
      },
      requirements: {
        type: 'string',
        description: '구체적 요구사항 (선택사항)',
        maxLength: 5000
      },
      result_content: {
        type: 'string',
        description: '작업 결과물 (선택사항)',
        maxLength: 20000
      },
      work_type: {
        type: 'string',
        enum: ['memory', 'todo'],
        description: '작업 유형 (기본값: memory)',
        default: 'memory'
      },
      worked: {
        type: 'string',
        enum: ['완료', '미완료'],
        description: '작업 완료 상태 (선택사항)',
      }
    },
    required: ['content']
  }
};

export async function handleAddWorkMemory(args: AddWorkMemoryArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }
    
    const content = args.content.trim();
    if (content.length === 0) {
      throw new Error('작업 내용이 비어있습니다.');
    }

    const memoryId = generateMemoryId();
    const now = getCurrentISOString();
    const tags = args.tags || [];
    const project = args.project?.trim() || null;
    const importanceScore = args.importance_score ?? 50; // 기본값 50
    const createdBy = args.created_by || 'unknown';
    
    // 중요도 점수 유효성 검사
    if (importanceScore < 0 || importanceScore > 100) {
      throw new Error('중요도 점수는 0-100 범위여야 합니다.');
    }
    // 할일 관리 필드
    const context = args.context?.trim() || null;
    const requirements = args.requirements?.trim() || null;
    const resultContent = args.result_content?.trim() || null;
    const workType = args.work_type || 'memory';

    // worked 상태 결정 (자동 감지 또는 명시적 값)
    const worked = determineOptimalWorkedStatus(workType, resultContent, args.worked);

    // 할일 저장 시 context 선택사항 (반드시 필수이지 않음)
    // context는 배경 정보를 제공하지만 선택사항입니다.

    // 자동 서머리 생성
    const extractedContent = generateSummary(content, 200);

    // 1. 메인 메모리 INSERT - session_id는 나중에 업데이트
    await connection.run(`
      INSERT INTO work_memories (
        id, content, extracted_content, project, tags, importance_score, created_by,
        created_at, updated_at, access_count,
        context, requirements, result_content, work_type, worked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      memoryId,
      content,
      extractedContent,
      project,
      safeTagsStringify(tags),
      importanceScore,
      createdBy,
      now,
      now,
      0,
      context,
      requirements,
      resultContent,
      workType,
      worked
    ]);

    // 2. 태그별로 즉시 INSERT
    if (tags.length > 0) {
      for (const tag of tags) {
        await connection.run(`
          INSERT OR IGNORE INTO search_keywords (
            memory_id, keyword, source, weight
          ) VALUES (?, ?, ?, ?)
        `, [memoryId, tag, 'tags', 2.0]);
      }
    }

    // 3. extracted_content에서 키워드 추출하여 검색 인덱스에 추가
    if (extractedContent) {
      const extractedKeywords = extractKeywords(extractedContent);
      for (const keyword of extractedKeywords) {
        await connection.run(`
          INSERT OR IGNORE INTO search_keywords (
            memory_id, keyword, source, weight
          ) VALUES (?, ?, ?, ?)
        `, [memoryId, keyword, 'extracted', 1.5]);
      }
    }

    // 4. 프로젝트 인덱스 즉시 UPDATE
    if (project) {
      await connection.run(`
        INSERT OR REPLACE INTO project_index (
          project, memory_count, total_importance_score,
          most_recent_memory_date, most_active_creator, last_updated
        ) VALUES (?, 
          COALESCE((SELECT memory_count FROM project_index WHERE project = ?), 0) + 1,
          COALESCE((SELECT total_importance_score FROM project_index WHERE project = ?), 0) + ?,
          ?, ?, ?
        )
      `, [
        project, 
        project, 
        project, 
        importanceScore, // 실제 점수 사용
        now,
        createdBy,
        now
      ]);
    }

    // 5. 히스토리 즉시 INSERT
    const changeResult = await connection.run(`
      INSERT INTO change_history (
        memory_id, action, timestamp, details, new_data
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      memoryId,
      'created',
      now,
      'New memory created via MCP',
      safeStringify({ content, project, tags, importance_score: importanceScore, createdBy })
    ]);

    // 6. 초기 버전 생성 (설정이 활성화된 경우)
    try {
      const versioningEnabled = await connection.get(
        'SELECT value FROM system_settings WHERE key = ?',
        ['enable_versioning']
      );

      if (versioningEnabled && versioningEnabled.value === 'true') {
        const versionManager = new VersionManager(connection);
        const memoryData: WorkMemory = {
          id: memoryId,
          content,
          project: project || undefined,
          tags,
          created_at: now,
          updated_at: now,
          created_by: createdBy,
          access_count: 0,
          importance_score: importanceScore
        };

        await versionManager.createVersion(
          memoryId,
          memoryData,
          changeResult.lastInsertRowid as number,
          'Initial version - memory created'
        );
      }
    } catch (versionError) {
      // 버전 생성 실패는 메모리 생성을 방해하지 않음 (로그 제거)
    }

    // 세션 자동 연동 (세션 시스템이 활성화된 경우)
    let sessionLinkResult: { 
      success: boolean; 
      session_id?: string; 
      created_session?: boolean;
      session_name?: string;
      reused_session?: boolean;
      session_error?: string; // 디버깅용
      debug_info?: string; // 디버깅용
    } = { success: false };
    try {
      const { getSessionContext } = await import('../session/SessionContextManager.js');
      const { SessionMemoryLinker } = await import('../session/SessionMemoryLinker.js');
      
      const sessionContext = getSessionContext(connection);
      
      // 디버깅 정보 추가
      const autoLinkEnabled = sessionContext.isAutoLinkEnabled();
      sessionLinkResult.debug_info = `Auto-link enabled: ${autoLinkEnabled}`;
      
      if (sessionContext.isAutoLinkEnabled()) {
        const memoryLinker = new SessionMemoryLinker(connection);
        
        // 현재 활성 세션 확인 또는 자동 감지
        const currentSessionId = sessionContext.getCurrentSessionId();
        sessionLinkResult.debug_info += `, Current session: ${currentSessionId || 'none'}`;
        
        if (currentSessionId) {
          // 현재 세션에 직접 링크
          sessionLinkResult = await memoryLinker.autoLinkMemoryToSession(memoryId, currentSessionId, {
            reason: 'auto_link_on_save'
          });
          sessionLinkResult.session_id = currentSessionId;
          
          // 해삼씨 계획대로: session_id를 work_memories 테이블에 실제로 저장!
          if (sessionLinkResult.success) {
            await connection.run(
              'UPDATE work_memories SET session_id = ? WHERE id = ?',
              [currentSessionId, memoryId]
            );
            
            // 🚀 독점 관리자에게 세션 활동 알림 (같은 세션 연장)
            try {
              const { getExclusiveManager } = await import('../session/SessionExclusiveManager.js');
              const exclusiveManager = getExclusiveManager();
              if (exclusiveManager) {
                await exclusiveManager.extendSession(currentSessionId, 'memory_save');
              }
            } catch (exclusiveError) {
              console.warn('Failed to update exclusive session:', exclusiveError);
            }
          }
        } else {
          // 🚀 스마트 세션 자동 생성 및 링크 (내용 분석 기반)
          sessionLinkResult.debug_info += ', Calling smartAutoLinkToSession';
          const smartResult = await memoryLinker.smartAutoLinkToSession(memoryId, content, {
            project_name: project || undefined,
            project_path: process.cwd()
          });
          
          sessionLinkResult = {
            success: smartResult.success,
            session_id: smartResult.session_id,
            created_session: smartResult.created_session,
            session_name: smartResult.session_name,
            reused_session: smartResult.reused_session,
            debug_info: sessionLinkResult.debug_info + `, Smart result: ${JSON.stringify(smartResult)}`
          };
          
          // 해삼씨 계획대로: session_id를 work_memories 테이블에 실제로 저장!
          if (smartResult.success && smartResult.session_id) {
            await connection.run(
              'UPDATE work_memories SET session_id = ? WHERE id = ?',
              [smartResult.session_id, memoryId]
            );
            
            // 🚀 독점 관리자 호출은 이미 SessionMemoryLinker에서 처리됨
            // (activateSession이 smartAutoLinkToSession에서 호출됨)
          }
        }
      }
    } catch (sessionError) {
      // 세션 연동 실패는 메모리 생성을 방해하지 않음
      console.warn('Failed to link memory to session:', sessionError);
      // 디버깅을 위해 에러 메시지를 결과에 포함
      sessionLinkResult.session_error = sessionError instanceof Error ? sessionError.message : String(sessionError);
    }

    // 검색 인덱싱 처리
    try {
      const searchManager = new SearchManager();
      const workMemory: WorkMemory = {
        id: memoryId,
        content,
        tags,
        project: project || undefined,
        importance_score: importanceScore,
        created_at: now,
        updated_at: now,
        created_by: createdBy,
        access_count: 0
      };
      await searchManager.addToSearchIndex(workMemory);
    } catch (indexError) {
      // 인덱싱 실패는 메모리 생성을 방해하지 않음
      console.warn('Failed to create search index:', indexError);
    }

    const projectInfo = project ? ` (프로젝트: ${project})` : '';
    const tagsInfo = tags.length > 0 ? ` [태그: ${tags.join(', ')}]` : '';
    const typeIcon = workType === 'todo' ? '📋' : '💭';
    const typeText = workType === 'todo' ? '할일' : '메모리';
    
    // 중요도 레벨 표시
    const getImportanceLevel = (score: number): string => {
      if (score >= 90) return '🔥 매우높음';
      if (score >= 70) return '⭐ 높음';
      if (score >= 30) return '📌 보통';
      if (score >= 10) return '📝 낮음';
      return '💤 최소';
    };
    
    let result = `✅ 새로운 ${typeText}가 저장되었습니다.\n` +
                 `${typeIcon} 내용: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n` +
                 `📝 서머리: ${extractedContent}\n` +
                 `🆔 ID: ${memoryId}${tagsInfo}${projectInfo}\n` +
                 `⭐ 중요도: ${getImportanceLevel(importanceScore)} (${importanceScore}점)\n` +
                 `${getWorkedEmoji(worked)} 상태: ${getWorkedDisplayText(worked)}`;
    
    // 세션 연동 결과 추가
    if (sessionLinkResult.success && sessionLinkResult.session_id) {
      const sessionIcon = sessionLinkResult.created_session ? '🆕' : 
                          sessionLinkResult.reused_session ? '♾️' : '🔗';
      const sessionStatus = sessionLinkResult.created_session ? ' (새 세션 생성됨)' : 
                            sessionLinkResult.reused_session ? ' (기존 세션 재사용)' : '';
      const sessionName = sessionLinkResult.session_name ? ` [${sessionLinkResult.session_name}]` : '';
      result += `\n${sessionIcon} 세션 연동: ${sessionLinkResult.session_id.substring(0, 25)}...${sessionName}${sessionStatus}`;
    }
    
    // 디버깅 정보 대시 표시
    if (sessionLinkResult.debug_info || sessionLinkResult.session_error) {
      result += `\n🔍 세션 디버그: ${sessionLinkResult.debug_info || ''}`;
      if (sessionLinkResult.session_error) {
        result += ` | 에러: ${sessionLinkResult.session_error}`;
      }
    }
    
    if (context) {
      result += `\n📋 배경: ${context.substring(0, 50)}${context.length > 50 ? '...' : ''}`;
    }
    
    if (requirements) {
      result += `\n✅ 요구사항: ${requirements.substring(0, 50)}${requirements.length > 50 ? '...' : ''}`;
    }
    
    return result;
           
  } catch (error) {
    if (error instanceof Error) {
      return `❌ 메모리 저장 중 오류가 발생했습니다: ${error.message}`;
    }
    return '❌ 알 수 없는 오류가 발생했습니다.';
  }
} 