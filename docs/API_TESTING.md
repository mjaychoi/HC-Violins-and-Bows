# API 테스트 가이드

이 문서는 프로젝트의 API 엔드포인트를 테스트하는 방법을 설명합니다.

## 🚀 빠른 시작

### 1. 개발 서버 실행

```bash
npm run dev
```

서버가 `http://localhost:3000`에서 실행됩니다.

### 2. Health Check

가장 간단한 방법으로 API가 정상 작동하는지 확인:

```bash
curl http://localhost:3000/api/health
```

또는 브라우저에서 직접 접속:
- http://localhost:3000/api/health

예상 응답:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "development",
  "uptimeSeconds": 123,
  "startedAt": "2025-12-12T00:00:00.000Z",
  "timestamp": "2025-12-12T00:02:03.000Z"
}
```

## 📋 API 엔드포인트 목록

### 1. Health Check
```bash
curl http://localhost:3000/api/health
```

### 2. Clients API

**GET - 모든 클라이언트 조회**
```bash
curl http://localhost:3000/api/clients
```

**GET - 정렬 옵션 포함**
```bash
curl "http://localhost:3000/api/clients?orderBy=created_at&ascending=false"
```

**POST - 새 클라이언트 생성**
```bash
curl -X POST http://localhost:3000/api/clients \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "contact_number": "123-456-7890"
  }'
```

**PATCH - 클라이언트 수정**
```bash
curl -X PATCH http://localhost:3000/api/clients \
  -H "Content-Type: application/json" \
  -d '{
    "id": "client-uuid-here",
    "first_name": "Jane",
    "last_name": "Doe"
  }'
```

**DELETE - 클라이언트 삭제**
```bash
curl -X DELETE "http://localhost:3000/api/clients?id=client-uuid-here"
```

### 3. Instruments API

**GET - 모든 악기 조회**
```bash
curl http://localhost:3000/api/instruments
```

**GET - 정렬 옵션 포함**
```bash
curl "http://localhost:3000/api/instruments?orderBy=created_at&ascending=false"
```

**POST - 새 악기 생성**
```bash
curl -X POST http://localhost:3000/api/instruments \
  -H "Content-Type: application/json" \
  -d '{
    "maker": "Stradivari",
    "type": "Violin",
    "serial_number": "STR-001",
    "year": 1700,
    "price": 1000000
  }'
```

### 4. Connections API

**GET - 모든 연결 조회**
```bash
curl http://localhost:3000/api/connections
```

**POST - 새 연결 생성**
```bash
curl -X POST http://localhost:3000/api/connections \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "client-uuid",
    "instrument_id": "instrument-uuid",
    "relationship_type": "Interested",
    "notes": "Interested in purchasing"
  }'
```

### 5. Sales API

**GET - 판매 기록 조회 (페이지네이션)**
```bash
curl "http://localhost:3000/api/sales?page=1&pageSize=10"
```

**GET - 날짜 필터링**
```bash
curl "http://localhost:3000/api/sales?fromDate=2024-01-01&toDate=2024-12-31"
```

**POST - 새 판매 기록 생성**
```bash
curl -X POST http://localhost:3000/api/sales \
  -H "Content-Type: application/json" \
  -d '{
    "instrument_id": "instrument-uuid",
    "client_id": "client-uuid",
    "sale_date": "2024-12-12",
    "sale_price": 50000
  }'
```

**PATCH - 판매 기록 수정**
```bash
curl -X PATCH http://localhost:3000/api/sales \
  -H "Content-Type: application/json" \
  -d '{
    "id": "sale-uuid",
    "sale_price": 55000
  }'
```

### 6. Maintenance Tasks API

**GET - 모든 유지보수 작업 조회**
```bash
curl http://localhost:3000/api/maintenance-tasks
```

**GET - 필터링**
```bash
curl "http://localhost:3000/api/maintenance-tasks?status=pending&instrument_id=instrument-uuid"
```

**POST - 새 유지보수 작업 생성**
```bash
curl -X POST http://localhost:3000/api/maintenance-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "instrument_id": "instrument-uuid",
    "task_type": "repair",
    "description": "Bridge adjustment needed",
    "due_date": "2024-12-31"
  }'
```

## 🔧 자동화된 테스트 스크립트

프로젝트 루트에서 실행:

```bash
./scripts/test-api.sh
```

또는 다른 URL 사용:

```bash
./scripts/test-api.sh http://localhost:3000
```

## 🌐 브라우저에서 테스트

### 1. GET 요청
브라우저 주소창에 직접 입력하거나 개발자 도구 Console에서:

```javascript
fetch('http://localhost:3000/api/clients')
  .then(res => res.json())
  .then(data => console.log(data));
```

### 2. POST/PATCH/DELETE 요청
브라우저 개발자 도구 Console에서:

```javascript
// POST 예시
fetch('http://localhost:3000/api/clients', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com'
  })
})
  .then(res => res.json())
  .then(data => console.log(data));
```

## 🧪 테스트 코드 실행

단위 테스트로 API 엔드포인트 테스트:

```bash
# 모든 API 테스트 실행
npm test -- --testPathPattern="api"

# 특정 API 테스트
npm test -- src/app/api/clients/__tests__/route.test.ts
npm test -- src/app/api/sales/__tests__/route.test.ts
```

## 📊 응답 확인

### 성공 응답 (200)
```json
{
  "data": [...],
  "count": 10
}
```

### 에러 응답 (400/500)
```json
{
  "error": "Error message",
  "message": "User-friendly message",
  "statusCode": 400
}
```

## ⚠️ 주의사항

1. **인증**: 현재 API는 인증 없이 접근 가능하지만, 프로덕션에서는 인증이 필요할 수 있습니다.

2. **CORS**: 브라우저에서 다른 도메인으로 요청할 때 CORS 설정이 필요할 수 있습니다.

3. **환경 변수**: `.env.local` 파일에 필요한 환경 변수가 설정되어 있는지 확인하세요.

4. **데이터베이스**: Supabase 연결이 정상인지 확인하세요.

## 🔍 디버깅 팁

1. **서버 로그 확인**: 터미널에서 실행 중인 `npm run dev`의 로그를 확인하세요.

2. **Network 탭**: 브라우저 개발자 도구의 Network 탭에서 요청/응답을 확인하세요.

3. **API 로깅**: 서버 콘솔에서 API 요청이 로깅됩니다 (`[INFO] [ClientsAPI] API GET /api/clients`).

4. **에러 메시지**: 응답의 `error` 필드에서 자세한 에러 정보를 확인할 수 있습니다.
