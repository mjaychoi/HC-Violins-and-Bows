# HC Violins and Bows - 할 일 목록

## 🚨 1순위: 필수 작업 (즉시 수행 필요)

### 1. 데이터베이스 업데이트

- [ ] Supabase 대시보드에서 SQL Editor 열기
- [ ] 다음 SQL 실행:
  ```sql
  ALTER TABLE instruments ADD COLUMN IF NOT EXISTS subtype TEXT;
  ```
- [ ] 테이블 스키마 확인

### 2. 인증 시스템 완성

- [ ] 로그인 페이지 기능 완성
- [ ] 회원가입 페이지 구현
- [ ] 세션 관리 구현
- [ ] 로그아웃 기능
- [ ] 인증 상태 관리 (Context/Redux)

### 3. 환경 변수 설정

- [ ] `.env.local` 파일 생성 및 설정
- [ ] Vercel 환경 변수 설정:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

---

## 🎯 2순위: 핵심 기능 구현

### 4. 이미지 업로드 기능

- [ ] Supabase Storage 설정
- [ ] 이미지 업로드 컴포넌트 구현
- [ ] 이미지 미리보기 기능
- [ ] 이미지 리사이징/압축
- [ ] 이미지 갤러리 뷰

### 5. Sales History 기능

- [ ] Sales History 페이지 생성
- [ ] 판매 기록 CRUD 구현
- [ ] 판매 통계/차트
- [ ] 판매 리포트 기능

### 6. Customer 페이지 완성

- [ ] Customer 목록/검색
- [ ] Customer 상세 정보
- [ ] Customer별 구매 이력
- [ ] Customer 통계

### 7. Instruments 페이지 확장

- [ ] 고급 필터링 구현
- [ ] 정렬 기능
- [ ] 검색 기능 개선
- [ ] 인스트루먼트 상세 페이지

---

## 🧪 3순위: 품질 향상

### 8. E2E 테스트 확장

- [ ] Dashboard E2E 테스트
- [ ] Form E2E 테스트
- [ ] Instruments E2E 테스트
- [ ] 통합 테스트 시나리오

### 9. 반응형 디자인

- [ ] 모바일 레이아웃 최적화
- [ ] 태블릿 레이아웃
- [ ] 터치 제스처 지원
- [ ] 모바일 네비게이션

### 10. 성능 최적화

- [ ] 대용량 리스트 가상화 (react-window)
- [ ] 이미지 lazy loading
- [ ] 코드 스플리팅
- [ ] 메모리 누수 체크

### 11. UX 개선

- [ ] 로딩 스켈레톤 UI
- [ ] 에러 상태 UI
- [ ] Empty State UI
- [ ] Toast 알림 시스템
- [ ] 키보드 단축키

---

## 🔒 4순위: 보안 및 배포

### 12. RLS 정책 세부화

- [ ] 테이블별 세부 RLS 정책
- [ ] 사용자별 권한 관리
- [ ] 데이터 접근 제어

### 13. CI/CD 완성

- [ ] GitHub Actions 설정 확인
- [ ] Vercel 연동 확인
- [ ] 자동 배포 설정
- [ ] 환경별 배포 전략

### 14. 모니터링 및 에러 추적

- [ ] Sentry 연동
- [ ] 로깅 시스템
- [ ] 에러 알림 설정
- [ ] 성능 모니터링

---

## 📋 추가 개선 사항

- [ ] 다국어 지원 (i18n)
- [ ] 다크 모드
- [ ] 프린트 기능
- [ ] 데이터 내보내기 (CSV, PDF)
- [ ] 백업/복원 기능
- [ ] 관리자 대시보드
- [ ] 알림 시스템
- [ ] 댓글/노트 기능
- [ ] 태그 시스템 개선
- [ ] 검색 고도화

---

## 🐛 알려진 이슈

- [x] ClientModal 사이드 페이지를 중앙 모달로 변경 완료
- [x] 사이드바 통일 완료
- [x] subtype 에러 수정 완료
- [ ] 빌드 시 일부 경고 메시지 (ESLint)

---

## 📝 참고사항

- Supabase 프로젝트: https://supabase.com/dashboard
- Vercel 프로젝트: https://vercel.com/dashboard
- GitHub Actions: https://github.com/YOUR_REPO/actions
