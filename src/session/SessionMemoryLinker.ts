/**
 * 세션과 메모리 간의 링크를 관리하는 클래스 (스마트 세션 생성 기능 포함)
 */

import { DatabaseConnection } from '../types/database';
import { SessionStatus, Session } from '../types/session';

/**
 * 작업기억 내용을 분석하여 의미있는 세션명 제안
 */
export function analyzeContentForSession(content: string, project?: string): string {
  const normalizedContent = content.toLowerCase();
  
  // 1. 명확한 키워드 패턴 매칭 (우선순위 높음)
  const patterns = [
    { keywords: ['휴가', '여행', '항공권', '숙소', '관광'], session: '여행 계획' },
    { keywords: ['정리', '청소', '치우기', '분류', '버리기'], session: '정리 정돈' },
    { keywords: ['공부', '학습', '교육', '강의', '시험'], session: '학습 계획' },
    { keywords: ['보고서', '업무', '회의', '프레젠테이션', '발표'], session: '업무 처리' },
    { keywords: ['운동', '헬스', '다이어트', '건강', '요가'], session: '건강 관리' },
    { keywords: ['요리', '음식', '레시피', '식재료', '맛집'], session: '요리 계획' },
    { keywords: ['쇼핑', '구매', '주문', '배송', '장보기'], session: '쇼핑 관리' },
    { keywords: ['독서', '책', '소설', '도서관', '서점'], session: '독서 활동' },
    { keywords: ['이사', '집', '아파트', '부동산', '계약'], session: '주거 관리' },
    { keywords: ['차', '자동차', '정비', '주유', '보험'], session: '차량 관리' },
    { keywords: ['병원', '의사', '치료', '약', '검사'], session: '건강 관리' },
    { keywords: ['돈', '투자', '적금', '보험', '세금'], session: '재정 관리' },
    { keywords: ['선물', '생일', '기념일', '축하', '파티'], session: '기념일 준비' },
    { keywords: ['가족', '부모님', '아이', '육아', '교육'], session: '가족 관리' },
    { keywords: ['친구', '모임', '약속', '만남', '연락'], session: '인간관계' },
    { keywords: ['개발', '코딩', '프로그래밍', '버그', '배포'], session: '개발 작업' },
    { keywords: ['디자인', '그래픽', '포토샵', '일러스트'], session: '디자인 작업' },
    { keywords: ['문서', '작성', '글쓰기', '편집', '검토'], session: '문서 작업' },
    { keywords: ['계획', '스케줄', '일정', '달력', '예약'], session: '일정 관리' },
    { keywords: ['게임', '플레이', '스트림', '방송'], session: '게임 활동' }
  ];

  // 패턴 매칭 검사
  for (const pattern of patterns) {
    if (pattern.keywords.some(keyword => normalizedContent.includes(keyword))) {
      return pattern.session;
    }
  }

  // 2. 프로젝트명이 있으면 우선 사용
  if (project && project !== 'unknown' && project.trim().length > 0) {
    const cleanProject = project.replace(/[^\w\s가-힣]/g, '').trim();
    if (cleanProject.length > 0) {
      return `${cleanProject} 작업`;
    }
  }

  // 3. 시간 패턴 인식
  if (normalizedContent.includes('이달') || normalizedContent.includes('월말')) {
    return '이달 할일';
  }
  if (normalizedContent.includes('오늘') || normalizedContent.includes('일일')) {
    return '오늘 할일';
  }
  if (normalizedContent.includes('주간') || normalizedContent.includes('이번 주')) {
    return '주간 할일';
  }

  // 4. 작업 유형별 기본 분류
  if (normalizedContent.includes('할일') || normalizedContent.includes('todo')) {
    return '일반 할일';
  }
  if (normalizedContent.includes('메모') || normalizedContent.includes('기록')) {
    return '일반 메모';
  }

  // 5. 기본값
  return '일반 작업';
}

/**
 * 개선된 세션 ID 생성
 */
export function generateSmartSessionId(sessionName: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  const namePrefix = sessionName
    .toLowerCase()
    .replace(/[^\w가-힣]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 12);
  
  return `session_${dateStr}_${namePrefix}_${random}`;
}

