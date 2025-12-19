# 알림 시스템 구현 가이드

## 현재 상태 분석

### ✅ Phase 1 완료 (2025-01-XX)

1. **알림 배지 컴포넌트**: `NotificationBadge.tsx` 구현 완료
   - 위치: `src/components/common/NotificationBadge.tsx`
   - 기능: Overdue/Today/Upcoming 카운트 표시, 툴팁, 클릭 핸들러

2. **알림 훅**: `useNotifications.ts` 구현 완료
   - 위치: `src/hooks/useNotifications.ts`
   - 기능: 작업 감지, 알림 계산, 카운트 제공

3. **페이지 통합 훅**: `usePageNotifications.ts` 구현 완료
   - 위치: `src/hooks/usePageNotifications.ts`
   - 기능: 알림 배지 + 클릭 핸들링 + 네비게이션 통합

4. **대시보드 통합**: Dashboard 페이지에 알림 배지 추가 완료
   - 위치: `src/app/dashboard/page.tsx`
   - 기능: 헤더에 알림 배지 표시, 클릭 시 캘린더로 이동

5. **캘린더 통합**: Calendar 페이지에 알림 배지 추가 완료
   - 위치: `src/app/calendar/page.tsx`
   - 기능: 헤더에 알림 배지 표시

6. **테스트**: 모든 컴포넌트와 훅에 대한 테스트 작성 완료
   - `src/components/common/__tests__/NotificationBadge.test.tsx`
   - `src/hooks/__tests__/useNotifications.test.ts`
   - `src/hooks/__tests__/usePageNotifications.test.tsx`

### ✅ Phase 2: 브라우저 알림 (완료 - 2025-01-XX)

1. ✅ 브라우저 알림 권한 요청 (`NotificationPermissionButton` 컴포넌트)
2. ✅ 주기적 체크 (페이지 열려있을 때, 5분마다)
3. ✅ 브라우저 Notification API 통합 (`useBrowserNotifications` 훅)
4. ✅ 중복 알림 방지 (localStorage 기반)
5. ✅ 알림 클릭 시 해당 페이지로 이동
6. ✅ `usePageNotifications`에 자동 통합

### ✅ Phase 3: 서버 사이드 알림 (완료 - 2025-01-15)

1. ✅ 알림 설정 테이블 생성 (`notification_settings`)
2. ✅ Supabase Edge Function 생성 (`send-notifications`)
3. ✅ 이메일 템플릿 및 전송 로직 (Resend API)
4. ✅ 알림 설정 API 라우트 (`/api/notification-settings`)

---

## 📋 구현 방안: 3단계 접근

### 🟢 1단계: 즉시 구현 가능 (1-2시간)

**목표**: 페이지를 열었을 때 즉시 알림 표시

#### 1.1 알림 배지 컴포넌트 생성

```typescript
// src/components/common/NotificationBadge.tsx
// 대시보드/캘린더 헤더에 표시할 배지
```

#### 1.2 알림 훅 생성

```typescript
// src/hooks/useNotifications.ts
// overdue, upcoming 작업을 체크하고 알림을 관리
```

#### 1.3 대시보드 통합

- Dashboard 페이지 헤더에 알림 배지 추가
- Calendar 페이지에도 알림 표시

**장점**:

- ✅ 즉시 구현 가능
- ✅ 추가 인프라 불필요
- ✅ 사용자가 페이지 열면 바로 확인 가능

**단점**:

- ❌ 페이지를 열지 않으면 알림 안 받음
- ❌ 브라우저 밖에서는 알림 없음

---

### 🟡 2단계: 브라우저 알림 (2-3시간)

**목표**: 브라우저 API를 사용해 데스크톱 알림

#### 2.1 브라우저 알림 권한 요청

```typescript
// 브라우저 Notification API 사용
Notification.requestPermission();
```

#### 2.2 주기적 체크 (페이지 열려있을 때)

```typescript
// setInterval로 주기적으로 체크 (예: 5분마다)
// 새 overdue/upcoming 발견 시 브라우저 알림 표시
```

#### 2.3 알림 표시 로직

```typescript
// D-3, D-1, D-Day, Overdue 알림
// 중복 알림 방지 (이미 알림 받은 작업은 표시 안 함)
```

**장점**:

- ✅ 브라우저 열려있으면 자동 알림
- ✅ 사용자가 다른 탭/앱에 있어도 알림 가능
- ✅ 추가 서버 인프라 불필요

**단점**:

