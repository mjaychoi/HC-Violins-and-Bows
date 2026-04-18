/**
 * Storage factory with singleton pattern
 * Single source of truth for storage instances
 */

import 'server-only';

import { getStorageConfig, validateStorageRuntimeConfig } from './config';
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

  const config = validateStorageRuntimeConfig(getStorageConfig());
  const env = process.env.NODE_ENV || 'development';

  if (config.storageType === 's3') {
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
