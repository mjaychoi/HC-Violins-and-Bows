# Storage Utilities

S3 storage implementation for Next.js/TypeScript, ported from Python.

## Installation

Install required AWS SDK packages:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Configuration

Add the following environment variables to `.env.local`:

```env
STORAGE_TYPE=s3
S3_BUCKET_NAME=your-bucket-name
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Optional
AWS_ENDPOINT_URL=https://s3.amazonaws.com  # For MinIO or localstack
S3_ADDRESSING_STYLE=virtual-hosted-style   # 'virtual-hosted-style' or 'path-style'
KMS_KEY_ID=your-kms-key-id                 # For KMS encryption
UPLOAD_MAX_FILE_SIZE_MB=10
STORAGE_BASE_PREFIX=uploads                # Optional base prefix for generated keys
STORAGE_LOCAL_ROOT=/tmp/app-uploads        # Used when STORAGE_TYPE=local
```

## Usage

```typescript
import { getStorage } from '@/utils/storage';

// Get storage instance (singleton)
const storage = getStorage();

// Generate file key
const fileKey = storage.generateFileKey('my-image.jpg', 'instruments');
// Returns: "instruments/uuid-here.jpg"

// Save file
const fileBuffer = Buffer.from(fileData);
await storage.saveFile(fileBuffer, fileKey, 'image/jpeg');

// Download file
const downloadedBuffer = await storage.downloadFile(fileKey);

// Check if file exists
const exists = await storage.fileExists(fileKey);

// Delete file
await storage.deleteFile(fileKey);

// Get public URL
const url = storage.getFileUrl(fileKey);

// Generate presigned PUT URL (for direct client upload)
const presignedUrl = await storage.presignPut(fileKey, 'image/jpeg', 3600);

// Generate presigned POST data (for multipart/form-data upload)
const { url, fields } = await storage.presignPost(fileKey, 'image/jpeg', 10);
```

## Features

- ✅ File deduplication cache (process-local, SHA-256 hash-based)
- ✅ Server-side encryption (AES256 or KMS)
- ✅ Presigned URLs for direct client uploads
- ✅ Metadata storage (filename, upload timestamp, hash)
- ✅ MinIO/localstack support
- ✅ Memory-bounded hash cache (max 1000 entries)
- ✅ Local filesystem storage for dev, in-memory storage for tests

## Migration from Supabase Storage

To migrate from Supabase Storage to S3:

1. Set `STORAGE_TYPE=s3` in environment variables
2. Update API routes to use `getStorage()` instead of Supabase Storage
3. Update image URLs to use `storage.getFileUrl()` or presigned URLs
