/**
 * 한글 및 다국어 지원 안전한 JSON 처리 유틸리티
 * MCP 프로토콜에서 UTF-8 인코딩 문제 해결
 */

/**
 * 안전한 JSON 직렬화 - 한글 문자 처리 보장
 */
export function safeStringify(obj: any, pretty = false): string {
  try {
    // UTF-8 인코딩을 명시적으로 처리
    const jsonString = JSON.stringify(obj, null, pretty ? 2 : 0);
    
    // UTF-8 문자가 올바르게 인코딩되었는지 검증
    if (jsonString && typeof jsonString === 'string') {
      // 한글 문자가 포함된 경우 추가 검증
      if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(jsonString)) {
        // 한글 문자가 올바르게 인코딩되었는지 확인
        const testParse = JSON.parse(jsonString);
        if (testParse) {
          return jsonString;
        }
      } else {
        return jsonString;
      }
    }
    
    throw new Error('Data serialization produced invalid result');
  } catch (error) {
    // MCP 프로토콜 보호를 위해 로그 출력 제거
    
    // 폴백: 안전한 기본값 반환
    if (Array.isArray(obj)) {
      return '[]';
    } else if (obj && typeof obj === 'object') {
      return '{}';
    } else if (typeof obj === 'string') {
      // 문자열의 경우 안전하게 이스케이프
      return JSON.stringify(sanitizeString(obj));
    }
    
    return 'null';
  }
}

/**
 * 안전한 JSON 파싱 - 한글 문자 처리 보장
 */
export function safeParse<T = any>(jsonString: string, fallback: T): T {
  try {
    if (!jsonString || typeof jsonString !== 'string') {
      return fallback;
    }
    
    // 빈 문자열이나 null 문자열 처리
    const trimmed = jsonString.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
      return fallback;
    }
    
    // UTF-8 BOM 제거 (혹시 있다면)
    const cleaned = trimmed.replace(/^\uFEFF/, '');
    
    const parsed = JSON.parse(cleaned);
    
    // 파싱 결과 검증
    if (parsed === null || parsed === undefined) {
      return fallback;
    }
    
    return parsed as T;
  } catch (error) {
    // MCP 프로토콜 보호를 위해 로그 출력 제거
    return fallback;
  }
}

/**
 * 문자열 안전화 - 제어 문자 및 문제 문자 제거
 */
export function sanitizeString(str: string): string {
  if (typeof str !== 'string') {
    return String(str || '');
  }
  
  return str
    // 제어 문자 제거 (단, 개행 문자는 유지)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // UTF-8 BOM 제거
    .replace(/^\uFEFF/, '')
    // 연속된 공백 정리
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 태그 배열 안전 처리
 */
export function safeTagsStringify(tags: string[]): string {
  try {
    if (!Array.isArray(tags)) {
      return '[]';
    }
    
    // 각 태그를 안전하게 정화
    const safeTags = tags
      .filter(tag => tag && typeof tag === 'string')
      .map(tag => sanitizeString(tag))
      .filter(tag => tag.length > 0);
    
    return safeStringify(safeTags);
  } catch (error) {
    // MCP 프로토콜 보호를 위해 로그 출력 제거
    return '[]';
  }
}

/**
 * 태그 배열 안전 파싱
 */
export function safeTagsParse(tagsJson: string): string[] {
  try {
    const parsed = safeParse<string[]>(tagsJson, []);
    
    if (!Array.isArray(parsed)) {
      return [];
    }
    
    return parsed
      .filter(tag => tag && typeof tag === 'string')
      .map(tag => sanitizeString(tag))
      .filter(tag => tag.length > 0);
  } catch (error) {
    // MCP 프로토콜 보호를 위해 로그 출력 제거
    return [];
  }
}

/**
 * MCP 응답용 안전한 텍스트 처리
 */
export function safeMcpText(text: string): string {
  if (typeof text !== 'string') {
    return String(text || '');
  }
  
  return sanitizeString(text)
    // MCP 프로토콜에서 문제가 될 수 있는 패턴 제거
    .replace(/[\r\n]+/g, ' ')  // 개행을 공백으로 변환
    .replace(/["']/g, '"')     // 따옴표 통일
    .slice(0, 50000);          // 길이 제한
}

/**
 * 데이터베이스 저장용 안전한 JSON 처리
 */
export function safeDbJson(obj: any): string {
  const serialized = safeStringify(obj);
  
  // 데이터베이스 저장 시 문제가 될 수 있는 문자 처리
  return serialized
    .replace(/\\/g, '\\\\')    // 백슬래시 이스케이프
    .replace(/'/g, "''");      // 단일 따옴표 이스케이프
}

/**
 * WorkMemory 타입 가드 - 유효한 WorkMemory 객체인지 확인
 */
export function isValidWorkMemory(data: any): data is import('../types/memory.js').WorkMemory {
  return data && 
         typeof data === 'object' && 
         typeof data.id === 'string' &&
         typeof data.content === 'string' &&
         Array.isArray(data.tags) &&
         typeof data.created_at === 'string' &&
         typeof data.updated_at === 'string';
}

/**
 * 안전한 WorkMemory 추출 - 타입 가드 포함
 */
export function extractSafeWorkMemory(data: any, fallback: import('../types/memory.js').WorkMemory): import('../types/memory.js').WorkMemory {
  if (isValidWorkMemory(data)) {
    return data;
  }
  
  // 부분적으로라도 유효한 데이터가 있으면 병합
  if (data && typeof data === 'object' && !data.error) {
    return {
      ...fallback,
      ...Object.fromEntries(
        Object.entries(data).filter(([key, value]) => 
          value !== undefined && value !== null
        )
      )
    };
  }
  
  return fallback;
}