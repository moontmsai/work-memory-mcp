import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDatabaseConnection } from '../database/index.js';

export const optimizeDatabaseTool: Tool = {
  name: 'optimize_database',
  description: '데이터베이스를 최적화하고 사용하지 않는 공간을 회수합니다. (VACUUM)',
  inputSchema: {
    type: 'object',
    properties: {},
  }
};

export async function handleOptimizeDatabase(dbPath: string): Promise<string> {
  try {
    const connection = getDatabaseConnection();
    if (!connection) {
      throw new Error('Database connection not available');
    }

    // VACUUM 전 파일 크기 측정
    const initialSize = await getFileSize(dbPath);

    // WAL 체크포인트를 실행하여 로그를 DB 파일에 병합
    await connection.run('PRAGMA wal_checkpoint(TRUNCATE);');
    
    // 데이터베이스 공간 최적화
    await connection.run('VACUUM;');

    // VACUUM 후 파일 크기 측정
    const finalSize = await getFileSize(dbPath);

    const reduction = initialSize - finalSize;
    const reductionPercent = initialSize > 0 ? (reduction / initialSize * 100).toFixed(2) : 0;

    return `✅ 데이터베이스 최적화 완료.\n` +
           `   - 파일 크기: ${formatBytes(initialSize)} -> ${formatBytes(finalSize)}\n` +
           `   - 공간 회수: ${formatBytes(reduction)} (${reductionPercent}%)`;

  } catch (error) {
    return `❌ 데이터베이스 최적화 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`;
  }
}

// 파일 크기를 가져오는 헬퍼 함수
async function getFileSize(filePath: string): Promise<number> {
  try {
    const fs = await import('fs/promises');
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    return 0; // 파일이 없거나 오류 발생 시 0 반환
  }
}

// 바이트를 읽기 쉬운 형식으로 변환하는 헬퍼 함수
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
} 