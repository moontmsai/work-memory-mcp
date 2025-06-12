import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';
import { getCurrentISOString } from '../utils/index.js';
import { VersionManager } from '../history/version-manager.js';
import { WorkMemory } from '../types/memory.js';

export interface UpdateWorkMemoryArgs {
  memory_id: string;
  content?: string;
  project?: string;
  tags?: string[];
  importance?: 'high' | 'medium' | 'low';
  updated_by?: string;
  create_version?: boolean;
  version_description?: string;
  // 할일 관리 확장 필드
  context?: string;
  requirements?: string;
  result_content?: string;
  work_type?: 'memory' | 'todo';
}

export const updateWorkMemoryTool: Tool = {
  name: 'update_work_memory',
  description: '기존 메모리의 내용을 업데이트합니다. 할일 완료 시 content(작업요약)와 result_content(결과물)를 함께 업데이트하세요.',
  inputSchema: {
    type: 'object',
    properties: {
      memory_id: {
        type: 'string',
        description: '업데이트할 메모리의 ID',
        minLength: 1
      },
      content: {
        type: 'string',
        description: '새로운 내용 (선택사항)',
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
      importance: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: '중요도 (선택사항)'
      },
      updated_by: {
        type: 'string',
        description: '업데이트한 사용자',
        default: 'unknown'
      },
      create_version: {
        type: 'boolean',
        description: '새 버전 생성 여부 (기본값: true)',
        default: true
      },
      version_description: {
        type: 'string',
        description: '버전 설명 (선택사항)',
        maxLength: 200
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
        description: '작업 유형 (선택사항)'
      }
    },
    required: ['memory_id']
  }
};

