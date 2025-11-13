# 데이터베이스 비밀번호 빠른 설정 가이드

## 🚀 3단계로 설정하기

### 1단계: Supabase 대시보드에서 비밀번호 확인

1. **Supabase 대시보드 접속**
   - https://supabase.com/dashboard 접속
   - inventoryApp 프로젝트 선택

2. **Settings 메뉴 클릭**
   - 왼쪽 사이드바에서 ⚙️ **Settings** 아이콘 클릭

3. **Database 메뉴 클릭**
   - Settings 메뉴에서 **Database** 클릭

4. **Database password 확인**
   - "Database password" 섹션에서 비밀번호 확인
   - **"Show" 버튼** 클릭하여 비밀번호 표시
   - 비밀번호 복사

### 2단계: .env.local 파일 생성/수정

프로젝트 루트 디렉토리에 `.env.local` 파일을 생성하거나 수정합니다.

**파일 위치**: `/Users/soyeonhong/HC-Violins-and-Bows/.env.local`

**필요한 내용:**

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://dmilmlhquttcozxlpfxw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Database Configuration
DATABASE_PASSWORD=your_database_password_here
```

**예시:**

```env
NEXT_PUBLIC_SUPABASE_URL=https://dmilmlhquttcozxlpfxw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtaWxtbGhxdXR0Y296eGxwZnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTk4NzI4MjAsImV4cCI6MjAzNTQ0ODgyMH0.xxx
DATABASE_PASSWORD=your_actual_password_here
```

### 3단계: 확인

```bash
npm run schema:check
```

성공적으로 실행되면 비밀번호가 올바르게 설정된 것입니다!

---

## 📍 Supabase 대시보드에서 비밀번호 찾는 위치

**경로:**

1. Supabase 대시보드 접속
2. 왼쪽 사이드바 → ⚙️ **Settings** 클릭
3. **Database** 메뉴 클릭
4. **Database password** 섹션에서 확인

**스크린샷 기준:**

- 왼쪽 사이드바에서 ⚙️ **Settings** 아이콘 클릭
- Settings 메뉴에서 **Database** 클릭
- "Database password" 섹션에서 비밀번호 확인

---

## ⚠️ 주의사항

1. **`.env.local` 파일은 Git에 업로드하지 마세요**
   - `.gitignore`에 이미 포함되어 있습니다
   - 비밀번호를 GitHub에 업로드하면 보안 문제가 발생할 수 있습니다

2. **비밀번호를 잊어버린 경우**
   - Settings > Database에서 **"Reset database password"** 클릭
   - 새 비밀번호 설정 후 `.env.local` 파일도 업데이트

3. **환경 변수 이름 확인**
   - `DATABASE_PASSWORD` (대문자, 언더스코어)
   - 정확히 이 이름으로 저장되어야 합니다

---

## 🆘 문제 해결

### 문제 1: "DATABASE_PASSWORD 환경 변수가 설정되지 않았습니다"

**해결 방법:**

1. `.env.local` 파일이 프로젝트 루트에 있는지 확인
2. `DATABASE_PASSWORD` 변수가 정확히 이 이름으로 저장되어 있는지 확인
3. 파일 저장 후 터미널 재시작

### 문제 2: "비밀번호 인증 실패"

**해결 방법:**

1. 비밀번호를 다시 확인 (복사/붙여넣기 오류 확인)
2. 공백이나 특수문자가 포함되어 있는지 확인
3. 필요시 비밀번호 재설정

### 문제 3: ".env.local 파일을 찾을 수 없습니다"

**해결 방법:**

1. 프로젝트 루트 디렉토리에 `.env.local` 파일 생성
2. 파일 이름이 정확히 `.env.local`인지 확인 (앞에 점 포함)
3. 파일 권한 확인

---

## ✅ 확인 방법

비밀번호를 설정한 후:

```bash
# 스키마 확인
npm run schema:check

# 또는 직접 실행
tsx scripts/check-schema.ts
```

성공 메시지가 나타나면 비밀번호가 올바르게 설정된 것입니다!

---

**팁**: 비밀번호를 설정한 후 `npm run schema:check`를 실행하여 데이터베이스 스키마를 확인하세요!
