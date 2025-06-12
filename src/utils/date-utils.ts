/**
 * 날짜 처리 유틸리티
 */

/**
 * 현재 시간을 ISO 문자열로 반환
 */
export function getCurrentISOString(): string {
  return new Date().toISOString();
}

/**
 * 날짜를 사람이 읽기 쉬운 형태로 포맷
 */
export function formatHumanReadableDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    // 1분 미만
    if (diffMs < 60 * 1000) {
      return '방금 전';
    }
    
    // 1시간 미만
    if (diffMs < 60 * 60 * 1000) {
      const minutes = Math.floor(diffMs / (60 * 1000));
      return `${minutes}분 전`;
    }
    
    // 24시간 미만
    if (diffMs < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diffMs / (60 * 60 * 1000));
      return `${hours}시간 전`;
    }
    
    // 7일 미만
    if (diffMs < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      return `${days}일 전`;
    }
    
    // 그 이후는 날짜 표시
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    return '알 수 없음';
  }
}

/**
 * 두 날짜 사이의 차이를 계산 (밀리초)
 */
export function getTimeDifference(date1: string, date2: string): number {
  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.abs(d2.getTime() - d1.getTime());
  } catch (error) {
    return 0;
  }
}

/**
 * 날짜가 특정 기간 내에 있는지 확인
 */
export function isWithinDays(isoString: string, days: number): boolean {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const daysMs = days * 24 * 60 * 60 * 1000;
    
    return diffMs >= 0 && diffMs <= daysMs;
  } catch (error) {
    return false;
  }
}

/**
 * 특정 날짜 이후의 날짜인지 확인
 */
export function isAfterDate(isoString: string, afterDate: string): boolean {
  try {
    const date = new Date(isoString);
    const after = new Date(afterDate);
    return date.getTime() > after.getTime();
  } catch (error) {
    return false;
  }
}

/**
 * 특정 날짜 이전의 날짜인지 확인
 */
export function isBeforeDate(isoString: string, beforeDate: string): boolean {
  try {
    const date = new Date(isoString);
    const before = new Date(beforeDate);
    return date.getTime() < before.getTime();
  } catch (error) {
    return false;
  }
}

/**
 * 오늘 날짜 문자열 반환 (YYYY-MM-DD)
 */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 날짜를 파일명 안전한 형태로 변환
 */
export function toFilenameSafeDate(isoString?: string): string {
  const date = isoString ? new Date(isoString) : new Date();
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
}

/**
 * 시간대별 작업 패턴 분석용 시간 추출
 */
export function getHourOfDay(isoString: string): number {
  try {
    return new Date(isoString).getHours();
  } catch (error) {
    return 0;
  }
}

/**
 * 요일 추출 (0: 일요일, 1: 월요일, ...)
 */
export function getDayOfWeek(isoString: string): number {
  try {
    return new Date(isoString).getDay();
  } catch (error) {
    return 0;
  }
}

/**
 * 월 추출 (0: 1월, 1: 2월, ...)
 */
export function getMonth(isoString: string): number {
  try {
    return new Date(isoString).getMonth();
  } catch (error) {
    return 0;
  }
}

/**
 * 두 날짜가 같은 날인지 확인
 */
export function isSameDay(date1: string, date2: string): boolean {
  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  } catch (error) {
    return false;
  }
}

/**
 * 날짜 배열을 시간순으로 정렬
 */
export function sortByDate(items: { created_at: string }[], ascending: boolean = false): typeof items {
  return [...items].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    
    return ascending ? dateA - dateB : dateB - dateA;
  });
}

/**
 * 날짜 범위 내의 항목들 필터링
 */
export function filterByDateRange<T extends { created_at: string }>(
  items: T[],
  startDate?: string,
  endDate?: string
): T[] {
  return items.filter(item => {
    try {
      const itemDate = new Date(item.created_at);
      
      if (startDate && itemDate < new Date(startDate)) {
        return false;
      }
      
      if (endDate && itemDate > new Date(endDate)) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  });
}

/**
 * ISO 문자열에서 로케일 시간 추출
 */
export function toLocalTimeString(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return '00:00';
  }
}

/**
 * ISO 문자열에서 로케일 날짜 추출
 */
export function toLocalDateString(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch (error) {
    return '1970.01.01';
  }
}