/**
 * 기존 세션 검색 및 재사용 판단
 */
export async function findSimilarSession(
  connection: DatabaseConnection, 
  sessionName: string, 
  project?: string
): Promise<{ session_id: string; should_reuse: boolean } | null> {
  try {
    // 1. 정확히 같은 이름의 활성 세션 찾기
    const exactMatch = await connection.get(`
      SELECT session_id, project_name, status, last_activity_at 
      FROM work_sessions 
      WHERE LOWER(TRIM(description)) LIKE LOWER(TRIM(?))
        AND status IN (?, ?)
      ORDER BY last_activity_at DESC
      LIMIT 1
    `, [`%${sessionName}%`, SessionStatus.ACTIVE, SessionStatus.PAUSED]);

    if (exactMatch) {
      // 최근 3일 이내 활동이 있으면 재사용
      const lastActivity = new Date(exactMatch.last_activity_at);
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      
      return {
        session_id: exactMatch.session_id,
        should_reuse: lastActivity > threeDaysAgo
      };
    }

    // 2. 프로젝트가 같은 활성 세션 찾기
    if (project) {
      const projectMatch = await connection.get(`
        SELECT session_id, project_name, status, last_activity_at
        FROM work_sessions
        WHERE LOWER(TRIM(project_name)) = LOWER(TRIM(?))
          AND status IN (?, ?)
        ORDER BY last_activity_at DESC
        LIMIT 1
      `, [project, SessionStatus.ACTIVE, SessionStatus.PAUSED]);

      if (projectMatch) {
        const lastActivity = new Date(projectMatch.last_activity_at);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        return {
          session_id: projectMatch.session_id,
          should_reuse: lastActivity > oneDayAgo
        };
      }
    }

    return null;
  } catch (error) {
    console.warn('Error finding similar session:', error);
    return null;
  }
}

/**
 * 세션 재활성화
 */
export async function reactivateSession(
  connection: DatabaseConnection, 
  sessionId: string
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    await connection.run(`
      UPDATE work_sessions 
      SET status = ?, last_activity_at = ?, updated_at = ?
      WHERE session_id = ?
    `, [SessionStatus.ACTIVE, now, now, sessionId]);
    
    return true;
  } catch (error) {
    console.warn('Error reactivating session:', error);
    return false;
  }
}

export class SessionMemoryLinker {
  private connection: DatabaseConnection;

  constructor(connection: DatabaseConnection) {
    this.connection = connection;
  }

  // 기존 메서드들은 그대로 유지
  async linkMemoryToSession(memoryId: string, sessionId: string): Promise<void> {
    // 링크 구현
  }

