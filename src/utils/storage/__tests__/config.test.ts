import { getStorageConfig, validateStorageRuntimeConfig } from '../config';

const setNodeEnv = (value?: string) => {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    return;
  }

  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    writable: true,
  });
};

describe('storage config', () => {
  const originalEnv = process.env;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    setNodeEnv(originalNodeEnv);
  });

  afterEach(() => {
    process.env = originalEnv;
    setNodeEnv(originalNodeEnv);
  });

  describe('getStorageConfig', () => {
    it('should default to local storage in development when env vars are not set', () => {
      setNodeEnv('development');
      delete process.env.STORAGE_TYPE;
      delete process.env.UPLOAD_MAX_FILE_SIZE_MB;

      const config = getStorageConfig();

      expect(config.storageType).toBe('local');
      expect(config.maxFileSizeBytes).toBe(10 * 1024 * 1024); // 10MB default
    });

    it('should default to s3 storage in production when STORAGE_TYPE is not set', () => {
      setNodeEnv('production');
      delete process.env.STORAGE_TYPE;

      const config = getStorageConfig();

      expect(config.storageType).toBe('s3');
    });

    it('should return s3 config when STORAGE_TYPE is s3', () => {
      process.env.STORAGE_TYPE = 's3';
      process.env.S3_BUCKET_NAME = 'test-bucket';
      process.env.S3_REGION = 'us-east-1';

      const config = getStorageConfig();

      expect(config.storageType).toBe('s3');
      expect(config.s3Bucket).toBe('test-bucket');
      expect(config.s3Region).toBe('us-east-1');
    });

    it('should include AWS credentials when provided', () => {
      process.env.STORAGE_TYPE = 's3';
      process.env.AWS_ACCESS_KEY_ID = 'test-key-id';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';

      const config = getStorageConfig();

      expect(config.awsAccessKeyId).toBe('test-key-id');
      expect(config.awsSecretAccessKey).toBe('test-secret-key');
    });

    it('should include endpoint URL when provided', () => {
      process.env.STORAGE_TYPE = 's3';
      process.env.AWS_ENDPOINT_URL = 'https://s3.localhost:9000';

      const config = getStorageConfig();

      expect(config.awsEndpointUrl).toBe('https://s3.localhost:9000');
    });

    it('should include addressing style when provided', () => {
      process.env.STORAGE_TYPE = 's3';
      process.env.S3_ADDRESSING_STYLE = 'path-style';

      const config = getStorageConfig();

      expect(config.s3AddressingStyle).toBe('path-style');
    });

    it('should include virtual-hosted-style addressing', () => {
      process.env.STORAGE_TYPE = 's3';
      process.env.S3_ADDRESSING_STYLE = 'virtual-hosted-style';

      const config = getStorageConfig();

      expect(config.s3AddressingStyle).toBe('virtual-hosted-style');
    });

    it('should include KMS key ID when provided', () => {
      process.env.STORAGE_TYPE = 's3';
      process.env.KMS_KEY_ID =
        'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012';

      const config = getStorageConfig();

      expect(config.kmsKeyId).toBe(
        'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012'
      );
    });

    it('should calculate maxFileSizeBytes from UPLOAD_MAX_FILE_SIZE_MB', () => {
      process.env.UPLOAD_MAX_FILE_SIZE_MB = '20';

      const config = getStorageConfig();

      expect(config.maxFileSizeBytes).toBe(20 * 1024 * 1024);
    });

    it('should default to 10MB when UPLOAD_MAX_FILE_SIZE_MB is not set', () => {
      delete process.env.UPLOAD_MAX_FILE_SIZE_MB;

      const config = getStorageConfig();

      expect(config.maxFileSizeBytes).toBe(10 * 1024 * 1024);
    });

    it('should handle undefined values for optional env vars', () => {
      delete process.env.S3_BUCKET_NAME;
      delete process.env.S3_REGION;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.AWS_ENDPOINT_URL;
      delete process.env.S3_ADDRESSING_STYLE;
      delete process.env.KMS_KEY_ID;

      const config = getStorageConfig();

      expect(config.s3Bucket).toBeUndefined();
      expect(config.s3Region).toBeUndefined();
      expect(config.awsAccessKeyId).toBeUndefined();
      expect(config.awsSecretAccessKey).toBeUndefined();
      expect(config.awsEndpointUrl).toBeUndefined();
      expect(config.s3AddressingStyle).toBeUndefined();
      expect(config.kmsKeyId).toBeUndefined();
    });
  });

  describe('validateStorageRuntimeConfig', () => {
    it('allows local storage in development', () => {
      setNodeEnv('development');
      delete process.env.STORAGE_TYPE;

      expect(() => validateStorageRuntimeConfig()).not.toThrow();
    });

    it('rejects local storage in production', () => {
      setNodeEnv('production');
      process.env.STORAGE_TYPE = 'local';

      expect(() => validateStorageRuntimeConfig()).toThrow(
        'Durable object storage is required in production environments.'
      );
    });

    it('rejects missing bucket in production', () => {
      setNodeEnv('production');
      process.env.STORAGE_TYPE = 's3';
      delete process.env.S3_BUCKET_NAME;
      process.env.S3_REGION = 'us-east-1';

      expect(() => validateStorageRuntimeConfig()).toThrow(
        'STORAGE_TYPE=s3 requires S3_BUCKET_NAME to be set. Current environment: production'
      );
    });

    it('rejects missing region in production', () => {
      setNodeEnv('production');
      process.env.STORAGE_TYPE = 's3';
      process.env.S3_BUCKET_NAME = 'test-bucket';
      delete process.env.S3_REGION;

      expect(() => validateStorageRuntimeConfig()).toThrow(
        'STORAGE_TYPE=s3 requires S3_REGION to be set. Current environment: production'
      );
    });
  });
});
