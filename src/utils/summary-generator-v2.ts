/**
 * 향상된 서머리 생성 함수 v2
 * 개선사항: 
 * - 중요 키워드 보존
 * - 기술적 내용 처리 개선  
 * - 구조화된 내용 인식
 * - 숫자/데이터 보존
 */

interface SummaryOptions {
  maxLength?: number;
  preserveKeywords?: string[];
  preserveEmojis?: boolean;
  techContentMode?: boolean;
}

/**
 * 개선된 서머리 생성 함수
 */
export function generateSummaryV2(content: string, options: SummaryOptions = {}): string {
  const {
    maxLength = 200,
    preserveKeywords = [],
    preserveEmojis = false,
    techContentMode = true
  } = options;

  if (!content || content.trim().length === 0) {
    return '';
  }

  const trimmedContent = content.trim();
  
  // 이미 짧으면 그대로 반환
  if (trimmedContent.length <= maxLength) {
    return trimmedContent;
  }

  // 1. 중요 패턴 인식
  const importantPatterns = extractImportantPatterns(trimmedContent);
  
  // 2. 문장 단위로 분할 (개선된 분할 로직)
  const sentences = smartSentenceSplit(trimmedContent);
  
  // 3. 문장별 중요도 점수 계산
  const scoredSentences = sentences.map(sentence => ({
    text: sentence,
    score: calculateSentenceImportance(sentence, importantPatterns, preserveKeywords)
  }));

  // 4. 중요도 기반 문장 선택
  let summary = '';
  const sortedSentences = scoredSentences.sort((a, b) => b.score - a.score);
  
  for (const sentenceObj of sortedSentences) {
    const testLength = summary.length + (summary ? 2 : 0) + sentenceObj.text.length;
    
    if (testLength > maxLength) {
      // 길이 초과시 현재 문장을 축약해서 추가할지 결정
      if (!summary) {
        // 첫 문장이라면 축약해서라도 포함
        summary = truncateIntelligently(sentenceObj.text, maxLength - 3) + '...';
      }
      break;
    }
    
    summary += (summary ? '. ' : '') + sentenceObj.text;
    
    // 충분한 정보가 담겼으면 중단
    if (summary.length > maxLength * 0.7) {
      break;
    }
  }

  // 5. 후처리: 중요 키워드 보존 확인
  summary = ensureKeywordPreservation(summary, preserveKeywords, trimmedContent, maxLength);
  
  return summary || trimmedContent.substring(0, maxLength - 3) + '...';
}

/**
 * 중요한 패턴들을 추출 (이모지, 태그, 기술용어 등)
 */
function extractImportantPatterns(content: string): {
  emojis: string[];
  tags: string[];
  techTerms: string[];
  numbers: string[];
  statuses: string[];
} {
  return {
    emojis: Array.from(content.matchAll(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu), match => match[0]),
    tags: Array.from(content.matchAll(/#\w+/g), match => match[0]),
    techTerms: Array.from(content.matchAll(/\b(?:API|MCP|SQL|TypeScript|JavaScript|React|Node\.js|Git|Docker|AWS|JSON|XML|HTTP|HTTPS|REST|GraphQL)\b/gi), match => match[0]),
    numbers: Array.from(content.matchAll(/\b\d+(?:\.\d+)?(?:%|개|점|시간|분|초|일|주|월|년)?\b/g), match => match[0]),
    statuses: Array.from(content.matchAll(/\b(?:완료|성공|실패|진행중|대기|시작|종료|해결|문제|오류|에러)\b/g), match => match[0])
  };
}

/**
 * 개선된 문장 분할 로직
 */
function smartSentenceSplit(content: string): string[] {
  // 1. 기본 문장 분할
  let sentences = content.split(/[.!?]\s+/).filter(s => s.trim().length > 0);
  
  // 2. 구조화된 내용 처리 (리스트, 체크박스 등)
  const structuredContent = content.match(/^[•\-\*]\s+.+$/gm);
  if (structuredContent && structuredContent.length > 0) {
    // 구조화된 내용이 있으면 첫 번째 요소를 우선적으로 포함
    sentences.unshift(...structuredContent.slice(0, 2));
  }
  
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * 문장의 중요도 점수 계산
 */
function calculateSentenceImportance(
  sentence: string, 
  patterns: ReturnType<typeof extractImportantPatterns>,
  preserveKeywords: string[]
): number {
  let score = 0;
  
  // 기본 점수
  score += 1;
  
  // 문장 위치 보너스 (첫 번째, 마지막 문장)
  
  // 중요 키워드 포함 보너스
  preserveKeywords.forEach(keyword => {
    if (sentence.toLowerCase().includes(keyword.toLowerCase())) {
      score += 10;
    }
  });
  
  // 기술 용어 보너스
  patterns.techTerms.forEach(term => {
    if (sentence.includes(term)) {
      score += 5;
    }
  });
  
  // 상태 정보 보너스
  patterns.statuses.forEach(status => {
    if (sentence.includes(status)) {
      score += 3;
    }
  });
  
  // 숫자 정보 보너스
  patterns.numbers.forEach(number => {
    if (sentence.includes(number)) {
      score += 2;
    }
  });
  
  // 문장 길이 패널티 (너무 짧거나 긴 문장)
  if (sentence.length < 10) score -= 2;
  if (sentence.length > 150) score -= 1;
  
  return score;
}

/**
 * 지능적 내용 축약
 */
function truncateIntelligently(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  
  // 단어 단위로 자르되, 중요한 단어는 보존
  const words = text.split(' ');
  let result = '';
  
  for (const word of words) {
    if ((result + ' ' + word).length > maxLength) break;
    result += (result ? ' ' : '') + word;
  }
  
  return result;
}

/**
 * 중요 키워드 보존 확인 및 보완
 */
function ensureKeywordPreservation(
  summary: string, 
  preserveKeywords: string[], 
  originalContent: string, 
  maxLength: number
): string {
  // 누락된 중요 키워드가 있으면 앞부분에 추가
  const missingKeywords = preserveKeywords.filter(
    keyword => !summary.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (missingKeywords.length > 0 && summary.length < maxLength * 0.8) {
    const keywordText = missingKeywords.join(', ');
    if (summary.length + keywordText.length + 3 <= maxLength) {
      summary = keywordText + ' - ' + summary;
    }
  }
  
  return summary;
}

/**
 * 기존 generateSummary와의 호환성을 위한 래퍼
 */
export function generateSummary(content: string, maxLength: number = 200): string {
  // 자동으로 기술 내용 감지해서 적절한 옵션 설정
  const isTechnical = /\b(?:API|MCP|SQL|TypeScript|error|function|class|import|export)\b/i.test(content);
  const hasStatus = /\b(?:완료|성공|실패|진행|해결|문제)\b/.test(content);
  
  const options: SummaryOptions = {
    maxLength,
    preserveKeywords: [],
    preserveEmojis: true,
    techContentMode: isTechnical
  };
  
  // 상태 정보가 있으면 키워드로 보존
  if (hasStatus) {
    const statusMatches = content.match(/\b(?:완료|성공|실패|진행중|해결|문제)\b/g);
    if (statusMatches) {
      options.preserveKeywords = statusMatches;
    }
  }
  
  return generateSummaryV2(content, options);
}
