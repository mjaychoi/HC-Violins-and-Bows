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

type RuntimeEnvironment = 'development' | 'test' | 'production';

function normalizeRuntimeEnvironment(
  nodeEnv: string | undefined
): RuntimeEnvironment {
  if (nodeEnv === 'test') return 'test';
  if (nodeEnv === 'development') return 'development';
  return 'production';
}

function normalizeStorageType(
  value: string | undefined,
  fallback: StorageConfig['storageType']
): StorageConfig['storageType'] {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === 'local' || normalized === 's3') {
    return normalized;
  }

  throw new Error(`Invalid STORAGE_TYPE "${value}". Expected "local" or "s3".`);
}

export function getStorageRuntimeEnvironment(
  nodeEnv: string | undefined = process.env.NODE_ENV
): RuntimeEnvironment {
  return normalizeRuntimeEnvironment(nodeEnv);
}

export function isLocalStoragePermittedRuntime(
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  const runtime = getStorageRuntimeEnvironment(nodeEnv);
  return runtime === 'development' || runtime === 'test';
}

/**
 * Get storage configuration from environment variables
 */
export function getStorageConfig(): StorageConfig {
  const runtime = getStorageRuntimeEnvironment(process.env.NODE_ENV);
  const defaultStorageType: StorageConfig['storageType'] =
    runtime === 'development' || runtime === 'test' ? 'local' : 's3';
  const storageType = normalizeStorageType(
    process.env.STORAGE_TYPE,
    defaultStorageType
  );
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

export function validateStorageRuntimeConfig(
  config: StorageConfig = getStorageConfig(),
  nodeEnv: string | undefined = process.env.NODE_ENV
): StorageConfig {
  const runtime = getStorageRuntimeEnvironment(nodeEnv);

  if (runtime === 'development' || runtime === 'test') {
    return config;
  }

  if (config.storageType !== 's3') {
    throw new Error(
      `Durable object storage is required in ${runtime} environments. ` +
        'Set STORAGE_TYPE=s3 and configure S3_BUCKET_NAME and S3_REGION.'
    );
  }

  if (!config.s3Bucket) {
    throw new Error(
      `STORAGE_TYPE=s3 requires S3_BUCKET_NAME to be set. Current environment: ${runtime}`
    );
  }

  if (!config.s3Region) {
    throw new Error(
      `STORAGE_TYPE=s3 requires S3_REGION to be set. Current environment: ${runtime}`
    );
  }

  return config;
}
