# 프로덕션 배포 전 체크리스트

## 🔴 긴급 수정 필요 (배포 차단)

### 1. ✅ ESLint 에러 수정 완료
- **문제**: `calendar/__tests__/page.test.tsx` display-name 에러
- **상태**: 수정 완료
- **영향**: 빌드 실패 → 배포 불가

### 2. ✅ FilterGroup 자동 확장 기능
- **문제**: activeCount 변경 시 자동 확장이 동작하지 않음
- **상태**: useEffect 추가 완료
- **영향**: UX 문제 (활성 필터 있어도 접혀있음)

### 3. ✅ 접근성 개선
- **문제**: FilterGroup 헤더 버튼에 aria 속성 부족
- **상태**: aria-expanded, aria-controls 추가 완료
- **영향**: 접근성 저하

## ⚠️ 중요하지만 배포 가능한 이슈

### 4. 에러 핸들링 ✅
- **상태**: 모든 삭제 작업에 `handleError` 사용 중
- **확인 항목**:
  - ✅ ClientsPage: 삭제 에러 핸들링 완료
  - ✅ CalendarPage: 삭제 에러 핸들링 완료
  - ✅ FormPage: 삭제 에러 핸들링 완료

### 5. ConfirmDialog 통일 ✅
- **상태**: 모든 페이지에서 `window.confirm` 대신 `ConfirmDialog` 사용
- **확인 항목**:
  - ✅ ClientList: 객체 전달 방식으로 변경
  - ✅ TaskList: 객체 전달 방식으로 변경
  - ✅ ConnectionList: 객체 전달 방식으로 변경

### 6. 타입 안정성
- **상태**: 타입 체크 통과 확인 필요
- **확인 항목**:
  - 모든 삭제 핸들러가 객체를 받도록 타입 업데이트 완료

## 📋 배포 전 확인 사항

### 환경 변수 설정
- [ ] `NEXT_PUBLIC_SUPABASE_URL` 설정 확인
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정 확인
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 설정 확인 (서버 사이드만)
- [ ] `NEXT_PUBLIC_APP_URL` 프로덕션 URL로 설정
- [ ] `NODE_ENV=production` 확인

### 빌드 확인
- [ ] `npm run build` 성공
- [ ] 타입 체크 통과 (`npm run type-check`)
- [ ] ESLint 통과 (`npm run lint`)
- [ ] 모든 테스트 통과 (`npm test`)

### 성능 최적화
- [ ] Dynamic import 사용 (CalendarView, ClientList 등)
- [ ] 이미지 최적화 확인
- [ ] 번들 크기 확인

### 보안
- [ ] 환경 변수 노출 여부 확인
- [ ] API 키 클라이언트 노출 확인
- [ ] 인증/인가 로직 확인

### 접근성
- [ ] ARIA 속성 확인
- [ ] 키보드 네비게이션 확인
- [ ] 스크린 리더 호환성 확인

### 브라우저 호환성
- [ ] 주요 브라우저 테스트 (Chrome, Firefox, Safari, Edge)
- [ ] 모바일 브라우저 테스트

### 에러 모니터링
- [ ] Sentry 설정 확인 (선택사항)
- [ ] 에러 로깅 확인
- [ ] ErrorBoundary 동작 확인

## ✅ 현재 상태

### 완료된 항목
1. ✅ 삭제 확인 흐름 통일 (ConfirmDialog)
2. ✅ FilterGroup 기본 상태 개선 (자동 확장)
3. ✅ 접근성 개선 (ARIA 속성)
4. ✅ 테스트 케이스 추가
5. ✅ 에러 핸들링 검증

### 확인 필요
1. 빌드 성공 여부 (ESLint 에러 수정 후 재확인 필요)
2. 프로덕션 환경 변수 설정
3. 실제 브라우저에서 테스트

## 🚀 배포 가능 여부

**현재 상태**: ⚠️ **빌드 에러 수정 후 배포 가능**

**남은 작업**:
1. ESLint 에러 완전히 수정
2. 빌드 성공 확인
3. 프로덕션 환경 변수 설정
4. 스테이징 환경에서 테스트

**예상 소요 시간**: 30분 ~ 1시간
