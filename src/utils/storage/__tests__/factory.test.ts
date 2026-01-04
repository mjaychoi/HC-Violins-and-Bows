import { getStorage, resetStorage } from '../factory';
import { getStorageConfig } from '../config';
import { S3Storage } from '../s3Storage';
import { MemoryStorage } from '../localStorage';

jest.mock('../config');
jest.mock('../s3Storage');

const mockGetStorageConfig = getStorageConfig as jest.MockedFunction<
  typeof getStorageConfig
>;
const MockS3Storage = S3Storage as jest.MockedClass<typeof S3Storage>;

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

describe('storage factory', () => {
  const originalEnv = process.env;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    resetStorage();
    process.env = { ...originalEnv };
    setNodeEnv(originalNodeEnv);
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    process.env = originalEnv;
    setNodeEnv(originalNodeEnv);
    jest.restoreAllMocks();
  });

  describe('getStorage', () => {
    it('should return singleton instance on subsequent calls', () => {
      mockGetStorageConfig.mockReturnValue({
        storageType: 's3',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
      } as any);

      MockS3Storage.mockImplementation(() => ({}) as any);

      const storage1 = getStorage();
      const storage2 = getStorage();

      expect(storage1).toBe(storage2);
      expect(MockS3Storage).toHaveBeenCalledTimes(1);
    });

    it('should create S3Storage when storageType is s3', () => {
      mockGetStorageConfig.mockReturnValue({
        storageType: 's3',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
      } as any);

      const mockStorageInstance = {} as any;
      MockS3Storage.mockImplementation(() => mockStorageInstance);

      const storage = getStorage();

      expect(MockS3Storage).toHaveBeenCalledTimes(1);
      expect(storage).toBe(mockStorageInstance);
    });

    it('should throw error when s3Bucket is missing', () => {
      setNodeEnv('development');
      mockGetStorageConfig.mockReturnValue({
        storageType: 's3',
        s3Bucket: undefined,
        s3Region: 'us-east-1',
      } as any);

      expect(() => getStorage()).toThrow(
        'STORAGE_TYPE=s3 requires S3_BUCKET_NAME to be set'
      );
    });

    it('should throw error when s3Region is missing', () => {
      setNodeEnv('development');
      mockGetStorageConfig.mockReturnValue({
        storageType: 's3',
        s3Bucket: 'test-bucket',
        s3Region: undefined,
      } as any);

      expect(() => getStorage()).toThrow(
        'STORAGE_TYPE=s3 requires S3_REGION to be set'
      );
    });

    it('should throw error when S3Storage initialization fails', () => {
      mockGetStorageConfig.mockReturnValue({
        storageType: 's3',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
      } as any);

      MockS3Storage.mockImplementation(() => {
        throw new Error('S3 client creation failed');
      });

      expect(() => getStorage()).toThrow(
        'S3Storage initialization failed: S3 client creation failed'
      );
    });

    it('should create MemoryStorage when local storage is requested in tests', () => {
      setNodeEnv('test');
      mockGetStorageConfig.mockReturnValue({
        storageType: 'local',
      } as any);

      const storage = getStorage();
      expect(storage).toBeInstanceOf(MemoryStorage);
    });

    it('should include environment in error message', () => {
      setNodeEnv('production');
      mockGetStorageConfig.mockReturnValue({
        storageType: 's3',
        s3Bucket: undefined,
        s3Region: 'us-east-1',
      } as any);

      expect(() => getStorage()).toThrow('Current environment: production');
    });
  });

  describe('resetStorage', () => {
    it('should reset singleton instance', () => {
      mockGetStorageConfig.mockReturnValue({
        storageType: 's3',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
      } as any);

      MockS3Storage.mockImplementation(() => ({}) as any);

      const storage1 = getStorage();
      resetStorage();
      const storage2 = getStorage();

      expect(storage1).not.toBe(storage2);
      expect(MockS3Storage).toHaveBeenCalledTimes(2);
    });
  });
});