export async function handleUpdateWorkMemory(args: UpdateWorkMemoryArgs): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    // 1. 기존 메모리 조회
    const existingMemory = await connection.get(
      'SELECT * FROM work_memories WHERE id = ? AND is_archived = 0',
      [args.memory_id]
    );

    if (!existingMemory) {
      return `❌ ID '${args.memory_id}'인 메모리를 찾을 수 없습니다.`;
    }

    // 2. 업데이트할 필드들 준비
    const now = getCurrentISOString();
    const updatedBy = args.updated_by || 'unknown';
    
    // 변경사항 추적을 위한 기존 데이터
    const oldData: WorkMemory = {
      id: existingMemory.id,
      content: existingMemory.content,
      project: existingMemory.project,
      tags: JSON.parse(existingMemory.tags || '[]'),
      created_at: existingMemory.created_at,
      updated_at: existingMemory.updated_at,
      created_by: existingMemory.created_by,
      access_count: existingMemory.access_count,
      importance_score: existingMemory.importance_score
    };

    // 업데이트 데이터 준비
    const updates: any = {
      updated_at: now
    };

    let hasChanges = false;
    const changes: string[] = [];

    // 내용 업데이트
    if (args.content !== undefined && args.content.trim() !== existingMemory.content) {
      updates.content = args.content.trim();
      hasChanges = true;
      changes.push('내용 변경');
    }

    // 프로젝트 업데이트
    if (args.project !== undefined && args.project !== existingMemory.project) {
      updates.project = args.project.trim() || null;
      hasChanges = true;
      changes.push('프로젝트 변경');
    }

    // 중요도 업데이트
    if (args.importance !== undefined && args.importance !== existingMemory.importance) {
      updates.importance = args.importance;
      hasChanges = true;
      changes.push('중요도 변경');
    }

    // 할일 관리 필드 업데이트
    if (args.context !== undefined && args.context.trim() !== (existingMemory.context || '')) {
      updates.context = args.context.trim() || null;
      hasChanges = true;
      changes.push('배경정보 변경');
    }

    if (args.requirements !== undefined && args.requirements.trim() !== (existingMemory.requirements || '')) {
      updates.requirements = args.requirements.trim() || null;
      hasChanges = true;
      changes.push('요구사항 변경');
    }

    if (args.result_content !== undefined && args.result_content.trim() !== (existingMemory.result_content || '')) {
      updates.result_content = args.result_content.trim() || null;
      hasChanges = true;
      changes.push('결과물 변경');
    }

    if (args.work_type !== undefined && args.work_type !== existingMemory.work_type) {
      updates.work_type = args.work_type;
      hasChanges = true;
      changes.push('작업유형 변경');
    }

    // 🔧 할일 완료 처리 및 태그 업데이트 로직 통합
    const isToDoCompletion = existingMemory.work_type === 'todo' && 
                            args.result_content !== undefined && 
                            args.result_content.trim().length > 0 &&
                            args.content !== undefined && 
                            args.content.trim().length > 0;
    
    if (isToDoCompletion) {
      // 할일 완료 시 자동으로 '완료한작업' 태그 설정
      const newTagsJson = JSON.stringify(['완료한작업']);
      if (newTagsJson !== existingMemory.tags) {
        updates.tags = newTagsJson;
        hasChanges = true;
        changes.push('태그 변경 (할일 완료 자동 처리)');
      }
    } else if (args.tags !== undefined) {
      // 그 외 모든 경우 (일반 메모리 업데이트, 미완료 할일 태그 변경 등)
      const newTagsJson = JSON.stringify(args.tags);
      if (newTagsJson !== existingMemory.tags) {
        updates.tags = newTagsJson;
        hasChanges = true;
        changes.push('태그 변경');
      }
    }

    if (!hasChanges) {
      return '📝 변경된 내용이 없습니다.';
    }

    // 3. 메모리 업데이트
    const updateFields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const updateValues = Object.values(updates);
    
    await connection.run(
      `UPDATE work_memories SET ${updateFields} WHERE id = ?`,
      [...updateValues, args.memory_id]
    );

    // 4. 변경 히스토리 기록
    const changeResult = await connection.run(`
      INSERT INTO change_history (
        memory_id, action, timestamp, details, old_data, new_data
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      args.memory_id,
      'updated',
      now,
      `Memory updated via MCP: ${changes.join(', ')}`,
      JSON.stringify(oldData),
      JSON.stringify({ ...oldData, ...updates })
    ]);

    // 5. 태그 인덱스 업데이트 (태그가 변경된 경우)
    if (updates.tags !== undefined) {
      // 기존 태그 키워드 삭제
      await connection.run(
        'DELETE FROM search_keywords WHERE memory_id = ? AND source = ?',
        [args.memory_id, 'tags']
      );

      // 새 태그 키워드 추가
      const newTags = JSON.parse(updates.tags);
      for (const tag of newTags) {
        await connection.run(`
          INSERT OR IGNORE INTO search_keywords (
            memory_id, keyword, source, weight
          ) VALUES (?, ?, ?, ?)
        `, [args.memory_id, tag, 'tags', 2.0]);
      }
    }

    // 6. 프로젝트 인덱스 업데이트 (프로젝트가 변경된 경우)
    if (updates.project !== undefined) {
      // 기존 프로젝트에서 카운트 감소
      if (existingMemory.project) {
        await connection.run(`
          UPDATE project_index 
          SET memory_count = memory_count - 1,
              last_updated = ?
          WHERE project = ?
        `, [now, existingMemory.project]);
      }

      // 새 프로젝트에 카운트 증가
      if (updates.project) {
        const importanceScore = updates.importance === 'high' ? 3 : 
                              updates.importance === 'medium' ? 2 : 1;
        
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
          updates.project,
          updates.project,
          updates.project,
          importanceScore,
          now,
          updatedBy,
          now
        ]);
      }
    }

    // 7. 자동 버전 생성 (설정이 활성화된 경우)
    let versionInfo = '';
    if (args.create_version !== false) {
      try {
        const autoVersionEnabled = await connection.get(
          'SELECT value FROM system_settings WHERE key = ?',
          ['auto_version_on_update']
        );

        const versioningEnabled = await connection.get(
          'SELECT value FROM system_settings WHERE key = ?',
          ['enable_versioning']
        );

        if (versioningEnabled && versioningEnabled.value === 'true' && 
            autoVersionEnabled && autoVersionEnabled.value === 'true') {
          
          const versionManager = new VersionManager(connection);
          const updatedMemoryData: WorkMemory = { ...oldData, ...updates };
          
          const version = await versionManager.createVersion(
            args.memory_id,
            updatedMemoryData,
            changeResult.lastInsertRowid as number,
            args.version_description || `Updated: ${changes.join(', ')}`
          );

          versionInfo = `\n🔄 새 버전 생성: ${version.version}`;
        }
      } catch (versionError) {
        // 버전 생성 실패는 업데이트를 방해하지 않음
        console.warn('Failed to create version during update:', versionError);
        versionInfo = '\n⚠️ 버전 생성 실패 (업데이트는 완료됨)';
      }
    }

    // 세션 연동 상태 업데이트 (세션 시스템이 활성화된 경우)
    let sessionUpdateInfo = '';
    try {
      const { getSessionContext } = await import('../session/SessionContextManager.js');
      const { SessionMemoryLinker } = await import('../session/SessionMemoryLinker.js');
      
      const sessionContext = getSessionContext(connection);
      
      if (sessionContext.isAutoLinkEnabled()) {
        const currentSessionId = sessionContext.getCurrentSessionId();
        
        if (currentSessionId && !oldData.session_id) {
          // 현재 활성 세션이 있고 메모리가 아직 연결되지 않은 경우 자동 연결
          const memoryLinker = new SessionMemoryLinker(connection);
          const linkResult = await memoryLinker.autoLinkMemoryToSession(args.memory_id, currentSessionId, {
            reason: 'auto_link_on_update'
          });
          
          if (linkResult.success) {
            sessionUpdateInfo = `\n🔗 세션 연동: ${currentSessionId.substring(0, 20)}...`;
          }
        } else if (oldData.session_id && currentSessionId && oldData.session_id !== currentSessionId) {
          // 활성 세션이 변경된 경우 세션 업데이트
          await connection.query(
            'UPDATE work_memories SET session_id = ?, updated_at = ? WHERE id = ?',
            [currentSessionId, new Date().toISOString(), args.memory_id]
          );
          sessionUpdateInfo = `\n🔄 세션 변경: ${currentSessionId.substring(0, 20)}...`;
        }
      }
    } catch (sessionError) {
      // 세션 연동 실패는 업데이트를 방해하지 않음
      console.warn('Failed to update session link:', sessionError);
    }

    // 8. 응답 생성
    const changesList = changes.map(change => `• ${change}`).join('\n');
    return `✅ 메모리가 성공적으로 업데이트되었습니다.\n` +
           `🆔 ID: ${args.memory_id}\n` +
           `📝 변경사항:\n${changesList}${versionInfo}${sessionUpdateInfo}`;

  } catch (error) {
    if (error instanceof Error) {
      return `❌ 메모리 업데이트 중 오류가 발생했습니다: ${error.message}`;
    }
    return '❌ 알 수 없는 오류가 발생했습니다.';
  }
} 