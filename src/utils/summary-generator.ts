/**
 * 콘텐츠에서 핵심 내용을 추출하여 서머리를 생성합니다.
 * @param content 원본 콘텐츠
 * @param maxLength 최대 서머리 길이 (기본값: 200자)
 * @returns 생성된 서머리
 */
export function generateSummary(content: string, maxLength: number = 200): string {
  if (!content || content.trim().length === 0) {
    return '';
  }

  const trimmedContent = content.trim();
  
  // 이미 짧으면 그대로 반환
  if (trimmedContent.length <= maxLength) {
    return trimmedContent;
  }

  // 1. 문장 단위로 분할
  const sentences = trimmedContent
    .split(/[.!?]\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // 2. 첫 번째 문장이 너무 길면 적절히 자르기
  if (sentences.length === 1 || sentences[0].length > maxLength * 0.8) {
    const firstSentence = sentences[0];
    if (firstSentence.length <= maxLength) {
      return firstSentence;
    }
    
    // 단어 단위로 자르되 의미가 통하도록
    const words = firstSentence.split(' ');
    let summary = '';
    for (const word of words) {
      if ((summary + word).length > maxLength - 3) {
        break;
      }
      summary += (summary ? ' ' : '') + word;
    }
    return summary + '...';
  }

  // 3. 여러 문장이 있는 경우 핵심 문장들 선택
  let summary = '';
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const separatorLength = summary ? 2 : 0; // '. ' 길이
    const testLength = summary.length + separatorLength + sentence.length;
    
    if (testLength > maxLength) {
      break;
    }
    
    summary += (summary ? '. ' : '') + sentence;
    
    // 충분히 의미있는 길이가 되면 중단
    if (summary.length > maxLength * 0.6 && i < sentences.length - 1) {
      break;
    }
  }

  return summary || trimmedContent.substring(0, maxLength - 3) + '...';
}