- ❌ 브라우저를 닫으면 알림 없음
- ❌ 모바일에서는 제한적

---

### 🔴 3단계: 서버 사이드 알림 (1-2일)

**목표**: 브라우저를 닫아도 이메일 알림

#### 3.1 Supabase Edge Functions 사용

```typescript
// supabase/functions/send-notifications/index.ts
// 매일 오전 9시 실행 (cron job)
```

#### 3.2 이메일 전송

```typescript
// Resend, SendGrid, 또는 Supabase 내장 이메일 사용
// 알림 내용:
// - 오늘 마감인 작업
// - 3일 후 마감인 작업
// - Overdue 작업 리스트
```

#### 3.3 알림 설정 테이블

```sql
-- 사용자별 알림 설정
CREATE TABLE notification_settings (
  user_id UUID PRIMARY KEY,
  email_notifications BOOLEAN DEFAULT true,
  notification_time TIME DEFAULT '09:00',
  days_before_due INTEGER[] DEFAULT ARRAY[3, 1], -- D-3, D-1
  created_at TIMESTAMP DEFAULT NOW()
);
```

**장점**:

- ✅ 브라우저 닫아도 알림 가능
- ✅ 이메일로 알림 받음
- ✅ 체계적인 알림 관리

**단점**:

- ❌ 구현 복잡도 높음
- ❌ 이메일 서비스 연동 필요
- ❌ 추가 비용 가능 (이메일 서비스)

---

## 🚀 추천 구현 순서

### 단계별 구현 계획

#### Phase 1: 즉시 구현 (오늘)

1. **알림 배지 컴포넌트** (30분)
   - `NotificationBadge.tsx` 생성
   - Overdue/Upcoming 카운트 표시

2. **알림 훅 생성** (1시간)
   - `useNotifications.ts` 구현
   - Overdue/Upcoming 작업 감지 로직

3. **대시보드 통합** (30분)
   - Dashboard 페이지에 배지 추가
   - Calendar 페이지에도 배지 추가

**예상 소요 시간**: 2시간

---

#### Phase 2: 브라우저 알림 (이번 주)

1. **브라우저 알림 권한** (30분)
   - 권한 요청 컴포넌트
   - 권한 상태 관리

2. **주기적 체크** (1시간)
   - `useEffect` + `setInterval`
   - 중복 알림 방지 로직

3. **알림 표시** (1시간)
   - Notification API 통합
   - 클릭 시 해당 페이지로 이동

**예상 소요 시간**: 2-3시간

---

#### Phase 3: 이메일 알림 (다음 주)

1. **Edge Function 설정** (2시간)
   - Supabase Edge Function 생성
   - Cron job 설정

2. **이메일 템플릿** (1시간)
   - HTML 이메일 템플릿
   - 한국어 지원

3. **알림 설정 UI** (2시간)
   - 사용자 설정 페이지
   - 알림 시간/주기 설정

**예상 소요 시간**: 1-2일

---

## 💻 Phase 1 구현 코드 (완료)

### 구현된 파일들

1. **NotificationBadge 컴포넌트**
   - 위치: `src/components/common/NotificationBadge.tsx`
   - 기능: 알림 배지 UI, 툴팁, 클릭 핸들러

2. **useNotifications 훅**
   - 위치: `src/hooks/useNotifications.ts`
   - 기능: 작업 감지, 알림 계산, 카운트 제공

3. **usePageNotifications 훅**
   - 위치: `src/hooks/usePageNotifications.ts`
   - 기능: 알림 배지 + 클릭 핸들링 + 네비게이션 통합

4. **Dashboard 페이지 통합**
   - 위치: `src/app/dashboard/page.tsx`
   - 이미 통합 완료

5. **Calendar 페이지 통합**
   - 위치: `src/app/calendar/page.tsx`
   - 이미 통합 완료

### 사용 예시

```typescript
// 페이지에서 사용
import { usePageNotifications } from '@/hooks/usePageNotifications';
import { NotificationBadge } from '@/components/common';

const { notificationBadge } = usePageNotifications({
  navigateTo: '/calendar',
  showToastOnClick: true,
  showSuccess,
});

<NotificationBadge
  overdue={notificationBadge.overdue}
  upcoming={notificationBadge.upcoming}
  today={notificationBadge.today}
  onClick={notificationBadge.onClick}
/>
```

---

## 🎯 구현 상태

### ✅ Phase 1 완료

- 알림 배지 시스템이 완전히 구현되어 사용 중입니다.
- Dashboard와 Calendar 페이지에서 작동 중입니다.

