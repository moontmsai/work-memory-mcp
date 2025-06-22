import { z } from 'zod';
import { 
  handleAddWorkMemory, 
  AddWorkMemoryArgs 
} from './add-work-memory.js';
import { 
  handleUpdateWorkMemory, 
  UpdateWorkMemoryArgs 
} from './update-work-memory.js';
import { 
  handleListWorkMemories, 
  ListWorkMemoriesArgs 
} from './list-work-memories.js';
import { 
  handleDeleteWorkMemory, 
  DeleteWorkMemoryArgs 
} from './delete-work-memory.js';

// 통합 메모리 작업 스키마
const MemoryOperationSchema = z.object({
  operation: z.enum(['add', 'update', 'list', 'delete']),
  
  // add 작업용 필드
  content: z.string().optional(),
  project: z.string().optional(),
  tags: z.array(z.string()).optional(),
  importance_score: z.number().min(0).max(10).optional(),
  context: z.string().optional(),
  requirements: z.string().optional(),
  result_content: z.string().optional(),
  work_type: z.enum(['memory', 'todo']).optional(),
  worked: z.enum(['완료', '미완료']).optional(),
  auto_link: z.boolean().optional(),
  
  // update 작업용 필드
  id: z.string().optional(),
  updates: z.object({
    content: z.string().optional(),
    project: z.string().optional(),
    tags: z.array(z.string()).optional(),
    importance_score: z.number().min(0).max(10).optional(),
    context: z.string().optional(),
    requirements: z.string().optional(),
    result_content: z.string().optional(),
    work_type: z.enum(['memory', 'todo']).optional(),
    worked: z.enum(['완료', '미완료']).optional()
  }).optional(),
  version_comment: z.string().optional(),
  auto_version: z.boolean().optional(),
  
  // list 작업용 필드
  project_filter: z.string().optional(),
  tag_filter: z.array(z.string()).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  importance_min: z.number().min(0).max(10).optional(),
  worked_filter: z.boolean().optional(),
  work_type_filter: z.array(z.enum(['memory', 'todo'])).optional(),
  sort_by: z.enum(['date', 'importance', 'updated']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  limit: z.number().positive().optional(),
  offset: z.number().min(0).optional(),
  format: z.enum(['simple', 'detailed', 'id_only']).optional(),
  session_id: z.string().optional(),
  include_archived: z.boolean().optional(),
  
  // delete 작업용 필드
  force: z.boolean().optional()
});

export type MemoryOperationArgs = z.infer<typeof MemoryOperationSchema>;

export const memoryTool = {
  name: 'memory',
  description: `통합 메모리 관리 도구 - 작업 메모리의 생성, 수정, 조회, 삭제를 수행합니다.

사용법:
1. 추가: { "operation": "add", "content": "...", "project": "...", "tags": [...] }
2. 수정: { "operation": "update", "id": "...", "updates": { ... } }
3. 조회: { "operation": "list", "project_filter": "...", "limit": 10 }
4. 삭제: { "operation": "delete", "id": "...", "force": false }

각 작업별 상세 옵션:
- add: content(필수), project, tags, importance_score, context, requirements, result_content, work_type, worked, auto_link
- update: id(필수), updates(필수), version_comment, auto_version
- list: project_filter, tag_filter, date_from/to, importance_min, worked_filter, work_type_filter, sort_by/order, limit/offset, format, session_id, include_archived
- delete: id(필수), force`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['add', 'update', 'list', 'delete'],
        description: '수행할 작업: add(추가), update(수정), list(조회), delete(삭제)'
      },
      
      // 공통 필드
      id: {
        type: 'string',
        description: '메모리 ID (update, delete 작업에 필요)'
      },
      
      // add 작업 필드
      content: {
        type: 'string',
        description: '메모리 내용 (add 작업에 필수)'
      },
      project: {
        type: 'string',
        description: '프로젝트 이름'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '태그 목록'
      },
      importance_score: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        description: '중요도 점수 (0-10)'
      },
      context: {
        type: 'string',
        description: '작업 컨텍스트'
      },
      requirements: {
        type: 'string',
        description: '작업 요구사항'
      },
      result_content: {
        type: 'string',
        description: '작업 결과'
      },
      work_type: {
        type: 'string',
        enum: ['memory', 'todo'],
        description: '작업 유형'
      },
      worked: {
        type: 'string',
        enum: ['완료', '미완료'],
        description: '완료 여부'
      },
      auto_link: {
        type: 'boolean',
        description: '활성 세션에 자동 연결'
      },
      
      // update 작업 필드
      updates: {
        type: 'object',
        description: '업데이트할 필드들 (update 작업에 필수)'
      },
      version_comment: {
        type: 'string',
        description: '버전 코멘트'
      },
      auto_version: {
        type: 'boolean',
        description: '자동 버전 생성'
      },
      
      // list 작업 필드
      project_filter: {
        type: 'string',
        description: '프로젝트 필터'
      },
      tag_filter: {
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
        description: '최소 중요도'
      },
      worked_filter: {
        type: 'string',
        enum: ['완료', '미완료'],
        description: '완료 여부 필터'
      },
      work_type_filter: {
        type: 'array',
        items: { 
          type: 'string',
          enum: ['memory', 'todo']
        },
        description: '작업 유형 필터'
      },
      sort_by: {
        type: 'string',
        enum: ['date', 'importance', 'updated'],
        description: '정렬 기준'
      },
      sort_order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: '정렬 순서'
      },
      limit: {
        type: 'number',
        description: '결과 개수 제한'
      },
      offset: {
        type: 'number',
        description: '결과 오프셋'
      },
      format: {
        type: 'string',
        enum: ['simple', 'detailed', 'id_only'],
        description: '출력 형식'
      },
      session_id: {
        type: 'string',
        description: '세션 ID 필터'
      },
      include_archived: {
        type: 'boolean',
        description: '아카이브 포함 여부'
      },
      
      // delete 작업 필드
      force: {
        type: 'boolean',
        description: '강제 삭제 (연결된 데이터도 삭제)'
      }
    },
    required: ['operation']
  }
};

