import { WorkMemory } from '../types/memory.js';

/**
 * 히스토리 및 버전 관리 관련 타입 정의
 */

export interface ChangeLogEntry {
  id: string;                    // 변경 로그 고유 ID
  timestamp: string;             // ISO 8601 timestamp
  changeType: ChangeType;        // 변경 유형
  memoryId: string;             // 대상 메모리 ID
  projectName?: string;          // 프로젝트명
  beforeData?: any;              // 변경 전 데이터
  afterData?: any;               // 변경 후 데이터
  userId?: string;               // 변경자 (추후 확장용)
  description?: string;          // 변경 설명
  metadata?: ChangeMetadata;     // 추가 메타데이터
}

export type ChangeType = 
  | 'CREATE'      // 메모리 생성
  | 'UPDATE'      // 메모리 수정
  | 'DELETE'      // 메모리 삭제
  | 'ARCHIVE'     // 메모리 아카이브
  | 'RESTORE';    // 메모리 복원

export interface ChangeMetadata {
  fileSize?: number;             // 파일 크기 (바이트)
  version?: string;              // 버전 번호
  tags?: string[];               // 변경된 태그들
  importance?: number;           // 중요도 변화
  source?: string;               // 변경 소스 (Cursor, Claude 등)
  aiExtracted?: boolean;         // AI 자동 추출 여부
  extractionSummary?: string;    // AI 추출 요약
}

export interface HistoryQuery {
  startDate?: string;            // 시작 날짜 (ISO 8601)
  endDate?: string;              // 종료 날짜 (ISO 8601)
  projectName?: string;          // 프로젝트 필터
  changeType?: ChangeType | ChangeType[]; // 변경 유형 필터
  memoryId?: string;             // 특정 메모리 ID
  limit?: number;                // 결과 개수 제한
  offset?: number;               // 페이지네이션 오프셋
}

export interface HistorySearchResult {
  entries: ChangeLogEntry[];     // 히스토리 엔트리들
  totalCount: number;            // 전체 결과 수
  hasMore: boolean;              // 더 많은 결과 존재 여부
}

export interface VersionInfo {
  version: string;
  timestamp: string;
  changeLogId?: number;
  memoryId: string;
  data: WorkMemory;
  size: number;
  description?: string;
}

export interface VersionQuery {
  memoryId: string;              // 조회할 메모리 ID
  version?: string;              // 특정 버전 (없으면 모든 버전)
  limit?: number;                // 결과 개수 제한
}

export interface VersionComparisonResult {
  memoryId: string;
  fromVersion: string;
  toVersion: string;
  differences: VersionDifference[];
  summary: {
    additions: number;
    deletions: number;
    modifications: number;
  };
}

export interface VersionDifference {
  field: string;                 // 변경된 필드명
  type: 'added' | 'removed' | 'modified';
  oldValue?: any;               // 이전 값
  newValue?: any;               // 새로운 값
  path?: string;                // JSON path (중첩 객체용)
}