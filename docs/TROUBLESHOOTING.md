# 문제 해결 가이드 (Troubleshooting Guide)

## 일반 브라우저에서만 에러가 발생하는 경우

일반 크롬 브라우저에서 에러가 발생하지만 시크릿(Incognito) 모드에서는 정상 작동하는 경우, 브라우저 캐시나 저장된 데이터 문제일 가능성이 높습니다.

### 원인

1. **브라우저 캐시**: 오래된 JavaScript 번들이 캐시되어 있을 수 있습니다
2. **localStorage**: Supabase 세션이 localStorage에 저장되어 오래된 세션이 문제를 일으킬 수 있습니다
3. **sessionStorage**: 일부 앱 설정이 sessionStorage에 저장되어 충돌할 수 있습니다
4. **서비스 워커**: PWA 서비스 워커가 오래된 버전을 사용하고 있을 수 있습니다

### 해결 방법

#### 1. 하드 리프레시 (가장 간단한 방법)

- **Windows/Linux**: `Ctrl + Shift + R` 또는 `Ctrl + F5`
- **Mac**: `Cmd + Shift + R`

이 방법으로도 해결되지 않으면 다음 방법을 시도하세요.

#### 2. 브라우저 개발자 도구에서 저장소 삭제

1. Chrome 개발자 도구 열기 (`F12` 또는 `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows))
2. **Application** 탭 클릭
3. 왼쪽 사이드바에서 **Storage** 섹션 확장
4. **Clear site data** 버튼 클릭
   - 또는 개별적으로 삭제:
     - **Cookies** → 해당 사이트 선택 → 우클릭 → Clear
     - **Local Storage** → 해당 사이트 선택 → 우클릭 → Clear
     - **Session Storage** → 해당 사이트 선택 → 우클릭 → Clear
     - **Cache Storage** → 해당 항목 삭제
5. 페이지 새로고침

#### 3. 콘솔에서 직접 삭제

개발자 도구의 **Console** 탭에서 다음 명령어 실행:

```javascript
// 모든 localStorage 삭제
localStorage.clear();

// 모든 sessionStorage 삭제
sessionStorage.clear();

// Supabase 관련 항목만 삭제
Object.keys(localStorage).forEach(key => {
  if (key.includes('supabase')) {
    localStorage.removeItem(key);
    console.log(`Deleted: ${key}`);
  }
});

// 페이지 새로고침
location.reload();
```

#### 4. 로그아웃 후 재로그인

1. 앱에서 로그아웃
2. 페이지 새로고침 (`F5`)
3. 다시 로그인

#### 5. 브라우저 캐시 완전 삭제

만약 위 방법들이 모두 실패한다면:

1. Chrome 설정 → 개인정보 및 보안 → 인터넷 사용 기록 삭제
2. **캐시된 이미지 및 파일** 선택
3. 시간 범위: **전체 기간**
4. 삭제 실행

### 개발자 도구에서 확인할 수 있는 정보

에러가 발생하면 개발자 도구에서 다음을 확인하세요:

1. **Console 탭**: 에러 메시지 확인
2. **Network 탭**: 실패한 요청 확인 (빨간색으로 표시)
3. **Application 탭 → Local Storage**: 저장된 데이터 확인
4. **Application 탭 → Session Storage**: 저장된 데이터 확인

### 예방 방법

개발 중에는 다음을 권장합니다:

1. **하드 리프레시를 자주 사용**: 개발 중에는 `Cmd+Shift+R` (Mac) 또는 `Ctrl+Shift+R` (Windows) 사용
2. **개발자 도구 설정**: 개발자 도구 → Settings → Network → "Disable cache" 체크 (개발자 도구가 열려 있을 때만 유효)
3. **브라우저 확장 프로그램**: 일부 확장 프로그램이 캐시를 방해할 수 있으므로, 개발 중에는 비활성화하거나 시크릿 모드 사용

### 자주 발생하는 에러

#### "Cannot read properties of undefined"

- **원인**: 오래된 코드가 새 데이터 구조와 호환되지 않음
- **해결**: 브라우저 캐시 삭제 후 하드 리프레시

#### "Unauthorized" 에러

- **원인**: 오래된 Supabase 세션이 localStorage에 남아있음
- **해결**: localStorage에서 Supabase 관련 항목 삭제 후 재로그인

#### "Module not found" 또는 "Chunk load failed"

- **원인**: 오래된 JavaScript 번들이 캐시되어 있음
- **해결**: 브라우저 캐시 완전 삭제 또는 하드 리프레시

### 추가 도움

위 방법들로도 해결되지 않으면:

1. 시크릿 모드에서 정상 작동하는지 확인
2. 다른 브라우저에서 테스트 (Firefox, Safari 등)
3. 브라우저 확장 프로그램 비활성화 후 테스트
4. 개발자 도구의 Console 탭에서 정확한 에러 메시지 확인
