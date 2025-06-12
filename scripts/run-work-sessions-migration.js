#!/usr/bin/env node

// work_sessions 테이블 생성 및 work_memories 테이블에 session_id 추가 마이그레이션

import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'work_memory', 'database.sqlite');
const MIGRATION_SQL_PATH = join(__dirname, '..', 'src', 'database', 'migration', '001_create_work_sessions.sql');

async function runWorkSessionsMigration() {
  console.log('🚀 work_sessions 테이블 마이그레이션 시작');
  console.log(`📁 DB 경로: ${DB_PATH}`);
  console.log(`📄 SQL 파일: ${MIGRATION_SQL_PATH}`);
  
  try {
    // 데이터베이스 연결
    const db = new Database(DB_PATH);
    
    // 백업 생성
    console.log('\n💾 마이그레이션 전 백업 생성...');
    const backupPath = join(__dirname, '..', 'work_memory', 'backups', `migration_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    const backupDb = new Database(backupPath);
    db.backup(backupDb);
    backupDb.close();
    console.log(`✅ 백업 완료: ${backupPath}`);
    
    // SQL 파일 읽기
    console.log('\n📖 마이그레이션 SQL 파일 읽는 중...');
    const migrationSql = readFileSync(MIGRATION_SQL_PATH, 'utf8');
    
    // SQL을 세미콜론으로 분리하여 각각 실행
    const sqlStatements = migrationSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`\n⚡ ${sqlStatements.length}개의 SQL 명령어 실행 중...`);
    
    // 트랜잭션으로 전체 마이그레이션 실행
    const transaction = db.transaction(() => {
      let executedCount = 0;
      
      for (const sql of sqlStatements) {
        try {
          console.log(`   ${++executedCount}. 실행 중: ${sql.substring(0, 60)}...`);
          db.exec(sql);
          console.log(`   ✅ 성공`);
        } catch (error) {
          // CREATE IF NOT EXISTS이므로 이미 존재하는 경우 무시
          if (error.message.includes('already exists')) {
            console.log(`   ⚠️  이미 존재함 (무시): ${error.message}`);
          } else {
            console.error(`   ❌ 실패: ${error.message}`);
            throw error;
          }
        }
      }
    });
    
    try {
      transaction();
      console.log('\n🎉 work_sessions 테이블 생성 완료!');
    } catch (error) {
      console.error('\n❌ 트랜잭션 실행 실패:', error);
      throw error;
    }
    
    // work_memories 테이블에 session_id 컬럼 추가
    console.log('\n🔗 work_memories 테이블에 session_id 컬럼 추가...');
    
    try {
      // 테이블 정보 확인
      const tableInfo = db.prepare("PRAGMA table_info(work_memories)").all();
      const hasSessionId = tableInfo.some(col => col.name === 'session_id');
      
      if (!hasSessionId) {
        console.log('   session_id 컬럼 추가 중...');
        db.exec('ALTER TABLE work_memories ADD COLUMN session_id TEXT REFERENCES work_sessions(session_id)');
        console.log('   ✅ session_id 컬럼 추가 완료');
        
        // 인덱스 생성
        console.log('   session_id 인덱스 생성 중...');
        db.exec('CREATE INDEX IF NOT EXISTS idx_work_memories_session_id ON work_memories(session_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_work_memories_session_project ON work_memories(session_id, project)');
        console.log('   ✅ 인덱스 생성 완료');
      } else {
        console.log('   ⚠️  session_id 컬럼이 이미 존재합니다.');
      }
    } catch (error) {
      console.error('   ❌ session_id 컬럼 추가 실패:', error);
      throw error;
    }
    
    // 마이그레이션 완료 확인
    console.log('\n🔍 마이그레이션 결과 확인...');
    
    // work_sessions 테이블 확인
    const workSessionsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_sessions'").get();
    console.log(`   work_sessions 테이블: ${workSessionsExists ? '✅ 존재' : '❌ 없음'}`);
    
    // session_id 컬럼 확인
    const updatedTableInfo = db.prepare("PRAGMA table_info(work_memories)").all();
    const hasSessionIdAfter = updatedTableInfo.some(col => col.name === 'session_id');
    console.log(`   work_memories.session_id: ${hasSessionIdAfter ? '✅ 존재' : '❌ 없음'}`);
    
    // 인덱스 확인
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%session%'").all();
    console.log(`   session 관련 인덱스: ${indexes.length}개`);
    indexes.forEach(idx => {
      console.log(`     - ${idx.name}`);
    });
    
    db.close();
    
    console.log('\n🎊 work_sessions 마이그레이션이 성공적으로 완료되었습니다!');
    console.log('\n다음 단계:');
    console.log('  1. work_memories 테이블의 session_id 컬럼 변경 (Task 1.4)');
    console.log('  2. 마이그레이션 검증 (Task 1.6)');
    
    return { success: true };
    
  } catch (error) {
    console.error('\n💥 마이그레이션 실패:', error);
    console.log('\n복구 방법:');
    console.log('  1. 백업 파일을 사용하여 데이터베이스 복원');
    console.log('  2. 마이그레이션 스크립트 수정 후 재시도');
    return { success: false, error: error.message };
  }
}

// 스크립트 직접 실행 시
if (import.meta.url === `file://${process.argv[1]}`) {
  runWorkSessionsMigration()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('스크립트 실행 오류:', error);
      process.exit(1);
    });
}

export { runWorkSessionsMigration };
