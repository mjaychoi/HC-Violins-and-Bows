# URL 상태 보존 성능 최적화

## 성능 개선 사항

### 1. Debounce 적용 ✅

**문제점**:
- 검색어 입력 중 매번 URL 업데이트 발생
- 불필요한 라우터 호출 및 브라우저 히스토리 업데이트

**해결책**:
- URL 업데이트에 debounce 적용 (기본 300ms)
- 검색어 입력이 완료된 후에만 URL 업데이트

```typescript
// usePageFilters.ts
const debouncedSearchTerm = useDebounce(searchTerm, debounceMs);

useEffect(() => {
  if (syncWithURL) {
    updateURLState({ searchTerm: debouncedSearchTerm || null });
  }
}, [debouncedSearchTerm, syncWithURL, updateURLState]);
```

### 2. 성능 최적화 기법

#### ✅ useCallback 사용
- `updateURLState`, `clearURLState` 함수 메모이제이션
- 불필요한 함수 재생성 방지

#### ✅ useMemo 사용
- `urlKeys`, `filterOptions` 등 계산 비용이 큰 값 메모이제이션
- 의존성이 변경될 때만 재계산

#### ✅ 조건부 실행
- `syncWithURL`이 false일 때는 URL 동기화 로직 실행 안 함
- 불필요한 훅 호출 방지

#### ✅ 스크롤 방지
- URL 업데이트 시 `scroll: false` 옵션 사용
- 페이지 스크롤 위치 유지

### 3. 성능 측정

#### 검색어 입력 시:
- **이전**: 입력할 때마다 URL 업데이트 (예: "test" 입력 시 4번 업데이트)
- **개선 후**: 입력 완료 후 300ms 지연 후 1번만 업데이트

#### 메모리 사용:
- 최소한의 상태만 유지
- URL 파라미터는 문자열로만 저장

#### 렌더링 최적화:
- `useEffect` 의존성 배열 최적화
- 불필요한 리렌더링 방지

### 4. 성능 비교

| 항목 | 이전 | 개선 후 |
|------|------|---------|
| URL 업데이트 빈도 | 입력마다 즉시 | Debounce 후 (300ms) |
| 불필요한 라우터 호출 | 많음 | 최소화 |
| 브라우저 히스토리 항목 | 과도함 | 최적화됨 |
| 사용자 경험 | 약간의 지연 | 부드러움 |

### 5. 추가 최적화 가능 사항

#### 1. URL 업데이트 배치 처리
여러 필터가 동시에 변경될 때:
```typescript
// 현재: 각 필터마다 개별 업데이트
// 개선: 배치로 한 번에 업데이트
const batchUpdateURL = useCallback((updates: Record<string, unknown>) => {
  // 모든 변경사항을 한 번에 URL에 반영
}, []);
```

#### 2. URL 파라미터 압축
긴 검색어나 복잡한 필터의 경우:
- Base64 인코딩 (선택적)
- 짧은 키 사용 (예: `s` 대신 `search`)

#### 3. 메모이제이션 강화
- `urlState` 계산 결과 메모이제이션
- URL 파라미터 파싱 결과 캐싱

## 결론

✅ **성능 최적화 완료**:
- Debounce 적용으로 불필요한 URL 업데이트 최소화
- useCallback, useMemo로 메모이제이션 최적화
- 조건부 실행으로 불필요한 로직 방지
- 사용자 경험 개선 (부드러운 검색 입력)

현재 구현은 성능과 사용자 경험의 좋은 균형을 제공합니다.
