# S3 Storage Migration Guide

Python의 S3 storage 구현을 Next.js/TypeScript로 포팅한 코드입니다.

## 설치

필요한 패키지를 설치하세요:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## 환경 변수 설정

`.env.local` 파일에 다음 변수들을 추가하세요:

```env
# Storage 타입 설정 ('local' 또는 's3')
STORAGE_TYPE=s3

# 필수 S3 설정
S3_BUCKET_NAME=your-bucket-name
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

# 선택적 S3 설정
# AWS_ENDPOINT_URL=https://s3.amazonaws.com  # MinIO나 localstack 사용 시
# S3_ADDRESSING_STYLE=virtual-hosted-style    # 'virtual-hosted-style' 또는 'path-style'
# KMS_KEY_ID=your-kms-key-id                  # KMS 암호화 사용 시
# UPLOAD_MAX_FILE_SIZE_MB=10                  # 최대 파일 크기 (MB)
```

## 사용 방법

### 기본 사용

```typescript
import { getStorage } from '@/utils/storage';

// Storage 인스턴스 가져오기 (singleton)
const storage = getStorage();

// 파일 키 생성
const fileKey = storage.generateFileKey('my-image.jpg');
// 결과: "instruments/uuid-here.jpg"

// 파일 저장
const fileBuffer = Buffer.from(imageData);
await storage.saveFile(fileBuffer, fileKey, 'image/jpeg');

// 파일 다운로드
const buffer = await storage.downloadFile(fileKey);

// 파일 존재 확인
const exists = await storage.fileExists(fileKey);

// 파일 삭제
await storage.deleteFile(fileKey);

// Public URL 가져오기
const url = storage.getFileUrl(fileKey);

// Presigned URL 생성 (클라이언트에서 직접 업로드용)
const presignedUrl = await storage.presignPut(fileKey, 'image/jpeg', 3600);
```

### API Route에서 사용

```typescript
// src/app/api/instruments/[id]/images/route.ts
import { getStorage } from '@/utils/storage';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  const storage = getStorage();

  // 파일 검증
  storage.validateFile(file.name, file.type, file.size);

  // 파일 키 생성
  const fileKey = storage.generateFileKey(file.name);

  // 파일을 Buffer로 변환
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // S3에 저장
  const savedKey = await storage.saveFile(buffer, fileKey, file.type);

  // DB에 이미지 메타데이터 저장
  // ... (Supabase 또는 다른 DB)

  return Response.json({ fileKey: savedKey });
}
```

## 주요 기능

- ✅ 파일 중복 제거 (SHA-256 해시 기반)
- ✅ 서버 측 암호화 (AES256 또는 KMS)
- ✅ Presigned URL (클라이언트에서 직접 업로드)
- ✅ 메타데이터 저장 (파일명, 업로드 시간, 해시)
- ✅ MinIO/localstack 지원
- ✅ 메모리 제한된 해시 캐시 (최대 1000개)

## Supabase Storage에서 마이그레이션

현재 프로젝트는 Supabase Storage를 사용하고 있습니다. S3로 마이그레이션하려면:

1. 환경 변수 설정 (위 참조)
2. API routes 업데이트:
   - Supabase Storage 호출을 `getStorage()` 호출로 교체
   - 이미지 URL을 `storage.getFileUrl()` 또는 presigned URL 사용

3. `next.config.ts`의 `remotePatterns`에 S3 도메인 추가:

```typescript
remotePatterns: [
  {
    protocol: 'https',
    hostname: '**.s3.amazonaws.com',
  },
  {
    protocol: 'https',
    hostname: '**.s3.*.amazonaws.com',
  },
  // MinIO/localstack를 사용하는 경우
  {
    protocol: 'https',
    hostname: 'your-minio-hostname.com',
  },
],
```

## 파일 구조

```
src/utils/storage/
├── config.ts      # 환경 변수 기반 설정
├── types.ts       # Storage 인터페이스
├── s3Storage.ts   # S3 구현
├── factory.ts     # Storage 인스턴스 팩토리 (singleton)
└── index.ts       # Exports
```
