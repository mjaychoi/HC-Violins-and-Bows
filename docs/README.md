# 문서 인덱스

현재 운영에 쓰는 문서만 모았습니다. 스키마의 기준은 `supabase/migrations/`입니다.

## 시작하기

1. [프로젝트 README](../README.md) — 개요와 로컬 실행
2. [사용자 가이드](./USER_GUIDE.md) — 화면별 사용 방법
3. [문제 해결](./TROUBLESHOOTING.md) — 자주 만나는 오류

## 배포와 데이터베이스

- [프로덕션 배포 가이드](./DEPLOYMENT.md) — 환경 설정, 배포, 배포 후 확인
- [프로덕션 마이그레이션 워크플로](./PRODUCTION_MIGRATION_WORKFLOW.md) — CI/프로덕션 가드가 따르는 마이그레이션 절차
- [마이그레이션 가이드](./migrations/README.md) — 로컬 스키마 확인과 마이그레이션 실행
- [데모 데이터 시드](./seed-demo-data.md) — `scripts/README.md`에서 참조하는 샘플 데이터

## 문서 구조

```
docs/
├── README.md                          # 이 파일
├── USER_GUIDE.md                      # 사용자 가이드
├── TROUBLESHOOTING.md                 # 문제 해결
├── DEPLOYMENT.md                      # 프로덕션 배포
├── PRODUCTION_MIGRATION_WORKFLOW.md   # 프로덕션 마이그레이션 워크플로
├── seed-demo-data.md                  # 데모 데이터
└── migrations/
    └── README.md                      # 마이그레이션 가이드
```

## 관련 링크

- [Next.js 문서](https://nextjs.org/docs)
- [Supabase 문서](https://supabase.com/docs)
- [Vercel 문서](https://vercel.com/docs)
