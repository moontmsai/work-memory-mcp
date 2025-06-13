/**
 * worked 필드 관련 유틸리티 함수들
 * 기본값 설정 및 자동 감지 로직
 */

/**
 * work_type에 따른 기본 worked 상태 반환
 */
export function getDefaultWorked(workType: 'memory' | 'todo'): '완료' | '미완료' {
  return workType === 'memory' ? '완료' : '미완료';
}

/**
 * result_content 유무에 따른 완료 상태 자동 감지
 */
export function detectCompletionStatus(resultContent?: string): '완료' | '미완료' {
  return resultContent && resultContent.trim().length > 0 ? '완료' : '미완료';
}

/**
 * worked 상태 검증
 */
export function isValidWorkedStatus(worked: string): worked is '완료' | '미완료' {
  return worked === '완료' || worked === '미완료';
}

/**
 * 작업 타입과 내용을 바탕으로 최적의 worked 상태 결정
 */
export function determineOptimalWorkedStatus(
  workType: 'memory' | 'todo',
  resultContent?: string,
  explicitWorked?: '완료' | '미완료'
): '완료' | '미완료' {
  // 명시적 worked 값이 있으면 우선 적용
  if (explicitWorked) {
    return explicitWorked;
  }
  
  // result_content가 있으면 완료로 간주
  if (resultContent && resultContent.trim().length > 0) {
    return '완료';
  }
  
  // 기본값 적용
  return getDefaultWorked(workType);
}

/**
 * worked 상태에 따른 이모지 반환
 */
export function getWorkedEmoji(worked: '완료' | '미완료'): string {
  return worked === '완료' ? '✅' : '⏳';
}

/**
 * worked 상태에 따른 한국어 표시
 */
export function getWorkedDisplayText(worked: '완료' | '미완료'): string {
  return worked === '완료' ? '완료됨' : '진행중';
}
