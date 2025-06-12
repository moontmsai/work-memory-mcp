import { getDatabaseConnection } from './index.js';

/**
 * WAL 체크포인트 스케줄러
 * 주기적으로 체크포인트를 실행하여 데이터 영속성을 보장
 */
export class CheckpointScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly intervalMs: number = 5 * 60 * 1000; // 5분

  public start(): void {
    // 매번 새 연결을 사용하므로 체크포인트 스케줄러 비활성화
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async performCheckpoint(): Promise<void> {
    // 더 이상 필요하지 않음
  }
}

export default CheckpointScheduler; 