# 페이지 전환 시 데이터 보존

## 구현 완료 ✅

### 1. URL 쿼리 파라미터 동기화

**구현된 기능**:
- `useURLState` 훅 생성: URL 쿼리 파라미터와 상태를 동기화
- `usePageFilters` 훅 확장: `syncWithURL` 옵션 추가
- 페이지 전환 시 검색어와 필터 상태가 URL에 저장되어 보존됨

### 2. 적용된 페이지

#### ✅ Dashboard (Items)
- **URL 파라미터**: `?search=검색어`
- **상태 보존**: 검색어가 URL에 저장되어 페이지 전환 후에도 유지

#### ✅ Clients
- **URL 파라미터**: `?search=검색어`
- **상태 보존**: 검색어가 URL에 저장되어 페이지 전환 후에도 유지

#### ✅ Instruments
- **URL 파라미터**: `?search=검색어`
- **상태 보존**: 검색어가 URL에 저장되어 페이지 전환 후에도 유지

#### ✅ Calendar
- **URL 파라미터**: `?search=검색어`
- **상태 보존**: 검색어가 URL에 저장되어 페이지 전환 후에도 유지

### 3. 사용 방법

```typescript
// usePageFilters에 syncWithURL 옵션 추가
const {
  searchTerm,
  setSearchTerm,
  // ... 기타 필터 상태
} = usePageFilters({
  items,
  // ... 기타 설정
  syncWithURL: true, // URL 동기화 활성화
  urlParamMapping: {
    searchTerm: 'search', // URL 파라미터 이름 (선택사항)
  },
});
```

### 4. 동작 방식

1. **초기 로드**: URL에서 `search` 파라미터를 읽어 초기 검색어로 설정
2. **검색어 변경**: 검색어가 변경되면 자동으로 URL 업데이트
3. **페이지 전환**: 다른 페이지로 이동했다가 돌아와도 검색어 유지
4. **필터 초기화**: `clearAllFilters` 호출 시 URL도 함께 초기화

### 5. URL 파라미터 형식

- **검색어**: `?search=검색어`
- **날짜 범위** (향후 확장 가능): `?dateRange=2024-01-01,2024-12-31`
- **필터** (향후 확장 가능): `?filters=status:Available,type:Violin`

### 6. 기술적 세부사항

- **SSR 안전**: `window.location`을 직접 사용하여 SSR 환경에서도 안전
- **스크롤 방지**: URL 업데이트 시 스크롤 위치 유지 (`scroll: false`)
- **성능**: `useCallback`과 `useMemo`로 최적화
- **타입 안전**: TypeScript로 완전한 타입 지원

## 향후 개선 가능 사항

### 1. 필터 상태도 URL에 저장
현재는 검색어만 URL에 저장됩니다. 필터 상태도 URL에 저장하려면:
- `filters` 객체를 직렬화하여 URL에 저장
- 복잡한 필터는 JSON 인코딩 또는 구분자 사용

### 2. 페이지네이션 상태 저장
현재 페이지 번호도 URL에 저장 가능:
```typescript
syncWithURL: true,
urlParamMapping: {
  searchTerm: 'search',
  currentPage: 'page', // 추가
},
```

### 3. 정렬 상태 저장
정렬 컬럼과 방향도 URL에 저장 가능:
```typescript
urlParamMapping: {
  searchTerm: 'search',
  sortBy: 'sort',
  sortOrder: 'order',
},
```

## 결론

✅ **검색어 상태가 URL에 보존되어 페이지 전환 후에도 유지됩니다.**

- 모든 주요 페이지(Dashboard, Clients, Instruments, Calendar)에 적용
- 사용자가 작업 흐름이 끊기지 않음
- 브라우저 뒤로가기/앞으로가기 버튼으로도 상태 복원 가능
- URL 공유 시 검색 상태도 함께 공유됨