  /**
   * 메모리 자동 링크 (워크 메모리 저장 시 사용)
   */
  async autoLinkMemoryToSession(
    memoryId: string,
    sessionId: string,
    options?: {
      skip_validation?: boolean;
      reason?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 이미 링크되어 있는지 확인
      const existingLink = await this.connection.get(
        'SELECT * FROM work_memories WHERE id = ? AND session_id = ?',
        [memoryId, sessionId]
      );

      if (existingLink) {
        return { success: true }; // 이미 링크됨
      }

      // 메모리에 세션 ID 설정
      await this.connection.run(
        'UPDATE work_memories SET session_id = ?, updated_at = ? WHERE id = ?',
        [sessionId, new Date().toISOString(), memoryId]
      );

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: `Auto link failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 🚀 새로운 스마트 세션 자동 링크 (기존 autoLinkToActiveSession 개선)
   */
  async smartAutoLinkToSession(
    memoryId: string,
    memoryContent: string,
    options?: {
      project_name?: string;
      project_path?: string;
      force_new_session?: boolean;
    }
  ): Promise<{ 
    success: boolean; 
    session_id?: string; 
    session_name?: string;
    error?: string; 
    created_session?: boolean;
    reused_session?: boolean;
  }> {
    try {
      // 1. 메모리 내용 분석하여 적절한 세션명 결정
      const sessionName = analyzeContentForSession(memoryContent, options?.project_name);
      
      // 2. 새 세션 강제 생성이 아닌 경우, 기존 세션 재사용 가능성 확인
      if (!options?.force_new_session) {
        const similarSession = await findSimilarSession(
          this.connection, 
          sessionName, 
          options?.project_name
        );

        if (similarSession?.should_reuse) {
          // 기존 세션 재활성화 및 링크
          await reactivateSession(this.connection, similarSession.session_id);
          
          const linkResult = await this.autoLinkMemoryToSession(
            memoryId, 
            similarSession.session_id, 
            { reason: 'smart_reuse_session' }
          );

          return {
            success: linkResult.success,
            session_id: similarSession.session_id,
            session_name: sessionName,
            error: linkResult.error,
            created_session: false,
            reused_session: true
          };
        }
      }

      // 3. 새 세션 생성
      const newSessionId = generateSmartSessionId(sessionName);
      const now = new Date().toISOString();
      
      await this.connection.run(`
        INSERT INTO work_sessions (
          session_id, project_name, project_path, 
          started_at, last_activity_at, status, description,
          auto_created, created_by, created_at, updated_at,
          activity_count, memory_count, total_work_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newSessionId,
        options?.project_name || sessionName,
        options?.project_path || '',
        now,
        now,
        SessionStatus.ACTIVE,
        `${sessionName} 작업 세션`,
        1, // auto_created
        'smart_session_system',
        now,
        now,
        0, // activity_count
        0, // memory_count
        0  // total_work_time
      ]);

      // 4. 메모리를 새 세션에 링크
      const linkResult = await this.autoLinkMemoryToSession(
        memoryId, 
        newSessionId, 
        { reason: 'smart_new_session' }
      );

      return {
        success: linkResult.success,
        session_id: newSessionId,
        session_name: sessionName,
        error: linkResult.error,
        created_session: true,
        reused_session: false
      };

    } catch (error) {
      return {
        success: false,
        error: `Smart session link failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 현재 활성 세션에 메모리 자동 링크 (기존 방식 - 호환성 유지)
   */
  async autoLinkToActiveSession(
    memoryId: string,
    options?: {
      create_session_if_none?: boolean;
      project_name?: string;
      project_path?: string;
    }
  ): Promise<{ success: boolean; session_id?: string; error?: string; created_session?: boolean }> {
    try {
      // 현재 활성 세션 조회
      let activeSession = await this.connection.get(
        'SELECT * FROM work_sessions WHERE status = ? ORDER BY last_activity_at DESC LIMIT 1',
        [SessionStatus.ACTIVE]
      );

      let createdSession = false;

      // 활성 세션이 없고 생성 옵션이 있는 경우
      if (!activeSession && options?.create_session_if_none && options.project_name) {
        // 🚀 기존 단순 세션 생성 대신 스마트 세션 생성 사용
        const sessionName = analyzeContentForSession('', options.project_name);
        const newSessionId = generateSmartSessionId(sessionName);
        const now = new Date().toISOString();
        
        // 세션을 데이터베이스에 삽입
        await this.connection.run(`
          INSERT INTO work_sessions (
            session_id, project_name, project_path, 
            started_at, last_activity_at, status, description,
            auto_created, created_by, created_at, updated_at,
            activity_count, memory_count, total_work_time
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          newSessionId,
          options.project_name,
          options.project_path || '',
          now,
          now,
          SessionStatus.ACTIVE,
          `${sessionName} 작업 세션`,
          1, // auto_created
          'smart_session_system',
          now,
          now,
          0, // activity_count
          0, // memory_count
          0  // total_work_time
        ]);

        activeSession = {
          session_id: newSessionId,
          project_name: options.project_name,
          status: SessionStatus.ACTIVE
        };
        createdSession = true;
      }

      if (!activeSession) {
        return {
          success: false,
          error: 'No active session found and session creation not enabled'
        };
      }

      // 메모리를 활성 세션에 링크
      const linkResult = await this.autoLinkMemoryToSession(memoryId, activeSession.session_id, {
        reason: 'auto_link_to_active_session'
      });

      return {
        success: linkResult.success,
        session_id: activeSession.session_id,
        error: linkResult.error,
        created_session: createdSession
      };

    } catch (error) {
      return {
        success: false,
        error: `Auto link to active session failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}
