# 성능 최적화 가이드

중요도 점수 시스템의 성능을 최적화하기 위한 종합 가이드입니다.

## 📊 성능 최적화 개요

### 최적화 영역
1. **데이터베이스 인덱스 최적화**
2. **쿼리 성능 개선** 
3. **메모리 사용량 최적화**
4. **캐싱 전략**
5. **배치 작업 최적화**

## 🗂️ 인덱스 최적화

### 추가된 인덱스
```sql
-- 기본 인덱스
CREATE INDEX idx_work_memories_importance_score ON work_memories(importance_score);

-- 복합 인덱스 (성능 최적화)
CREATE INDEX idx_work_memories_importance_score_created ON work_memories(importance_score DESC, created_at);
CREATE INDEX idx_work_memories_score_archived ON work_memories(importance_score DESC, is_archived);
CREATE INDEX idx_work_memories_score_project ON work_memories(importance_score DESC, project);
CREATE INDEX idx_work_memories_archived_score_created ON work_memories(is_archived, importance_score DESC, created_at DESC);
CREATE INDEX idx_work_memories_worktype_score ON work_memories(work_type, importance_score DESC);
```

### 인덱스 활용 쿼리 패턴
```sql
-- ✅ 최적화된 쿼리 (인덱스 활용)
SELECT * FROM work_memories 
WHERE importance_score >= 80 
ORDER BY importance_score DESC 
LIMIT 20;

-- ✅ 복합 조건 최적화  
SELECT * FROM work_memories 
WHERE is_archived = 0 AND importance_score >= 70 
ORDER BY importance_score DESC, created_at DESC;

-- ❌ 비효율적인 쿼리 (인덱스 미활용)
SELECT * FROM work_memories 
WHERE LOWER(content) LIKE '%test%' 
ORDER BY created_at;
```

## ⚡ 쿼리 성능 개선

### 1. 범위 쿼리 최적화
```typescript
// 고중요도 메모리 조회 (인덱스 활용)
const highPriorityMemories = await connection.all(`
  SELECT id, content, importance_score, created_at
  FROM work_memories 
  WHERE importance_score >= ? AND is_archived = 0
  ORDER BY importance_score DESC, created_at DESC
  LIMIT ?
`, [80, 20]);
```

### 2. 집계 쿼리 최적화
```typescript
// 프로젝트별 평균 중요도 (복합 인덱스 활용)
const projectStats = await connection.all(`
  SELECT project, 
         COUNT(*) as count,
         AVG(importance_score) as avg_score,
         MAX(importance_score) as max_score
  FROM work_memories 
  WHERE is_archived = 0 AND project IS NOT NULL
  GROUP BY project
  HAVING count >= 5
  ORDER BY avg_score DESC
`);
```

## 🧠 메모리 최적화

### PerformanceOptimizer 사용
```typescript
import { PerformanceOptimizer } from '../utils/performance-optimizer.js';

const optimizer = PerformanceOptimizer.getInstance();

// 데이터베이스 최적화 설정 적용
await optimizer.applyOptimizationSettings(connection);

// 캐시와 함께 쿼리 실행
const result = await optimizer.executeWithCache(
  connection,
  'SELECT * FROM work_memories WHERE importance_score >= ?',
  [80],
  'high_importance_memories',
  5 * 60 * 1000 // 5분 TTL
);
```

## 💾 캐싱 전략

### 통계 데이터 캐싱
```typescript
// 중요도 분포 통계 (10분 캐싱)
const distribution = await optimizer.getCachedStats(connection, 'importance_distribution');

// 프로젝트 개수 통계 (10분 캐싱) 
const projectCounts = await optimizer.getCachedStats(connection, 'project_counts');
```

## 🔄 배치 작업 최적화

### 대량 데이터 삽입
```typescript
// 배치 삽입으로 성능 향상
const memoryData = [
  ['id1', 'content1', 80, 'project1', '["tag1"]', '2024-01-01', '2024-01-01', 'user1', 0, 0],
  // ... 더 많은 데이터
];

await optimizer.batchInsert(
  connection,
  'work_memories', 
  ['id', 'content', 'importance_score', 'project', 'tags', 'created_at', 'updated_at', 'created_by', 'access_count', 'is_archived'],
  memoryData,
  100 // 배치 크기
);
```

## 📈 성능 모니터링

### 쿼리 성능 분석
```typescript
// 개별 쿼리 프로파일링
const query = 'SELECT * FROM work_memories WHERE importance_score >= 80';
const profile = await optimizer.profileQuery(connection, query);

console.log(`실행 시간: ${profile.executionTime}ms`);
console.log(`사용된 인덱스: ${profile.indexesUsed.join(', ')}`);
```

### 성능 분석 도구 사용
```typescript
import { handlePerformanceAnalysis } from '../tools/performance-analysis.js';

// 전체 성능 분석
const analysisResult = await handlePerformanceAnalysis({
  analysis_type: 'all',
  include_recommendations: true
});
```

## 🎯 성능 기준 및 목표

### 응답 시간 목표
- **기본 조회**: 50ms 이내
- **복잡한 집계**: 200ms 이내  
- **검색 쿼리**: 100ms 이내
- **배치 삽입**: 1000개당 2초 이내

### 처리량 목표
- **동시 연결**: 최대 100개
- **초당 쿼리**: 1000 QPS
- **메모리 사용량**: 100MB 이하

## 🔧 최적화 도구 사용법

### npm 스크립트
```bash
# 성능 테스트 실행
npm run test:performance

# 성능 분석 실행 (MCP 도구 사용)
# analyze_performance 도구를 통해 실행
```

### 정기 최적화 작업
```typescript
// 일일 최적화 작업
async function dailyOptimization() {
  const optimizer = PerformanceOptimizer.getInstance();
  
  // 1. 캐시 정리
  optimizer.clearCache();
  
  // 2. 메모리 최적화
  await optimizer.optimizeMemoryUsage(connection);
  
  // 3. 통계 업데이트
  await connection.run('ANALYZE');
}
```

이 가이드를 통해 중요도 점수 시스템의 성능을 지속적으로 모니터링하고 최적화할 수 있습니다.
