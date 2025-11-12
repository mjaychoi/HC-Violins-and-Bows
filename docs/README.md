# 📚 문서 인덱스

HC Violins and Bows 프로젝트의 모든 문서를 한눈에 볼 수 있는 인덱스입니다.

## 🚀 시작하기

### 신규 개발자용
1. [프로젝트 README](../README.md) - 프로젝트 개요 및 시작 가이드
2. [마이그레이션 가이드](./migrations/README.md) - 데이터베이스 마이그레이션 (최신)
3. [데이터베이스 마이그레이션 가이드](./DATABASE_MIGRATION.md) - 데이터베이스 설정 (레거시)
4. [프로덕션 배포 가이드](./DEPLOYMENT.md) - 배포 준비 및 실행

### 기능별 가이드
- [캘린더 설정 가이드](./CALENDAR_SETUP_GUIDE.md) - 캘린더 기능 설정
- [캘린더 문제 해결](./TROUBLESHOOTING_CALENDAR.md) - 캘린더 관련 문제 해결

---

## 📋 문서 목록

### 🚀 배포 및 운영

#### [프로덕션 배포 가이드](./DEPLOYMENT.md)
- 배포 전 체크리스트
- 환경 설정 (GitHub, Vercel, Supabase)
- 배포 프로세스 (자동/수동)
- 배포 후 검증
- 모니터링 및 알림
- 문제 해결

#### [마이그레이션 가이드](./migrations/README.md) ⭐ (권장)
- 통합 마이그레이션 가이드
- 스키마 확인 방법
- 마이그레이션 실행 방법
- 문제 해결

#### [데이터베이스 마이그레이션 가이드](./DATABASE_MIGRATION.md) (레거시)
- 마이그레이션 파일 목록
- 실행 방법 (대시보드/CLI/psql)
- 마이그레이션 확인
- 문제 해결

---

### 📅 캘린더 기능

#### [캘린더 설정 가이드](./CALENDAR_SETUP_GUIDE.md)
- 캘린더 기능 설정 방법
- 사용 방법
- 기능 설명

#### [캘린더 구현 현황](./CALENDAR_IMPLEMENTATION_STATUS.md)
- 완료된 작업
- 다음 단계
- 구현 계획

#### [캘린더 문제 해결](./TROUBLESHOOTING_CALENDAR.md)
- 일반적인 에러 및 해결 방법
- 디버깅 팁

---

### 📊 프로젝트 상태 및 분석

#### [기능 완성도 분석](./FEATURE_COMPLETION_ANALYSIS.md)
- 기능별 완성도 평가
- 누락된 기능 목록
- 기능별 상세 분석

#### [품질 리포트](./QUALITY_REPORT.md)
- 전체 점수 및 평가
- 기술적 품질 분석
- 기능 완성도 분석
- 권장 사항

#### [테스트 커버리지 분석](./TEST_COVERAGE_ANALYSIS.md)
- 현재 커버리지 상태
- 커버리지가 높은/낮은 파일
- 개선 계획
- 테스트 작성 가이드

#### [개선 제안](./IMPROVEMENT_SUGGESTIONS.md)
- UX/UI 개선 사항
- 성능 최적화
- 에러 처리 개선
- 접근성 개선
- 코드 품질 개선

---

### 🛠️ 개발 가이드

#### [구현 계획](./IMPLEMENTATION_PLAN.md)
- 캘린더 기능 구현 계획
- 데이터베이스 스키마 설계
- 타입 정의
- API/Hooks 구현
- UI 컴포넌트
- 테스팅 개선

#### [스켈레톤 개선 요약](./SKELETON_IMPROVEMENT_SUMMARY.md)
- 스켈레톤 컴포넌트 생성
- 일관성 개선
- 코드 품질 향상

---

## 📁 문서 구조

