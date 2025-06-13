/**
 * 유틸리티 헬퍼 함수들
 */

/**
 * 고유한 메모리 ID 생성
 */
export function generateMemoryId(): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const random = Math.random().toString(36).substring(2, 8);
  return `mem_${timestamp}_${random}`;
}

/**
 * 텍스트에서 키워드 추출
 */
export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  // 한글, 영문, 숫자를 포함한 단어들 추출
  const words = text
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 2)
    .filter(word => !isStopWord(word));

  // 중복 제거 및 빈도순 정렬
  const wordFreq = new Map<string, number>();
  words.forEach(word => {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  });

  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * 불용어 체크 (한국어 + 영어)
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    // 영어 불용어
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
    
    // 한국어 불용어
    '그', '이', '저', '것', '들', '와', '과', '를', '을', '가', '이', '에', '의', '로', '으로',
    '에서', '부터', '까지', '보다', '처럼', '같이', '함께', '하고', '하지만', '그러나', '그리고',
    '또는', '또한', '그래서', '따라서', '그런데', '하지만', '만약', '만일', '수', '때', '동안',
    '중', '안', '밖', '위', '아래', '앞', '뒤', '좌', '우', '다른', '같은', '새로운'
  ]);
  
  return stopWords.has(word);
}

/**
 * 텍스트 유사도 계산 (간단한 자카드 유사도)
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(extractKeywords(text1, 50));
  const words2 = new Set(extractKeywords(text2, 50));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * 검색 점수 계산
 */
export function calculateSearchScore(
  query: string,
  content: string,
  tags: string[],
  project?: string,
  queryProject?: string
): number {
  let score = 0;
  const queryWords = extractKeywords(query);
  const contentWords = extractKeywords(content);
  
  // 완전 일치 검사
  queryWords.forEach(queryWord => {
    if (contentWords.includes(queryWord)) {
      score += 10; // exact_match_score
    } else if (contentWords.some(word => word.includes(queryWord) || queryWord.includes(word))) {
      score += 5; // partial_match_score
    }
  });
  
  // 태그 매칭
  tags.forEach(tag => {
    if (queryWords.includes(tag.toLowerCase())) {
      score += 3; // tag_match_score
    }
  });
  
  // 프로젝트 매칭 보너스
  if (project && queryProject && project.toLowerCase() === queryProject.toLowerCase()) {
    score += 5;
  }
  
  return score;
}

/**
 * 날짜 범위 필터링
 */
export function isWithinTimeRange(
  dateString: string,
  timeRange: 'today' | 'week' | 'month' | 'all'
): boolean {
  if (timeRange === 'all') return true;
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  switch (timeRange) {
    case 'today':
      return diffMs < 24 * 60 * 60 * 1000; // 24시간
    case 'week':
      return diffMs < 7 * 24 * 60 * 60 * 1000; // 7일
    case 'month':
      return diffMs < 30 * 24 * 60 * 60 * 1000; // 30일
    default:
      return true;
  }
}

/**
 * 관련도 등급 계산
 */
export function getRelevanceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 15) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

/**
 * 태그 데이터 정규화 함수들
 * 시스템 전체에서 태그 데이터 타입 일관성을 보장
 */

/**
 * 태그를 안전한 문자열 배열로 정규화
 * @param tags - 다양한 형태의 태그 데이터
 * @returns 정규화된 문자열 배열
 */
export function normalizeTags(tags: any): string[] {
  try {
    // null, undefined 처리
    if (!tags) return [];
    
    // 이미 배열인 경우
    if (Array.isArray(tags)) {
      return tags.filter(tag => typeof tag === 'string' && tag.trim().length > 0);
    }
    
    // 문자열인 경우
    if (typeof tags === 'string') {
      // 빈 문자열 처리
      if (tags.trim().length === 0) return [];
      
      // JSON 배열 문자열인 경우 파싱 시도
      if (tags.startsWith('[') && tags.endsWith(']')) {
        try {
          const parsed = JSON.parse(tags);
          if (Array.isArray(parsed)) {
            return parsed.filter(tag => typeof tag === 'string' && tag.trim().length > 0);
          }
        } catch {
          // JSON 파싱 실패 시 단일 태그로 처리
          return [tags];
        }
      }
      
      // 일반 문자열은 단일 태그로 처리
      return [tags];
    }
    
    // 기타 타입은 빈 배열 반환
    return [];
  } catch (error) {
    console.warn('Tag normalization failed:', error);
    return [];
  }
}

/**
 * 태그를 데이터베이스 저장용 JSON 문자열로 변환
 * @param tags - 태그 배열
 * @returns JSON 문자열
 */
export function serializeTags(tags: string[]): string {
  const normalizedTags = normalizeTags(tags);
  return JSON.stringify(normalizedTags);
}

/**
 * 데이터베이스에서 읽은 태그 데이터를 배열로 변환
 * @param tagsData - 데이터베이스에서 읽은 태그 데이터
 * @returns 정규화된 문자열 배열
 */
export function deserializeTags(tagsData: any): string[] {
  return normalizeTags(tagsData);
}

/**
 * 태그 데이터 검증
 * @param tags - 검증할 태그 데이터
 * @returns 유효성 검사 결과
 */
export function validateTags(tags: any): { isValid: boolean; normalizedTags: string[] } {
  const normalizedTags = normalizeTags(tags);
  const isValid = normalizedTags.length <= 20 && // 최대 20개 태그
                  normalizedTags.every(tag => tag.length <= 50); // 각 태그는 50자 이하
  
  return { isValid, normalizedTags };
}