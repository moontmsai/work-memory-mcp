#!/usr/bin/env node

const BackupManager = require('./backup-manager.cjs');
const fs = require('fs');
const path = require('path');

class AutoBackupDaemon {
    constructor() {
        this.backupManager = new BackupManager();
        this.workFile = path.resolve('./work_memory/current_work.json');
        this.isRunning = false;
        this.lastHash = null;
        this.intervalId = null;
        this.watcherActive = false;
        
        // 프로세스 종료 시 정리
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    // 파일 해시 계산
    calculateFileHash() {
        return this.backupManager.calculateHash(this.workFile);
    }

    // 파일 변경 감지
    checkForChanges() {
        try {
            const currentHash = this.calculateFileHash();
            
            if (currentHash && currentHash !== this.lastHash) {
                console.log(`📝 [${new Date().toISOString()}] 파일 변경 감지됨`);
                this.backupManager.createBackup('auto-change');
                this.lastHash = currentHash;
            }
        } catch (error) {
            console.error('❌ 변경 감지 중 오류:', error.message);
        }
    }

    // 주기적 백업
    periodicBackup() {
        console.log(`🔄 [${new Date().toISOString()}] 주기적 백업 실행`);
        this.backupManager.createBackup('periodic');
    }

    // 자동 백업 시작
    start(options = {}) {
        const {
            checkInterval = 30000,    // 30초마다 변경 감지
            backupInterval = 600000,  // 10분마다 주기적 백업
            maxBackups = 20
        } = options;

        if (this.isRunning) {
            console.log('⚠️ 자동 백업이 이미 실행 중입니다.');
            return;
        }

        console.log('🚀 자동 백업 데몬 시작');
        console.log(`📊 설정:
  - 변경 감지 간격: ${checkInterval/1000}초
  - 주기적 백업 간격: ${backupInterval/60000}분
  - 최대 백업 보관: ${maxBackups}개`);

        this.isRunning = true;
        this.lastHash = this.calculateFileHash();

        // 초기 백업 생성
        this.backupManager.createBackup('daemon-start');

        // 주기적 변경 감지
        this.intervalId = setInterval(() => {
            this.checkForChanges();
        }, checkInterval);

        // 주기적 백업
        setInterval(() => {
            this.periodicBackup();
        }, backupInterval);

        // 오래된 백업 정리 (1시간마다)
        setInterval(() => {
            console.log(`🧹 [${new Date().toISOString()}] 백업 정리 수행`);
            this.backupManager.cleanupBackups(maxBackups);
        }, 3600000);

        console.log('✅ 자동 백업 데몬이 성공적으로 시작되었습니다.');
        console.log('💡 종료하려면 Ctrl+C를 누르세요.');
    }

    // 자동 백업 중지
    stop() {
        if (!this.isRunning) {
            return;
        }

        console.log('\n🛑 자동 백업 데몬 종료 중...');
        
        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // 종료 전 최종 백업
        this.backupManager.createBackup('daemon-stop');
        
        console.log('✅ 자동 백업 데몬이 안전하게 종료되었습니다.');
        process.exit(0);
    }

    // 상태 확인
    status() {
        console.log(`
📊 자동 백업 데몬 상태:
  - 실행 상태: ${this.isRunning ? '✅ 실행 중' : '❌ 중지됨'}
  - 마지막 해시: ${this.lastHash ? this.lastHash.substring(0, 8) + '...' : '없음'}
  - 감시 파일: ${this.workFile}
        `);

        // 백업 목록 표시
        const backups = this.backupManager.listBackups();
        console.log(`📋 최근 백업 (${backups.length}개):`);
        backups.slice(0, 5).forEach((backup, i) => {
            console.log(`  ${i + 1}. ${backup.filename} (${backup.reason || 'unknown'})`);
        });
    }

    // 수동 백업
    manualBackup(reason = 'manual') {
        console.log(`📝 수동 백업 생성: ${reason}`);
        return this.backupManager.createBackup(reason);
    }

    // 복구
    restore(backupIndex) {
        const backups = this.backupManager.listBackups();
        if (backupIndex < 1 || backupIndex > backups.length) {
            console.log('❌ 유효하지 않은 백업 인덱스입니다.');
            return false;
        }

        const backup = backups[backupIndex - 1];
        console.log(`🔄 백업 복구: ${backup.filename}`);
        
        const success = this.backupManager.restoreBackup(backup.path);
        if (success) {
            this.lastHash = this.calculateFileHash();
        }
        
        return success;
    }
}

// CLI 인터페이스
if (require.main === module) {
    const daemon = new AutoBackupDaemon();
    const command = process.argv[2];

    switch (command) {
        case 'start':
            const checkInterval = parseInt(process.argv[3]) || 30;
            const backupInterval = parseInt(process.argv[4]) || 10;
            daemon.start({
                checkInterval: checkInterval * 1000,
                backupInterval: backupInterval * 60 * 1000
            });
            break;

        case 'status':
            daemon.status();
            break;

        case 'backup':
            daemon.manualBackup(process.argv[3] || 'manual');
            break;

        case 'restore':
            const index = parseInt(process.argv[3]);
            if (index) {
                daemon.restore(index);
            } else {
                console.log('❌ 백업 인덱스를 지정해주세요.');
            }
            break;

        case 'stop':
            daemon.stop();
            break;

        default:
            console.log(`
🤖 자동 백업 데몬

사용법:
  node auto-backup-daemon.cjs start [check_sec] [backup_min]  - 데몬 시작
  node auto-backup-daemon.cjs status                          - 상태 확인  
  node auto-backup-daemon.cjs backup [reason]                 - 수동 백업
  node auto-backup-daemon.cjs restore <index>                 - 백업 복구
  node auto-backup-daemon.cjs stop                           - 데몬 중지

예시:
  node auto-backup-daemon.cjs start 30 5    # 30초마다 체크, 5분마다 백업
  node auto-backup-daemon.cjs backup "before-important-task"
  node auto-backup-daemon.cjs restore 1
            `);
    }
}

module.exports = AutoBackupDaemon; 