```
docs/
├── README.md                          # 이 파일 (문서 인덱스)
├── DEPLOYMENT.md                      # 프로덕션 배포 가이드
├── DATABASE_MIGRATION.md              # 데이터베이스 마이그레이션 가이드 (레거시)
│
├── migrations/                        # 마이그레이션 관련 문서
│   ├── README.md                      # 통합 마이그레이션 가이드 (권장)
│   ├── database-schema.sql            # 데이터베이스 스키마 (참고용)
│   └── migration-tagging-system.sql   # 태깅 시스템 마이그레이션
│
├── archives/                          # 아카이브 문서 (오래된 문서)
│   ├── README.md                      # 아카이브 문서 설명
│   └── ...                            # 오래된 문서들
│
├── CALENDAR_SETUP_GUIDE.md            # 캘린더 설정 가이드
├── CALENDAR_IMPLEMENTATION_STATUS.md  # 캘린더 구현 현황
├── TROUBLESHOOTING_CALENDAR.md        # 캘린더 문제 해결
│
├── FEATURE_COMPLETION_ANALYSIS.md     # 기능 완성도 분석
├── QUALITY_REPORT.md                  # 품질 리포트
├── TEST_COVERAGE_ANALYSIS.md          # 테스트 커버리지 분석
├── IMPROVEMENT_SUGGESTIONS.md         # 개선 제안
│
├── IMPLEMENTATION_PLAN.md             # 구현 계획
└── SKELETON_IMPROVEMENT_SUMMARY.md    # 스켈레톤 개선 요약
```

---

## 🔍 문서 검색

### 배포 관련
- 배포 가이드: [DEPLOYMENT.md](./DEPLOYMENT.md)
- 마이그레이션: [migrations/README.md](./migrations/README.md) ⭐ (권장)
- 마이그레이션 (레거시): [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md)

### 캘린더 관련
- 설정: [CALENDAR_SETUP_GUIDE.md](./CALENDAR_SETUP_GUIDE.md)
- 문제 해결: [TROUBLESHOOTING_CALENDAR.md](./TROUBLESHOOTING_CALENDAR.md)
- 구현 현황: [CALENDAR_IMPLEMENTATION_STATUS.md](./CALENDAR_IMPLEMENTATION_STATUS.md)

### 품질 및 분석
- 기능 완성도: [FEATURE_COMPLETION_ANALYSIS.md](./FEATURE_COMPLETION_ANALYSIS.md)
- 품질 리포트: [QUALITY_REPORT.md](./QUALITY_REPORT.md)
- 테스트 커버리지: [TEST_COVERAGE_ANALYSIS.md](./TEST_COVERAGE_ANALYSIS.md)
- 개선 제안: [IMPROVEMENT_SUGGESTIONS.md](./IMPROVEMENT_SUGGESTIONS.md)

---

## 📝 문서 작성 가이드

### 문서 구조
1. **제목**: 명확하고 간결한 제목
2. **목차**: 긴 문서는 목차 포함
3. **섹션**: 논리적인 섹션 구분
4. **코드 블록**: 코드는 언어 태그 포함
5. **체크리스트**: 작업 항목은 체크리스트 형식

### 문서 네이밍
- 대문자로 시작
- 단어는 언더스코어(`_`) 또는 하이픈(`-`)으로 구분
- 예: `CALENDAR_SETUP_GUIDE.md`, `DEPLOYMENT.md`

### 문서 업데이트
- 새로운 기능 추가 시 관련 문서 업데이트
- 변경 사항이 있으면 문서도 함께 업데이트
- 더 이상 사용되지 않는 문서는 삭제 또는 보관

---

## 🔗 관련 링크

### 프로젝트
- [프로젝트 README](../README.md)
- [남은 작업 요약](../REMAINING_TASKS_SUMMARY.md) ⭐ (최신)
- [아카이브 문서](./archives/README.md) - 오래된 문서

### 외부 리소스
- [Next.js 문서](https://nextjs.org/docs)
- [Supabase 문서](https://supabase.com/docs)
- [Vercel 문서](https://vercel.com/docs)

---

## 📞 문의

문서에 대한 질문이나 제안사항이 있으면 이슈를 생성해주세요.

---

**최종 업데이트**: 2025-01-01