### ✅ Phase 2 완료

- 브라우저 알림 시스템이 완전히 구현되었습니다.
- `usePageNotifications` 훅에 자동으로 통합되어 있습니다.
- 권한 요청 버튼 컴포넌트 제공 (`NotificationPermissionButton`)

**구현된 기능**:

- ✅ 브라우저 알림 권한 관리
- ✅ 주기적 알림 체크 (5분마다, 설정 가능)
- ✅ 중복 알림 방지 (localStorage)
- ✅ 알림 클릭 시 해당 페이지로 이동
- ✅ 자동 알림 표시 (새로운 overdue/today/upcoming 작업 발견 시)

**사용 방법**:

```typescript
// usePageNotifications는 자동으로 브라우저 알림을 활성화합니다
const { notificationBadge } = usePageNotifications({
  navigateTo: '/calendar',
  enableBrowserNotifications: true, // 기본값: true
  browserNotificationInterval: 5 * 60 * 1000, // 5분 (기본값)
});

// 권한 요청 버튼 (선택사항)
import { NotificationPermissionButton } from '@/components/common';
<NotificationPermissionButton variant="icon" />
```

### ✅ Phase 3: 이메일 알림 (완료)

**구현된 사항**:

1. ✅ 알림 설정 테이블 (`notification_settings`)
   - 사용자별 이메일 알림 설정 저장
   - 알림 시간, D-day 설정 (days_before_due)
   - RLS 정책으로 사용자별 접근 제어

2. ✅ Supabase Edge Function (`send-notifications`)
   - 매일 오전 9시 실행 (cron job 설정 필요)
   - 활성화된 사용자에게 알림 전송
   - Overdue/Today/Upcoming 작업 분류 및 이메일 생성

3. ✅ 이메일 서비스 연동 (Resend API)
   - HTML 이메일 템플릿
   - 작업별 상세 정보 표시
   - 캘린더 링크 포함

4. ✅ 알림 설정 API (`/api/notification-settings`)
   - GET: 사용자 설정 조회
   - POST: 사용자 설정 생성/업데이트

**설정 방법**:

1. **Resend API 키 설정**

   ```bash
   # .env.local 또는 Supabase 환경 변수
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   ```

2. **Edge Function 배포**

   ```bash
   supabase functions deploy send-notifications
   ```

3. **Cron Job 설정**
   - Supabase Dashboard > Database > Cron Jobs
   - Schedule: `0 9 * * *` (매일 오전 9시)
   - Function: `send-notifications`

**상세 문서**: `supabase/functions/send-notifications/README.md`

---

## 📝 현재 상태 요약

- ✅ **Phase 1 완료**: 알림 배지 시스템 구현 및 통합 완료
- ✅ **Phase 2 완료**: 브라우저 알림 구현 및 통합 완료
- ✅ **Phase 3 완료**: 이메일 알림 구현 완료 (배포 및 설정 필요)

### 구현된 파일

**Phase 1**:

- `src/components/common/NotificationBadge.tsx` - 알림 배지 컴포넌트
- `src/hooks/useNotifications.ts` - 알림 계산 훅
- `src/hooks/usePageNotifications.ts` - 페이지 통합 훅

**Phase 2**:

- `src/utils/browserNotifications.ts` - 브라우저 알림 유틸리티
- `src/hooks/useBrowserNotifications.ts` - 브라우저 알림 훅
- `src/components/common/NotificationPermissionButton.tsx` - 권한 요청 버튼

**Phase 3**:

- `supabase/migrations/20250115000004_notification_settings.sql` - 알림 설정 테이블 마이그레이션
- `supabase/functions/send-notifications/index.ts` - Edge Function (이메일 전송)
- `supabase/functions/send-notifications/README.md` - Edge Function 문서
- `src/app/api/notification-settings/route.ts` - 알림 설정 API 라우트

**배포 필요 사항**:

1. 마이그레이션 실행: `notification_settings` 테이블 생성
2. Edge Function 배포: `supabase functions deploy send-notifications`
3. 환경 변수 설정: `RESEND_API_KEY` 설정
4. Cron Job 설정: Supabase Dashboard에서 매일 오전 9시 실행 스케줄 설정

모든 Phase가 완료되어 기본적인 알림 기능, 브라우저 알림, 그리고 이메일 알림이 모두 구현되었습니다. 배포 및 설정을 완료하면 서버 사이드 이메일 알림도 작동합니다.
