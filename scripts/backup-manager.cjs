#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class BackupManager {
    constructor() {
        this.workDir = path.resolve('./work_memory');
        this.backupDir = path.join(this.workDir, 'backups');
        this.currentFile = path.join(this.workDir, 'current_work.json');
        this.lockFile = path.join(this.workDir, '.backup.lock');
        
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    // 현재 시각의 타임스탬프 생성
    getTimestamp() {
        return new Date().toISOString().replace(/[:.]/g, '-');
    }

    // 파일의 해시값 계산
    calculateHash(filePath) {
        if (!fs.existsSync(filePath)) return null;
        const content = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    // 백업 생성
    createBackup(reason = 'manual') {
        try {
            if (!fs.existsSync(this.currentFile)) {
                console.log('❌ 백업할 파일이 없습니다.');
                return null;
            }

            const timestamp = this.getTimestamp();
            const hash = this.calculateHash(this.currentFile);
            const backupFileName = `backup_${timestamp}_${reason}.json`;
            const backupPath = path.join(this.backupDir, backupFileName);

            // 기존 백업과 동일한지 확인
            const latestBackup = this.getLatestBackup();
            if (latestBackup && this.calculateHash(latestBackup.path) === hash) {
                console.log('📋 동일한 내용이므로 백업을 건너뜁니다.');
                return latestBackup.path;
            }

            // 백업 파일 생성
            fs.copyFileSync(this.currentFile, backupPath);

            // 메타데이터 저장
            const metadataPath = backupPath.replace('.json', '.meta.json');
            const metadata = {
                timestamp: new Date().toISOString(),
                reason,
                hash,
                originalPath: this.currentFile,
                size: fs.statSync(backupPath).size
            };
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

            console.log(`✅ 백업 생성 완료: ${backupFileName}`);
            return backupPath;

        } catch (error) {
            console.error('❌ 백업 생성 실패:', error.message);
            return null;
        }
    }

    // 백업 목록 조회
    listBackups() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(file => file.endsWith('.json') && !file.endsWith('.meta.json'))
                .map(file => {
                    const filePath = path.join(this.backupDir, file);
                    const metaPath = filePath.replace('.json', '.meta.json');
                    let metadata = {};
                    
                    if (fs.existsSync(metaPath)) {
                        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    }

                    return {
                        filename: file,
                        path: filePath,
                        ...metadata,
                        created: fs.statSync(filePath).mtime
                    };
                })
                .sort((a, b) => new Date(b.created) - new Date(a.created));

            return files;
        } catch (error) {
            console.error('❌ 백업 목록 조회 실패:', error.message);
            return [];
        }
    }

    // 최신 백업 조회
    getLatestBackup() {
        const backups = this.listBackups();
        return backups.length > 0 ? backups[0] : null;
    }

    // 백업 복구
    restoreBackup(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                console.log('❌ 백업 파일이 존재하지 않습니다.');
                return false;
            }

            // 현재 파일 백업 (복구 전)
            this.createBackup('pre-restore');

            // 복구 수행
            fs.copyFileSync(backupPath, this.currentFile);
            console.log(`✅ 백업 복구 완료: ${path.basename(backupPath)}`);
            
            return true;
        } catch (error) {
            console.error('❌ 백업 복구 실패:', error.message);
            return false;
        }
    }

    // 자동 백업 설정
    startAutoBackup(intervalMinutes = 10) {
        console.log(`🔄 자동 백업 시작 (${intervalMinutes}분 간격)`);
        
        setInterval(() => {
            this.createBackup('auto');
        }, intervalMinutes * 60 * 1000);

        // 파일 변경 감지
        if (fs.existsSync(this.currentFile)) {
            fs.watchFile(this.currentFile, (curr, prev) => {
                if (curr.mtime > prev.mtime) {
                    console.log('📝 파일 변경 감지, 백업 생성 중...');
                    setTimeout(() => this.createBackup('file-change'), 1000);
                }
            });
        }
    }

    // 백업 정리 (오래된 백업 삭제)
    cleanupBackups(keepCount = 10) {
        try {
            const backups = this.listBackups();
            const toDelete = backups.slice(keepCount);

            toDelete.forEach(backup => {
                fs.unlinkSync(backup.path);
                const metaPath = backup.path.replace('.json', '.meta.json');
                if (fs.existsSync(metaPath)) {
                    fs.unlinkSync(metaPath);
                }
                console.log(`🗑️ 백업 삭제: ${backup.filename}`);
            });

            console.log(`✅ 백업 정리 완료 (${toDelete.length}개 삭제, ${keepCount}개 유지)`);
        } catch (error) {
            console.error('❌ 백업 정리 실패:', error.message);
        }
    }

    // 데이터 무결성 검증
    verifyIntegrity() {
        try {
            if (!fs.existsSync(this.currentFile)) {
                console.log('❌ 현재 파일이 존재하지 않습니다.');
                return false;
            }

            const content = fs.readFileSync(this.currentFile, 'utf8');
            const data = JSON.parse(content);

            // 기본 구조 검증
            if (!data.version || !data.memories || !Array.isArray(data.memories)) {
                console.log('❌ 데이터 구조가 유효하지 않습니다.');
                return false;
            }

            // 메모리 ID 중복 검사
            const ids = data.memories.map(m => m.id);
            const uniqueIds = new Set(ids);
            if (ids.length !== uniqueIds.size) {
                console.log('❌ 중복된 메모리 ID가 발견되었습니다.');
                return false;
            }

            console.log(`✅ 데이터 무결성 검증 완료 (${data.memories.length}개 메모리)`);
            return true;

        } catch (error) {
            console.error('❌ 데이터 무결성 검증 실패:', error.message);
            return false;
        }
    }
}

// CLI 인터페이스
if (require.main === module) {
    const backup = new BackupManager();
    const command = process.argv[2];

    switch (command) {
        case 'create':
            backup.createBackup(process.argv[3] || 'manual');
            break;
        
        case 'list':
            const backups = backup.listBackups();
            console.log('\n📋 백업 목록:');
            backups.forEach((b, i) => {
                console.log(`${i + 1}. ${b.filename} (${b.reason || 'unknown'}) - ${new Date(b.created).toLocaleString()}`);
            });
            break;
        
        case 'restore':
            const backupIndex = parseInt(process.argv[3]) - 1;
            const backupList = backup.listBackups();
            if (backupIndex >= 0 && backupIndex < backupList.length) {
                backup.restoreBackup(backupList[backupIndex].path);
            } else {
                console.log('❌ 유효하지 않은 백업 인덱스입니다.');
            }
            break;
        
        case 'auto':
            backup.startAutoBackup(parseInt(process.argv[3]) || 10);
            break;
        
        case 'cleanup':
            backup.cleanupBackups(parseInt(process.argv[3]) || 10);
            break;
        
        case 'verify':
            backup.verifyIntegrity();
            break;
        
        default:
            console.log(`
📦 Work Memory 백업 관리자

사용법:
  node backup-manager.js create [reason]    - 백업 생성
  node backup-manager.js list               - 백업 목록 조회
  node backup-manager.js restore <index>    - 백업 복구 (목록의 번호)
  node backup-manager.js auto [minutes]     - 자동 백업 시작
  node backup-manager.js cleanup [keep]     - 오래된 백업 정리
  node backup-manager.js verify             - 데이터 무결성 검증

예시:
  node backup-manager.js create "important-milestone"
  node backup-manager.js restore 1
  node backup-manager.js auto 5
            `);
    }
}

module.exports = BackupManager; 