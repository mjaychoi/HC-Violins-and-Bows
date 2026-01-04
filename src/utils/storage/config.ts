/**
 * Storage configuration for S3
 * Environment variables are loaded from .env.local or Vercel environment variables
 */

import 'server-only';

export interface StorageConfig {
  storageType: 'local' | 's3';
  // S3 Configuration
  s3Bucket?: string;
  s3Region?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsEndpointUrl?: string; // For MinIO or localstack
  s3AddressingStyle?: 'virtual-hosted-style' | 'path-style';
  kmsKeyId?: string;
  storageBasePrefix?: string;
  localRoot?: string;
  // File size limits
  maxFileSizeBytes: number;
}

/**
 * Get storage configuration from environment variables
 */
export function getStorageConfig(): StorageConfig {
  const storageType = (process.env.STORAGE_TYPE || 'local') as 'local' | 's3';
  const maxMb = Number.parseInt(
    process.env.UPLOAD_MAX_FILE_SIZE_MB ?? '10',
    10
  );
  const safeMaxMb = Number.isFinite(maxMb) && maxMb > 0 ? maxMb : 10;

  return {
    storageType,
    s3Bucket: process.env.S3_BUCKET_NAME,
    s3Region: process.env.S3_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    awsEndpointUrl: process.env.AWS_ENDPOINT_URL,
    s3AddressingStyle: process.env.S3_ADDRESSING_STYLE as
      | 'virtual-hosted-style'
      | 'path-style'
      | undefined,
    kmsKeyId: process.env.KMS_KEY_ID,
    storageBasePrefix: process.env.STORAGE_BASE_PREFIX,
    localRoot: process.env.STORAGE_LOCAL_ROOT,
    // Default to 10MB
    maxFileSizeBytes: safeMaxMb * 1024 * 1024,
  };
}
