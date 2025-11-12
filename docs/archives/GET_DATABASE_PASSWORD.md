# 데이터베이스 비밀번호 확인 가이드

## 🔑 Supabase 대시보드에서 비밀번호 확인하기

### 방법 1: Settings > Database (권장)

1. **Supabase 대시보드 접속**
   - https://supabase.com/dashboard 접속
   - 프로젝트 선택 (inventoryApp)

2. **Settings 메뉴 클릭**
   - 왼쪽 사이드바에서 ⚙️ **Settings** 아이콘 클릭

3. **Database 섹션 클릭**
   - Settings 메뉴에서 **Database** 클릭

4. **Database password 확인**
   - "Database password" 섹션에서 비밀번호 확인
   - 또는 "Database Settings" > "Database password" 확인

5. **비밀번호 복사**
   - "Show" 버튼 클릭하여 비밀번호 표시
   - 비밀번호 복사

### 방법 2: Connection String에서 확인

1. **Settings > Database 접속**
2. **Connection String 섹션 확인**
3. **Connection Pooling URL 확인**
   - `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@...`
   - `[PASSWORD]` 부분이 데이터베이스 비밀번호입니다

### 방법 3: 비밀번호 재설정 (잊어버린 경우)

1. **Settings > Database 접속**
2. **Database password 섹션에서 "Reset database password" 클릭**
3. **새 비밀번호 설정**
4. **비밀번호 복사하여 저장**

---

## 📝 .env.local 파일에 추가하기

1. **프로젝트 루트 디렉토리에 `.env.local` 파일 생성** (없는 경우)

2. **다음 내용 추가:**

```env
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
DATABASE_PASSWORD=your_database_password
```

3. **예시:**

```env
NEXT_PUBLIC_SUPABASE_URL=https://dmilmlhquttcozxlpfxw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DATABASE_PASSWORD=your_actual_password_here
```

---

## 🔍 비밀번호 확인 위치 (스크린샷 기준)

Supabase 대시보드에서:

1. **왼쪽 사이드바**에서 ⚙️ **Settings** 아이콘 클릭
2. **Database** 메뉴 클릭
3. **Database password** 섹션에서 확인
4. **"Show" 버튼** 클릭하여 비밀번호 표시

---

## ⚠️ 주의사항

1. **비밀번호는 안전하게保管하세요**
   - `.env.local` 파일은 `.gitignore`에 포함되어 있어야 합니다
   - GitHub에 업로드하지 마세요

2. **비밀번호를 잊어버린 경우**
   - Settings > Database에서 재설정할 수 있습니다
   - 재설정 후 애플리케이션도 업데이트해야 합니다

3. **환경 변수 이름 확인**
   - `DATABASE_PASSWORD` (대문자)
   - `.env.local` 파일에 정확히 이 이름으로 저장되어야 합니다

---

## ✅ 확인 방법

비밀번호를 설정한 후:

```bash
npm run schema:check
```

성공적으로 실행되면 비밀번호가 올바르게 설정된 것입니다.

---

## 🆘 문제 해결

### 문제 1: "DATABASE_PASSWORD 환경 변수가 설정되지 않았습니다"

**해결 방법:**
1. `.env.local` 파일이 프로젝트 루트에 있는지 확인
2. `DATABASE_PASSWORD` 변수가 정확히 이 이름으로 저장되어 있는지 확인
3. 파일을 저장한 후 터미널을 다시 시작

### 문제 2: "비밀번호 인증 실패"

**해결 방법:**
1. 비밀번호를 다시 확인
2. 공백이나 특수문자가 포함되어 있는지 확인
3. 필요시 비밀번호 재설정

### 문제 3: ".env.local 파일을 찾을 수 없습니다"

**해결 방법:**
1. 프로젝트 루트 디렉토리에 `.env.local` 파일 생성
2. 파일 이름이 정확히 `.env.local`인지 확인 (앞에 점 포함)
3. 파일이 `.gitignore`에 포함되어 있는지 확인

---

## 📚 참고 자료

- [Supabase 문서 - Database Settings](https://supabase.com/docs/guides/database/managing-database-passwords)
- [Supabase 문서 - Connection Strings](https://supabase.com/docs/guides/database/connecting-to-postgres)

---

**팁**: 비밀번호를 설정한 후 `npm run schema:check`를 실행하여 데이터베이스 스키마를 확인하세요!

