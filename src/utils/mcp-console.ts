/**
 * MCP 프로토콜 준수를 위한 안전한 콘솔 출력
 * stdout은 JSON-RPC 메시지 전용, 모든 로그는 stderr로
 */

/**
 * 안전한 stderr 출력 - MCP 프로토콜 보호
 */
function safeStderr(message: string): void {
  try {
    // process.stderr.write는 동기적이고 안전함
    process.stderr.write(message + '\n');
  } catch (error) {
    // stderr 출력도 실패하면 완전히 무시
  }
}

/**
 * MCP 호환 console 객체 - 모든 출력을 stderr로
 */
export const mcpConsole = {
  log: (message?: any, ...optionalParams: any[]): void => {
    if (process.env.NODE_ENV === 'development') {
      const fullMessage = [message, ...optionalParams].map(String).join(' ');
      safeStderr(`[LOG] ${fullMessage}`);
    }
  },

  info: (message?: any, ...optionalParams: any[]): void => {
    if (process.env.NODE_ENV === 'development') {
      const fullMessage = [message, ...optionalParams].map(String).join(' ');
      safeStderr(`[INFO] ${fullMessage}`);
    }
  },

  warn: (message?: any, ...optionalParams: any[]): void => {
    if (process.env.NODE_ENV === 'development') {
      const fullMessage = [message, ...optionalParams].map(String).join(' ');
      safeStderr(`[WARN] ${fullMessage}`);
    }
  },

  error: (message?: any, ...optionalParams: any[]): void => {
    // 에러는 항상 출력하되 stderr로
    const fullMessage = [message, ...optionalParams].map(String).join(' ');
    safeStderr(`[ERROR] ${fullMessage}`);
  },

  debug: (message?: any, ...optionalParams: any[]): void => {
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG === 'true') {
      const fullMessage = [message, ...optionalParams].map(String).join(' ');
      safeStderr(`[DEBUG] ${fullMessage}`);
    }
  },

  // 완전히 출력하지 않는 더미 함수들
  silent: {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  }
};

/**
 * 글로벌 console 객체 오버라이드 - MCP 프로토콜 보호
 */
export function overrideGlobalConsole(): void {
  // 프로덕션에서는 모든 console 출력 차단
  if (process.env.NODE_ENV === 'production') {
    (global as any).console = mcpConsole.silent;
  } else {
    // 개발환경에서도 stderr로 리다이렉트
    (global as any).console = mcpConsole;
  }
}

/**
 * 원본 console 복원 (테스트용)
 */
const originalConsole = { ...console };
export function restoreGlobalConsole(): void {
  (global as any).console = originalConsole;
}

/**
 * MCP 서버 시작 시 호출할 초기화 함수
 */
export function initMcpConsole(): void {
  overrideGlobalConsole();
  
  // 프로세스 종료 시 복원
  process.on('exit', () => {
    restoreGlobalConsole();
  });
}