#!/usr/bin/env node

/**
 * SSE 서버 시작 스크립트
 */

import { startSSEServer } from '../dist/sse/server.js';

console.log('🚀 Starting Progress Tracking SSE Server...');

startSSEServer()
  .then(() => {
    console.log('✅ SSE Server started successfully');
  })
  .catch((error) => {
    console.error('❌ Failed to start SSE Server:', error);
    process.exit(1);
  });
