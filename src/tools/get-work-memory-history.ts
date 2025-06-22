import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FileSystemManager } from '../utils/index.js';
import { ChangeTracker } from '../history/change-tracker.js';
import { VersionManager } from '../history/version-manager.js';
import databaseManager from '../database/connection.js';
import { ChangeType, HistoryQuery } from '../history/types.js';
import { z } from 'zod';
import { WorkMemory } from '../types/memory.js';
import { ChangeLogEntry } from '../history/types.js';

/**
 * get_work_memory_history MCP 도구
 * 메모리 변경 이력 조회 및 검색 기능
 */

export interface GetWorkMemoryHistoryArgs {
  memory_id?: string;
  project?: string;
  change_type?: ChangeType | ChangeType[];
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
  include_versions?: boolean;
  format?: 'summary' | 'detailed' | 'timeline';
}

const getWorkMemoryHistoryArgs = z.object({
  id: z.string().describe('The ID of the work memory to get the history for.'),
});

const historyEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  changeType: z.string(),
  memory_id: z.string(),
  // Add other fields from ChangeLogEntry as needed
});

export const getWorkMemoryHistoryTool: Tool = {
  name: 'get_work_memory_history',
  description: 'Gets the change history for a specific work memory.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The ID of the work memory to get the history for.' },
    },
    required: ['id'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      history: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            timestamp: { type: 'string' },
            changeType: { type: 'string' },
            memory_id: { type: 'string' },
          },
        },
      },
    },
  },
  async execute(args: any): Promise<any> {
    const { id } = args;
    try {
      const db = databaseManager.getConnection();
      const history = await db.all(
        'SELECT * FROM change_history WHERE memory_id = ? ORDER BY timestamp DESC',
        [id]
      );
      return history as ChangeLogEntry[];
    } catch (error) {
      console.error(`Error getting history for memory ${id}:`, error);
      throw error;
    }
  },
};

