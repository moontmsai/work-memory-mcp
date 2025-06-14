/**
 * SSE (Server-Sent Events) 서버
 * 대용량 작업의 실시간 진행상황을 클라이언트에게 스트리밍
 */

import express from 'express';
import cors from 'cors';
import { SSEStreamManager } from '../managers/SSEStreamManager.js';
import { globalProgressTracker } from '../progress/ProgressTracker.js';

const app = express();
const PORT = process.env.SSE_PORT || 3001;

// CORS 설정
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Cache-Control']
}));

app.use(express.json());

// SSE 스트림 매니저 인스턴스
const sseManager = new SSEStreamManager();

// ProgressTracker에 SSE 매니저 주입
globalProgressTracker.setSSEManager(sseManager);

/**
 * SSE 엔드포인트
 */
app.get('/sse', (req, res) => {
    // SSE 헤더 설정
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const clientId = sseManager.addClient(res);
    
    // 연결 확인 메시지
    res.write(`data: {"type": "connected", "clientId": "${clientId}"}\n\n`);

    // 하트비트 설정 (30초마다)
    const heartbeat = setInterval(() => {
        res.write(`data: {"type": "heartbeat", "timestamp": ${Date.now()}}\n\n`);
    }, 30000);

    // 클라이언트 연결 해제 처리
    req.on('close', () => {
        clearInterval(heartbeat);
        sseManager.removeClient(clientId);
    });

    req.on('error', () => {
        clearInterval(heartbeat);
        sseManager.removeClient(clientId);
    });
});

/**
 * 테스트용 API 엔드포인트들
 */

// 검색 테스트
app.post('/api/test/search', async (req, res) => {
    try {
        const { query, includeProgress } = req.body;
        
        if (includeProgress) {
            const taskId = Date.now().toString();
            
            // 가상의 검색 작업 시뮬레이션
            sseManager.sendTaskStart(taskId, 'search', { query });
            
            // 진행상황 시뮬레이션
            let progress = 0;
            const interval = setInterval(() => {
                progress += 20;
                sseManager.sendProgress(taskId, progress, progress, 100);
                
                if (progress >= 100) {
                    clearInterval(interval);
                    sseManager.sendTaskComplete(taskId, {
                        results: `Found ${Math.floor(Math.random() * 10) + 1} results for "${query}"`
                    });
                }
            }, 500);
        }
        
        res.json({ success: true, message: 'Search test started' });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// 목록 테스트
app.post('/api/test/list', async (req, res) => {
    try {
        const { limit, includeProgress } = req.body;
        
        if (includeProgress) {
            const taskId = Date.now().toString();
            
            sseManager.sendTaskStart(taskId, 'list', { limit });
            
            // 진행상황 시뮬레이션
            let processed = 0;
            const total = limit || 50;
            const interval = setInterval(() => {
                processed += 5;
                const progress = Math.round((processed / total) * 100);
                sseManager.sendProgress(taskId, progress, processed, total);
                
                if (processed >= total) {
                    clearInterval(interval);
                    sseManager.sendTaskComplete(taskId, {
                        results: `Listed ${total} items successfully`
                    });
                }
            }, 300);
        }
        
        res.json({ success: true, message: 'List test started' });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// 배치 작업 테스트
app.post('/api/test/batch', async (req, res) => {
    try {
        const { operations, includeProgress } = req.body;
        
        if (includeProgress) {
            const taskId = Date.now().toString();
            
            sseManager.sendTaskStart(taskId, 'batch', { operationCount: operations.length });
            
            // 배치 작업 시뮬레이션
            let processed = 0;
            const total = operations.length;
            const interval = setInterval(() => {
                processed += 1;
                const progress = Math.round((processed / total) * 100);
                sseManager.sendProgress(taskId, progress, processed, total);
                
                if (processed >= total) {
                    clearInterval(interval);
                    sseManager.sendTaskComplete(taskId, {
                        results: `Processed ${total} operations successfully`
                    });
                }
            }, 1000);
        }
        
        res.json({ success: true, message: 'Batch test started' });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
});

// 상태 확인
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        connectedClients: sseManager.getClientCount(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

/**
 * SSE 서버 시작 함수
 */
export async function startSSEServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const server = app.listen(PORT, () => {
                console.log(`🌟 SSE Progress Tracking Server running on http://localhost:${PORT}`);
                console.log(`📊 SSE endpoint: http://localhost:${PORT}/sse`);
                console.log(`🔧 Test endpoints: http://localhost:${PORT}/api/test/*`);
                resolve();
            });

            server.on('error', (error) => {
                console.error('❌ SSE Server error:', error);
                reject(error);
            });

            // 서버 종료 처리
            process.on('SIGINT', () => {
                console.log('\n🛑 Shutting down SSE server...');
                server.close(() => {
                    console.log('✅ SSE server shut down gracefully');
                    process.exit(0);
                });
            });

        } catch (error) {
            reject(error);
        }
    });
}

export default app;