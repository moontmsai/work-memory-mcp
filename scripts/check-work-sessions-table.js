#!/usr/bin/env node

// 현재 데이터베이스에 work_sessions 테이블이 있는지 확인하는 스크립트

import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'work_memory', 'database.sqlite');

async function checkWorkSessionsTable() {
  console.log('🔍 데이터베이스 테이블 확인 중...');
  console.log(`📁 DB 경로: ${DB_PATH}`);
  
  try {
    const db = new Database(DB_PATH);
    
    // 테이블 목록 조회
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('\n📋 현재 테이블 목록:');
    tables.forEach(table => {
      console.log(`  - ${table.name}`);
    });
    
    // work_sessions 테이블 존재 확인
    const workSessionsExists = tables.some(table => table.name === 'work_sessions');
    console.log(`\n🎯 work_sessions 테이블: ${workSessionsExists ? '✅ 존재함' : '❌ 없음'}`);
    
    if (workSessionsExists) {
      // 테이블 구조 확인
      const schema = db.prepare("PRAGMA table_info(work_sessions)").all();
      console.log('\n📊 work_sessions 테이블 구조:');
      schema.forEach(col => {
        console.log(`  - ${col.name}: ${col.type} ${col.notnull ? '(NOT NULL)' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
      });
    }
    
    // work_memories 테이블에 session_id 컬럼 확인
    const workMemoriesSchema = db.prepare("PRAGMA table_info(work_memories)").all();
    const hasSessionId = workMemoriesSchema.some(col => col.name === 'session_id');
    console.log(`\n🔗 work_memories.session_id 컬럼: ${hasSessionId ? '✅ 존재함' : '❌ 없음'}`);
    
    if (hasSessionId) {
      const sessionIdCol = workMemoriesSchema.find(col => col.name === 'session_id');
      console.log(`  - 타입: ${sessionIdCol.type}`);
      console.log(`  - NULL 허용: ${sessionIdCol.notnull ? 'NO' : 'YES'}`);
    }
    
    db.close();
    
    return {
      workSessionsExists,
      hasSessionId,
      needsMigration: !workSessionsExists || !hasSessionId
    };
    
  } catch (error) {
    console.error('❌ 데이터베이스 확인 중 오류:', error);
    return { error: error.message };
  }
}

// 스크립트 직접 실행 시
if (import.meta.url === `file://${process.argv[1]}`) {
  checkWorkSessionsTable()
    .then(result => {
      if (result.error) {
        process.exit(1);
      }
      
      if (result.needsMigration) {
        console.log('\n🚨 마이그레이션이 필요합니다!');
        console.log('   run-migration.js 스크립트를 실행하세요.');
      } else {
        console.log('\n✅ 모든 테이블이 최신 상태입니다.');
      }
      
      process.exit(0);
    })
    .catch(error => {
      console.error('스크립트 실행 오류:', error);
      process.exit(1);
    });
}

export { checkWorkSessionsTable };
