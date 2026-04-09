import { S3Storage } from '../s3Storage';

jest.mock('../config', () => ({
  getStorageConfig: jest.fn(() => ({
    storageType: 's3',
    s3Bucket: 'test-bucket',
    s3Region: 'us-east-1',
    maxFileSizeBytes: 10 * 1024 * 1024,
    storageBasePrefix: 'uploads',
  })),
}));

describe('S3Storage', () => {
  function createStorage() {
    const send = jest.fn().mockResolvedValue({});
    const client = { send } as any;
    const sdk = {
      PutObjectCommand: jest.fn((input: unknown) => input),
      GetObjectCommand: jest.fn(),
      DeleteObjectCommand: jest.fn((input: unknown) => input),
      HeadObjectCommand: jest.fn(),
      S3Client: jest.fn(),
      getSignedUrl: jest.fn(),
      createPresignedPost: jest.fn(),
    } as any;

    return {
      storage: new S3Storage(client, sdk),
      send,
      sdk,
    };
  }

  it('stores identical content at each requested key instead of reusing a prior key', async () => {
    const { storage, send } = createStorage();
    const content = Buffer.from('same-content');

    const first = await storage.saveFile(
      content,
      'tenant-a/file-one.jpg',
      'image/jpeg'
    );
    const second = await storage.saveFile(
      content,
      'tenant-b/file-two.jpg',
      'image/jpeg'
    );

    expect(first).toBe('tenant-a/file-one.jpg');
    expect(second).toBe('tenant-b/file-two.jpg');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toMatchObject({
      Key: 'tenant-a/file-one.jpg',
    });
    expect(send.mock.calls[1][0]).toMatchObject({
      Key: 'tenant-b/file-two.jpg',
    });
  });
});
