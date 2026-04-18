# S3 Storage 전환 가이드

이 가이드는 Supabase Storage에서 S3 Storage로 전환하는 방법을 설명합니다.

## ✅ 전환 완료된 파일

1. ✅ `src/app/api/instruments/[id]/images/route.ts` - 이미지 업로드/삭제
2. ✅ `src/app/api/instruments/[id]/certificates/route.ts` - Certificate 업로드/삭제

## 📋 환경 변수 설정

`.env.local` 파일에 다음 환경 변수를 추가하세요:

```env
# Storage 타입 설정 (필수)
STORAGE_TYPE=s3

# S3 필수 설정
S3_BUCKET_NAME=your-bucket-name
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key

# 선택적 S3 설정
# AWS_ENDPOINT_URL=https://s3.amazonaws.com  # MinIO나 localstack 사용 시
# S3_ADDRESSING_STYLE=virtual-hosted-style   # 'virtual-hosted-style' 또는 'path-style'
# KMS_KEY_ID=your-kms-key-id                 # KMS 암호화 사용 시

# 파일 업로드 제한
UPLOAD_MAX_FILE_SIZE_MB=100

# Storage 기본 prefix (선택)
STORAGE_BASE_PREFIX=uploads
```

`development`/`test` 외 환경에서는 로컬 파일 시스템 fallback이 허용되지 않습니다. S3 설정이 없으면 앱이 부팅 단계에서 실패합니다.

## 🔄 주요 변경사항

### 1. 이미지 API (`/api/instruments/[id]/images`)

**변경 전:**

- `supabase.storage.from('instrument-images').upload()`
- `supabase.storage.from('instrument-images').remove()`
- `supabase.storage.from('instrument-images').createSignedUrl()`

**변경 후:**

- `storage.saveFile(buffer, fileKey, contentType)`
- `storage.deleteFile(fileKey)`
- `storage.presignPut(fileKey, contentType, expiresIn)`

### 2. Certificate API (`/api/instruments/[id]/certificates`)

**변경 전:**

- `supabase.storage.from('instrument-certificates').upload()`
- `supabase.storage.from('instrument-certificates').remove()`
- `supabase.storage.from('instrument-certificates').list()`

**변경 후:**

- `storage.saveFile(buffer, fileKey, contentType)`
- `storage.deleteFile(fileKey)`
- 메타데이터 테이블(`instrument_certificates`)에서만 읽기 (list 기능 없음)

### 3. 파일 경로 (File Keys)

**변경 전:**

```typescript
const filePath = withStoragePrefix(`instruments/${id}/${fileName}`);
```

**변경 후:**

```typescript
const fileKey = `instruments/${id}/${fileName}`;
// 또는
const fileKey = `certificates/${id}/${fileName}`;
```

**참고:** `STORAGE_BASE_PREFIX` 환경 변수가 설정되어 있으면, S3Storage의 `generateFileKey()`가 자동으로 prefix를 추가합니다. 하지만 현재 구현은 명시적으로 경로를 지정하고 있습니다.

## ⚠️ 주의사항

1. **메타데이터 테이블 필수**: Certificate의 경우 `instrument_certificates` 테이블이 반드시 있어야 합니다. S3Storage에는 `list()` 기능이 없으므로 메타데이터 테이블에서만 파일 목록을 읽습니다.

2. **파일 경로 형식**: 기존 Supabase Storage 경로와 S3 경로가 다를 수 있습니다. 기존 데이터를 마이그레이션해야 할 수도 있습니다.

3. **Signed URL TTL**: Presigned URL의 TTL은 현재 600초(10분)로 설정되어 있습니다. 필요에 따라 조정하세요.

4. **에러 처리**: S3Storage는 파일 삭제 실패 시에도 메타데이터 삭제를 계속 진행합니다. 이는 orphan 파일이 생성될 수 있으므로 주의하세요.

## 🧪 테스트 방법

1. **이미지 업로드 테스트:**

   ```bash
   curl -X POST http://localhost:3000/api/instruments/[id]/images \
     -F "images=@test-image.jpg" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

2. **Certificate 업로드 테스트:**

   ```bash
   curl -X POST http://localhost:3000/api/instruments/[id]/certificates \
     -F "certificate=@test-cert.pdf" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **이미지 삭제 테스트:**

   ```bash
   curl -X DELETE "http://localhost:3000/api/instruments/[id]/images?imageId=IMAGE_ID" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. **Certificate 삭제 테스트:**
   ```bash
   curl -X DELETE "http://localhost:3000/api/instruments/[id]/certificates?id=CERT_ID" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

## 📝 추가 작업 (필요시)

1. **기존 파일 마이그레이션**: Supabase Storage에 있는 기존 파일들을 S3로 마이그레이션해야 할 수 있습니다.

2. **URL 업데이트**: 데이터베이스에 저장된 `image_url` 필드가 Supabase Storage URL인 경우, S3 URL로 업데이트해야 할 수 있습니다.

3. **CDN 설정**: S3 버킷 앞에 CloudFront를 설정하여 성능을 개선할 수 있습니다.

## 🔍 문제 해결

### 에러: "STORAGE_TYPE=s3 requires S3_BUCKET_NAME to be set"

- `.env.local` 파일에 `S3_BUCKET_NAME`이 설정되어 있는지 확인하세요.

### 에러: "S3Storage initialization failed"

- AWS 자격 증명이 올바른지 확인하세요 (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).
- S3 버킷이 존재하고 접근 가능한지 확인하세요.

### 파일이 업로드되지 않음

- S3 버킷 권한 설정을 확인하세요 (버킷 정책, IAM 역할).
- `STORAGE_TYPE` 환경 변수가 `s3`로 설정되어 있는지 확인하세요.
