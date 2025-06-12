import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SearchManager, ValidationError } from '../utils/index.js';

/**
 * get_related_keywords MCP 도구
 * 주어진 키워드와 연관된 키워드들을 찾는 기능
 */

export interface GetRelatedKeywordsArgs {
  keyword: string;
  limit?: number;
  include_suggestions?: boolean;
}

export const getRelatedKeywordsTool: Tool = {
  name: 'get_related_keywords',
  description: '주어진 키워드와 연관된 키워드들을 찾아 반환합니다. 같은 메모리에 함께 나타나는 키워드들을 분석합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: '연관 키워드를 찾을 기준 키워드',
        minLength: 1
      },
      limit: {
        type: 'number',
        description: '반환할 최대 연관 키워드 수 (기본값: 10)',
        minimum: 1,
        maximum: 50,
        default: 10
      },
      include_suggestions: {
        type: 'boolean',
        description: '검색 제안도 함께 포함할지 여부 (기본값: true)',
        default: true
      }
    },
    required: ['keyword']
  }
};

/**
 * get_related_keywords 도구 핸들러
 */
export async function handleGetRelatedKeywords(args: GetRelatedKeywordsArgs): Promise<{
  success: boolean;
  keyword: string;
  related_keywords?: string[];
  search_suggestions?: string[];
  total_found: number;
  error?: string;
}> {
  try {
    // 입력 검증
    if (!args.keyword || args.keyword.trim().length === 0) {
      throw new ValidationError('키워드가 비어있습니다');
    }

    if (args.limit && (args.limit < 1 || args.limit > 50)) {
      throw new ValidationError('limit은 1-50 사이의 값이어야 합니다');
    }

    const searchManager = new SearchManager();
    const keyword = args.keyword.trim();
    const limit = args.limit || 10;

    // 연관 키워드 검색
    const relatedKeywords = await searchManager.getRelatedKeywords(keyword);
    const limitedRelatedKeywords = relatedKeywords.slice(0, limit);

    // 검색 제안 (옵션)
    let searchSuggestions: string[] | undefined;
    if (args.include_suggestions !== false) {
      searchSuggestions = await searchManager.getSearchSuggestions(keyword);
      searchSuggestions = searchSuggestions.slice(0, 5); // 제안은 최대 5개로 제한
    }

    return {
      success: true,
      keyword,
      related_keywords: limitedRelatedKeywords,
      ...(searchSuggestions && searchSuggestions.length > 0 && { search_suggestions: searchSuggestions }),
      total_found: limitedRelatedKeywords.length
    };

  } catch (error) {
    return {
      success: false,
      keyword: args.keyword,
      total_found: 0,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다'
    };
  }
}

/**
 * 연관 키워드 결과 포맷팅
 */
export function formatRelatedKeywords(
  keyword: string, 
  relatedKeywords: string[], 
  suggestions?: string[]
): string {
  let output = `🔗 "${keyword}"와(과) 연관된 키워드:\n\n`;

  if (relatedKeywords.length === 0) {
    output += '연관된 키워드를 찾을 수 없습니다.\n';
  } else {
    output += '연관 키워드:\n';
    relatedKeywords.forEach((kw, index) => {
      output += `  ${index + 1}. ${kw}\n`;
    });
  }

  if (suggestions && suggestions.length > 0) {
    output += '\n💡 검색 제안:\n';
    suggestions.forEach((suggestion, index) => {
      output += `  ${index + 1}. ${suggestion}\n`;
    });
  }

  if (relatedKeywords.length > 0) {
    output += '\n이 키워드들을 사용하여 더 구체적인 검색을 시도해 보세요.';
  }

  return output;
}