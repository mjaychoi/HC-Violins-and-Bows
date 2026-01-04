/**
 * Storage factory with singleton pattern
 * Single source of truth for storage instances
 */

import 'server-only';

import { getStorageConfig } from './config';
import type { Storage } from './types';
import { S3Storage } from './s3Storage';
import { LocalFileStorage, MemoryStorage } from './localStorage';
import { logInfo, logError } from '../logger';

// Singleton instance
let _storageSingleton: Storage | null = null;

/**
 * Get storage instance (singleton pattern)
 * Returns S3Storage or LocalStorage based on config
 */
export function getStorage(): Storage {
  if (_storageSingleton !== null) {
    return _storageSingleton;
  }

  const config = getStorageConfig();
  const env = process.env.NODE_ENV || 'development';

  if (config.storageType === 's3') {
    if (!config.s3Bucket) {
      throw new Error(
        'STORAGE_TYPE=s3 requires S3_BUCKET_NAME to be set. ' +
          'Please set S3_BUCKET_NAME environment variable. ' +
          `Current environment: ${env}`
      );
    }
    if (!config.s3Region) {
      throw new Error(
        'STORAGE_TYPE=s3 requires S3_REGION to be set. ' +
          'Please set S3_REGION environment variable (e.g., us-east-1). ' +
          `Current environment: ${env}`
      );
    }

    try {
      _storageSingleton = new S3Storage();
      // Note: S3Storage uses lazy initialization, so actual client creation happens on first use
      logInfo(
        `S3Storage instance created (bucket: ${config.s3Bucket}, region: ${config.s3Region})`,
        'S3Storage'
      );
    } catch (error) {
      logError('S3Storage initialization failed:', error);
      throw new Error(
        `S3Storage initialization failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    if (env === 'test') {
      _storageSingleton = new MemoryStorage(config);
    } else {
      _storageSingleton = new LocalFileStorage(config);
    }
  }

  return _storageSingleton;
}

/**
 * Reset the storage singleton for testing/bootstrap purposes
 */
export function resetStorage(): void {
  _storageSingleton = null;
}