export async function handleGetWorkMemoryHistory(args: GetWorkMemoryHistoryArgs): Promise<string> {
  try {
    const fsManager = new FileSystemManager();
    const changeTracker = new ChangeTracker(fsManager.getWorkMemoryDir());
    const connection = databaseManager.getConnection();
    const versionManager = new VersionManager(connection);

    // 쿼리 구성
    const query: HistoryQuery = {
      memoryId: args.memory_id,
      projectName: args.project,
      changeType: args.change_type,
      startDate: args.start_date ? normalizeDate(args.start_date) : undefined,
      endDate: args.end_date ? normalizeEndDate(args.end_date) : undefined,
      limit: args.limit || 50,
      offset: args.offset || 0
    };

    // 히스토리 조회
    const historyResult = await changeTracker.queryHistory(query);

    if (historyResult.entries.length === 0) {
      return generateEmptyResult(query);
    }

    // 버전 정보 포함 시 추가 조회
    let versionInfoMap = new Map();
    if (args.include_versions) {
      for (const entry of historyResult.entries) {
        if (entry.changeType === 'UPDATE') {
          try {
            const versions = await versionManager.getVersions(entry.memoryId, 5);
            versionInfoMap.set(entry.memoryId, versions);
          } catch (error) {
            // 버전 정보 조회 실패 시 무시
          }
        }
      }
    }

    // 형식에 따른 결과 생성
    switch (args.format) {
      case 'detailed':
        return generateDetailedResult(historyResult, versionInfoMap, query);
      case 'timeline':
        return generateTimelineResult(historyResult, versionInfoMap, query);
      default:
        return generateSummaryResult(historyResult, versionInfoMap, query);
    }

  } catch (error) {
    return `❌ 히스토리 조회 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}

/**
 * 날짜 정규화 (ISO 8601 형식으로 변환)
 */
function normalizeDate(dateStr: string): string {
  // 날짜만 있는 경우 시간 추가 (시작 시간)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr + 'T00:00:00.000Z';
  }
  
  // 시간이 있지만 Z가 없는 경우 추가
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    return dateStr + '.000Z';
  }
  
  return dateStr;
}

/**
 * 종료 날짜 정규화 (하루 끝 시간으로 설정)
 */
function normalizeEndDate(dateStr: string): string {
  // 날짜만 있는 경우 하루 끝 시간 추가
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr + 'T23:59:59.999Z';
  }
  
  // 시간이 있지만 Z가 없는 경우 추가
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    return dateStr + '.999Z';
  }
  
  return dateStr;
}

/**
 * 빈 결과 메시지 생성
 */
function generateEmptyResult(query: HistoryQuery): string {
  const filters: string[] = [];
  if (query.memoryId) filters.push(`메모리 ID: ${query.memoryId}`);
  if (query.projectName) filters.push(`프로젝트: ${query.projectName}`);
  if (query.changeType) filters.push(`변경 유형: ${Array.isArray(query.changeType) ? query.changeType.join(', ') : query.changeType}`);
  if (query.startDate) filters.push(`시작일: ${query.startDate.split('T')[0]}`);
  if (query.endDate) filters.push(`종료일: ${query.endDate.split('T')[0]}`);

  const filterText = filters.length > 0 ? `\n📋 적용된 필터: ${filters.join(', ')}` : '';
  
  return `📭 조건에 맞는 히스토리가 없습니다.${filterText}`;
}

/**
 * 요약 형식 결과 생성
 */
function generateSummaryResult(historyResult: any, versionInfoMap: Map<string, any>, query: HistoryQuery): string {
  const { entries, totalCount, hasMore } = historyResult;
  
  let result = `📊 메모리 변경 이력 요약\n`;
  result += `📈 총 ${totalCount}개 항목 중 ${entries.length}개 표시`;
  if (hasMore) result += ` (더 많은 결과 있음)`;
  result += `\n\n`;

  // 변경 유형별 통계
  const typeStats = entries.reduce((acc: any, entry: any) => {
    acc[entry.changeType] = (acc[entry.changeType] || 0) + 1;
    return acc;
  }, {});

  result += `📋 변경 유형별 통계:\n`;
  Object.entries(typeStats).forEach(([type, count]) => {
    const emoji = getChangeTypeEmoji(type);
    result += `   ${emoji} ${type}: ${count}개\n`;
  });

  result += `\n🕒 최근 활동:\n`;
  entries.slice(0, 10).forEach((entry: any, index: number) => {
    const emoji = getChangeTypeEmoji(entry.changeType);
    const time = new Date(entry.timestamp).toLocaleString('ko-KR');
    const projectInfo = entry.projectName ? ` [${entry.projectName}]` : '';
    result += `   ${index + 1}. ${emoji} ${entry.changeType} - ${entry.memoryId}${projectInfo}\n`;
    result += `      ${time} - ${entry.description || '설명 없음'}\n`;
  });

  if (hasMore) {
    result += `\n💡 더 많은 결과를 보려면 offset을 ${query.offset! + query.limit!}로 설정하세요.`;
  }

  return result;
}

/**
 * 상세 형식 결과 생성
 */
function generateDetailedResult(historyResult: any, versionInfoMap: Map<string, any>, query: HistoryQuery): string {
  const { entries, totalCount, hasMore } = historyResult;
  
  let result = `📋 메모리 변경 이력 상세 정보\n`;
  result += `📈 총 ${totalCount}개 항목 중 ${entries.length}개 표시\n\n`;

  entries.forEach((entry: any, index: number) => {
    const emoji = getChangeTypeEmoji(entry.changeType);
    const time = new Date(entry.timestamp).toLocaleString('ko-KR');
    
    result += `${index + 1}. ${emoji} ${entry.changeType} - ${entry.memoryId}\n`;
    result += `   🕒 시간: ${time}\n`;
    result += `   📝 설명: ${entry.description || '설명 없음'}\n`;
    
    if (entry.projectName) {
      result += `   📁 프로젝트: ${entry.projectName}\n`;
    }
    
    if (entry.metadata) {
      if (entry.metadata.source) result += `   🔧 소스: ${entry.metadata.source}\n`;
      if (entry.metadata.fileSize) result += `   📏 크기: ${entry.metadata.fileSize} bytes\n`;
      if (entry.metadata.tags && entry.metadata.tags.length > 0) {
        result += `   🏷️ 태그: ${entry.metadata.tags.join(', ')}\n`;
      }
    }

    // 변경 데이터 표시
    if (entry.beforeData || entry.afterData) {
      if (entry.beforeData && entry.afterData) {
        result += `   📊 변경 내용:\n`;
        const beforeContent = entry.beforeData.content?.substring(0, 50) || '';
        const afterContent = entry.afterData.content?.substring(0, 50) || '';
        if (beforeContent !== afterContent) {
          result += `      이전: ${beforeContent}${beforeContent.length >= 50 ? '...' : ''}\n`;
          result += `      이후: ${afterContent}${afterContent.length >= 50 ? '...' : ''}\n`;
        }
      } else if (entry.afterData) {
        const content = entry.afterData.content?.substring(0, 50) || '';
        result += `   📄 내용: ${content}${content.length >= 50 ? '...' : ''}\n`;
      }
    }

    // 버전 정보 표시
    if (versionInfoMap.has(entry.memoryId)) {
      const versions = versionInfoMap.get(entry.memoryId);
      result += `   🔄 버전: ${versions.length}개 (최신: ${versions[0]?.version || 'N/A'})\n`;
    }

    result += `\n`;
  });

  if (hasMore) {
    result += `💡 더 많은 결과를 보려면 offset을 ${query.offset! + query.limit!}로 설정하세요.\n`;
  }

  return result;
}

/**
 * 타임라인 형식 결과 생성
 */
function generateTimelineResult(historyResult: any, versionInfoMap: Map<string, any>, query: HistoryQuery): string {
  const { entries, totalCount } = historyResult;
  
  let result = `📅 메모리 변경 타임라인 (총 ${totalCount}개)\n\n`;

  // 날짜별로 그룹화
  const groupedByDate = entries.reduce((acc: any, entry: any) => {
    const date = entry.timestamp.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {});

  Object.entries(groupedByDate)
    .sort(([a], [b]) => b.localeCompare(a)) // 최신 날짜부터
    .forEach(([date, dayEntries]: [string, any]) => {
      result += `📆 ${date}\n`;
      
      dayEntries
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .forEach((entry: any) => {
          const emoji = getChangeTypeEmoji(entry.changeType);
          const time = new Date(entry.timestamp).toLocaleTimeString('ko-KR', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          const projectInfo = entry.projectName ? ` [${entry.projectName}]` : '';
          
          result += `   ${time} ${emoji} ${entry.changeType} - ${entry.memoryId}${projectInfo}\n`;
          if (entry.description) {
            result += `        ${entry.description}\n`;
          }
        });
      
      result += `\n`;
    });

  return result;
}

/**
 * 변경 유형별 이모지 반환
 */
function getChangeTypeEmoji(changeType: string): string {
  switch (changeType) {
    case 'CREATE': return '✨';
    case 'UPDATE': return '📝';
    case 'DELETE': return '🗑️';
    case 'ARCHIVE': return '📦';
    case 'RESTORE': return '🔄';
    default: return '📋';
  }
}