export async function handleMemory(args: MemoryOperationArgs): Promise<string> {
  const { operation } = args;

  switch (operation) {
    case 'add': {
      // add 작업에 필요한 필드만 추출
      const addArgs: AddWorkMemoryArgs = {
        content: args.content!,
        project: args.project,
        tags: args.tags,
        importance_score: args.importance_score,
        context: args.context,
        requirements: args.requirements,
        result_content: args.result_content,
        work_type: args.work_type,
        worked: args.worked,
        // auto_link 필드는 AddWorkMemoryArgs에 없으므로 제거
      };
      return handleAddWorkMemory(addArgs);
    }
    
    case 'update': {
      if (!args.id) throw new Error('update 작업에는 id가 필수입니다');
      if (!args.updates) throw new Error('update 작업에는 updates가 필수입니다');
      
      const updateArgs: UpdateWorkMemoryArgs = {
        memory_id: args.id!,
        content: args.updates?.content,
        project: args.updates?.project,
        tags: args.updates?.tags,
        importance: args.updates?.importance_score ? 
          args.updates.importance_score >= 70 ? 'high' : 
          args.updates.importance_score >= 40 ? 'medium' : 'low' : undefined,
        context: args.updates?.context,
        requirements: args.updates?.requirements,
        result_content: args.updates?.result_content,
        work_type: args.updates?.work_type,
        worked: args.updates?.worked,
        // create_version 필드는 UpdateWorkMemoryArgs에 없음
        version_description: args.version_comment
      };
      return handleUpdateWorkMemory(updateArgs);
    }
    
    case 'list': {
      const listArgs: ListWorkMemoriesArgs = {
        project: args.project_filter,
        tags: args.tag_filter,
        // date_from/date_to 필드는 ListWorkMemoriesArgs에 없음
        // time_range로 대체
        // importance_min 필드는 ListWorkMemoriesArgs에 없음
        worked: args.worked_filter === true ? '완료' : args.worked_filter === false ? '미완료' : undefined,
        work_type: Array.isArray(args.work_type_filter) ? args.work_type_filter[0] : args.work_type_filter,
        sort_by: args.sort_by === 'importance' ? 'importance_score' :
                args.sort_by === 'date' ? 'created_at' :
                args.sort_by === 'updated' ? 'updated_at' : undefined,
        sort_order: args.sort_order,
        limit: args.limit,
        offset: args.offset,
        // format 필드는 ListWorkMemoriesArgs에 없음
        session_id: args.session_id,
        // include_archived 필드는 ListWorkMemoriesArgs에 없음
      };
      return handleListWorkMemories(listArgs);
    }
    
    case 'delete': {
      if (!args.id) throw new Error('delete 작업에는 id가 필수입니다');
      
      const deleteArgs: DeleteWorkMemoryArgs = {
        id: args.id,
        // force 필드는 DeleteWorkMemoryArgs에 없으므로 제거
      };
      return handleDeleteWorkMemory(deleteArgs);
    }
    
    default:
      throw new Error(`알 수 없는 작업: ${operation}`);
  }
}