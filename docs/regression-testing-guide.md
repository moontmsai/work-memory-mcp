# 회귀 테스트 가이드

중요도 점수 시스템 도입 후 기존 기능의 무결성을 확인하는 회귀 테스트 가이드입니다.

## 📋 테스트 범위

### 1. 기존 API 호환성
- ✅ importance_score 없이 메모리 추가 (기본값 50 적용)
- ✅ 기존 매개변수로 리스트 조회
- ✅ 기존 방식으로 검색 수행

### 2. 데이터 무결성
- ✅ 기존 데이터 구조 및 관계 보존
- ✅ 외래 키 관계 유지
- ✅ 트랜잭션 무결성 보장

### 3. 성능 회귀 없음
- ✅ 기본 작업 성능 유지 (추가/조회/검색)
- ✅ 인덱스 활용 쿼리 성능
- ✅ 대량 데이터 처리 성능

### 4. 기존 워크플로우 동작
- ✅ 완전한 워크플로우: 생성→조회→검색→업데이트
- ✅ Todo/Memory 타입 구분 유지
- ✅ 프로젝트/태그 기반 필터링

## 🚀 테스트 실행 방법

### 전체 회귀 테스트 실행
```bash
npm run test:regression
```

### 호환성 테스트만 실행
```bash
npm run test:compatibility
```

### 중요도 점수 시스템 테스트
```bash
npm run test:importance-score
```

### 모든 테스트 실행
```bash
npm test
```

## 📊 성능 기준

### 추가 작업 (100개 메모리)
- ⏱️ 기준: 10초 이내
- 🎯 목표: 5초 이내

### 조회 작업
- ⏱️ 기준: 1초 이내
- 🎯 목표: 500ms 이내

### 검색 작업
- ⏱️ 기준: 2초 이내
- 🎯 목표: 1초 이내

### 쿼리 성능 (500개 데이터)
- ⏱️ 기준: 각 쿼리 100ms 이내
- 🎯 목표: 50ms 이내

## 🔍 테스트 케이스

### 1. 기존 API 호환성 테스트
```typescript
// importance_score 없이 메모리 추가
const result = await handleAddWorkMemory({
  content: 'Legacy memory',
  project: 'legacy-project',
  tags: ['legacy'],
  created_by: 'test'
});
// 기본값 50점이 적용되어야 함
```

### 2. 데이터 무결성 테스트
```typescript
// 복잡한 데이터 구조 생성 및 검증
await handleAddWorkMemory({
  content: 'Complex memory',
  context: 'Background context',
  requirements: 'Specific requirements',
  work_type: 'todo',
  importance_score: 85
});
// 모든 관련 테이블에 데이터가 올바르게 저장되는지 확인
```

### 3. 성능 회귀 테스트
```typescript
// 100개 메모리 연속 추가
for (let i = 0; i < 100; i++) {
  await handleAddWorkMemory({
    content: `Performance test ${i}`,
    importance_score: Math.random() * 100
  });
}
// 10초 이내 완료되어야 함
```

### 4. 마이그레이션 시나리오 테스트
```typescript
// 기존 데이터와 새 데이터 혼재 상황
// 기본값 50점을 가진 기존 데이터
// 명시적 점수를 가진 새 데이터
// 혼재된 데이터가 올바르게 처리되는지 확인
```

## ❌ 실패 시 대응

### 1. API 호환성 실패
- 기존 매개변수 처리 로직 확인
- 기본값 설정 확인
- 오류 메시지 형식 일관성 확인

### 2. 데이터 무결성 실패
- 외래 키 제약 조건 확인
- 트랜잭션 범위 검토
- 인덱스 무결성 확인

### 3. 성능 회귀 실패
- 쿼리 실행 계획 분석
- 인덱스 사용률 확인
- 병목 지점 식별 및 최적화

### 4. 워크플로우 실패
- 단계별 동작 확인
- 상태 전이 검증
- 오류 복구 메커니즘 점검

## 📈 연속 모니터링

### CI/CD 파이프라인에 포함
```yaml
# GitHub Actions 예시
- name: Run Regression Tests
  run: |
    npm run test:regression
    npm run test:compatibility
    npm run test:importance-score
```

### 성능 메트릭 추적
- 각 테스트 실행 시간
- 메모리 사용량
- 데이터베이스 쿼리 성능

### 정기 검증
- 매주 전체 회귀 테스트 실행
- 성능 변화 추이 모니터링
- 새로운 테스트 케이스 추가

## 🎯 성공 기준

### 필수 조건
- ✅ 모든 기존 API가 정상 동작
- ✅ 데이터 무결성 100% 유지
- ✅ 성능 저하 없음 (기준 이내)
- ✅ 기존 워크플로우 완전 지원

### 권장 사항
- 🎯 새로운 기능과 기존 기능의 매끄러운 통합
- 🎯 사용자 경험 향상
- 🎯 시스템 안정성 개선

## 📝 리포팅

### 테스트 결과 요약
- 총 테스트 케이스 수
- 성공/실패 비율
- 성능 메트릭
- 발견된 이슈 및 해결 방안

### 권장 후속 조치
- 추가 테스트 케이스 개발
- 성능 최적화 기회
- 문서화 개선 사항
