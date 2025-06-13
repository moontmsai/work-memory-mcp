/**
 * 백그라운드 워커 스크립트
 * 대용량 작업을 백그라운드에서 실행하고 진행상황을 보고
 */

const { parentPort } = require('worker_threads');
const { getDatabaseConnection } = require('../database/index.js');

// 작업 타입별 핸들러
const taskHandlers = {
  search_work_memory: require('../tools/search-work-memory.js').handleSearchWorkMemory,
  list_work_memories: require('../tools/list-work-memories.js').handleListWorkMemories,
  batch_operations: require('../tools/batch-operations.js').handleBatchOperations,
  optimize_search_index: require('../tools/optimize-search-index.js').handleOptimizeSearchIndex,
  backup_database: handleBackupDatabase,
  export_data: handleExportData
};

// 현재 실행 중인 작업
let currentTask = null;
let isCancelled = false;

/**
 * 진행률 보고 헬퍼
 */
function reportProgress(taskId, progress, stage, details, itemsProcessed) {
  if (parentPort && !isCancelled) {
    parentPort.postMessage({
      type: 'progress',
      taskId,
      progress,
      stage,
      details,
      itemsProcessed
    });
  }
}

/**
 * 작업 완료 보고
 */
function reportCompleted(taskId, result) {
  if (parentPort && !isCancelled) {
    parentPort.postMessage({
      type: 'completed',
      taskId,
      result
    });
  }
}

/**
 * 작업 실패 보고
 */
function reportFailed(taskId, error) {
  if (parentPort) {
    parentPort.postMessage({
      type: 'failed',
      taskId,
      error
    });
  }
}

/**
 * 데이터베이스 백업 작업
 */
async function handleBackupDatabase(taskId, params) {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    reportProgress(taskId, 10, '백업 준비', '백업 경로 설정 중');
    
    const backupPath = params.backupPath || `./backup_${Date.now()}.db`;
    const connection = getDatabaseConnection();
    
    if (!connection) {
      throw new Error('데이터베이스 연결 실패');
    }
    
    reportProgress(taskId, 30, '데이터 추출', '테이블 데이터 읽기 중');
    
    // 모든 테이블 데이터 추출
    const tables = ['work_memories'];
    const backupData = {};
    
    for (const table of tables) {
      reportProgress(taskId, 40, '테이블 백업', `${table} 테이블 백업 중`);
      
      const data = await connection.all(`SELECT * FROM ${table}`);
      backupData[table] = data;
      
      reportProgress(taskId, 60, '테이블 백업', `${table} 완료 (${data.length}개 행)`);
    }
    
    reportProgress(taskId, 80, '파일 저장', '백업 파일 작성 중');
    
    // JSON 형태로 백업 저장
    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
    
    reportProgress(taskId, 100, '백업 완료', `백업 파일: ${backupPath}`);
    
    return {
      success: true,
      backupPath,
      tables: Object.keys(backupData),
      totalRecords: Object.values(backupData).reduce((sum, records) => sum + records.length, 0)
    };
    
  } catch (error) {
    throw new Error(`백업 실패: ${error.message}`);
  }
}

/**
 * 데이터 내보내기 작업
 */
async function handleExportData(taskId, params) {
  const fs = require('fs').promises;
  
  try {
    reportProgress(taskId, 10, '내보내기 준비', '필터 조건 적용 중');
    
    const { format = 'json', filters = {}, exportPath } = params;
    const connection = getDatabaseConnection();
    
    if (!connection) {
      throw new Error('데이터베이스 연결 실패');
    }
    
    // WHERE 조건 구성
    const whereConditions = ['is_archived = 0'];
    const queryParams = [];
    
    if (filters.project) {
      whereConditions.push('project = ?');
      queryParams.push(filters.project);
    }
    
    if (filters.importance_min) {
      whereConditions.push('importance_score >= ?');
      queryParams.push(filters.importance_min);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    reportProgress(taskId, 30, '데이터 추출', '메모리 데이터 조회 중');
    
    const data = await connection.all(
      `SELECT * FROM work_memories WHERE ${whereClause} ORDER BY created_at DESC`,
      queryParams
    );
    
    reportProgress(taskId, 60, '데이터 변환', `${data.length}개 레코드 변환 중`);
    
    let exportData;
    let fileExtension;
    
    switch (format) {
      case 'csv':
        exportData = convertToCsv(data);
        fileExtension = 'csv';
        break;
      case 'json':
      default:
        exportData = JSON.stringify(data, null, 2);
        fileExtension = 'json';
        break;
    }
    
    reportProgress(taskId, 80, '파일 저장', '내보내기 파일 작성 중');
    
    const finalPath = exportPath || `./export_${Date.now()}.${fileExtension}`;
    await fs.writeFile(finalPath, exportData, 'utf8');
    
    reportProgress(taskId, 100, '내보내기 완료', `파일: ${finalPath}`);
    
    return {
      success: true,
      exportPath: finalPath,
      recordCount: data.length,
      format
    };
    
  } catch (error) {
    throw new Error(`내보내기 실패: ${error.message}`);
  }
}

/**
 * CSV 변환 헬퍼
 */
function convertToCsv(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header] || '';
      // CSV 이스케이프 처리
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

/**
 * 메인 메시지 핸들러
 */
if (parentPort) {
  parentPort.on('message', async (message) => {
    const { type, taskId, taskType, taskName, params } = message;
    
    switch (type) {
      case 'execute':
        currentTask = { taskId, taskType };
        isCancelled = false;
        
        try {
          // 작업 시작 보고
          reportProgress(taskId, 0, '작업 시작', `${taskName} 시작`);
          
          // 해당 작업 핸들러 실행
          const handler = taskHandlers[taskType];
          if (!handler) {
            throw new Error(`Unknown task type: ${taskType}`);
          }
          
          // 진행률 추적이 활성화된 경우 params에 추가
          const taskParams = {
            ...params,
            enable_progress: true,
            progress_task_id: taskId
          };
          
          const result = await handler(taskParams);
          
          if (!isCancelled) {
            reportCompleted(taskId, result);
          }
          
        } catch (error) {
          if (!isCancelled) {
            reportFailed(taskId, error.message);
          }
        } finally {
          currentTask = null;
        }
        break;
        
      case 'cancel':
        if (currentTask && currentTask.taskId === taskId) {
          isCancelled = true;
          reportFailed(taskId, '작업이 취소되었습니다');
        }
        break;
    }
  });
  
  // 워커 준비 완료 신호
  parentPort.postMessage({ type: 'ready' });
}
