import { getStorageConfig } from '../config';
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

describe('S3Storage run-scoped E2E key namespace', () => {
  const PREFIX = 'e2e/0a1b2c3d4e5f';

  function createScopedStorage() {
    (getStorageConfig as jest.Mock).mockReturnValueOnce({
      storageType: 's3',
      s3Bucket: 'hc-violins-staging-e2e',
      s3Region: 'us-west-1',
      maxFileSizeBytes: 10 * 1024 * 1024,
      storageBasePrefix: 'uploads',
      e2eKeyPrefix: PREFIX,
    });
    const send = jest.fn().mockResolvedValue({});
    const sdk = {
      PutObjectCommand: jest.fn((input: unknown) => input),
      GetObjectCommand: jest.fn((input: unknown) => input),
      DeleteObjectCommand: jest.fn((input: unknown) => input),
      HeadObjectCommand: jest.fn((input: unknown) => input),
      S3Client: jest.fn(),
      getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/x'),
      createPresignedPost: jest.fn().mockResolvedValue({ url: '', fields: {} }),
    } as any;
    return {
      storage: new S3Storage({ send } as any, sdk),
      send,
      sdk,
    };
  }

  it('keeps the unprefixed production key layout when no prefix is set', async () => {
    const send = jest.fn().mockResolvedValue({});
    const sdk = {
      PutObjectCommand: jest.fn((input: unknown) => input),
      DeleteObjectCommand: jest.fn((input: unknown) => input),
    } as any;
    const storage = new S3Storage({ send } as any, sdk);

    await expect(
      storage.saveFile(Buffer.from('x'), 'org/inst/a.png', 'image/png')
    ).resolves.toBe('org/inst/a.png');
    await expect(storage.deleteFile('org/inst/a.png')).resolves.toBe(true);
    expect(send.mock.calls.map(call => call[0].Key)).toEqual([
      'org/inst/a.png',
      'org/inst/a.png',
    ]);
  });

  it('writes under e2e/<scopeKey>/ and returns the persisted prefixed key', async () => {
    const { storage, send } = createScopedStorage();

    const stored = await storage.saveFile(
      Buffer.from('x'),
      'org/inst/a.png',
      'image/png'
    );

    expect(stored).toBe(`${PREFIX}/org/inst/a.png`);
    expect(send.mock.calls[0][0]).toMatchObject({
      Bucket: 'hc-violins-staging-e2e',
      Key: `${PREFIX}/org/inst/a.png`,
    });
  });

  it('generates keys inside the namespace', () => {
    const { storage } = createScopedStorage();

    expect(storage.generateFileKey('a.png', 'instruments')).toMatch(
      new RegExp(`^${PREFIX}/instruments/[0-9a-f-]{36}\\.png$`)
    );
  });

  it('reads, deletes, and presigns keys inside the namespace', async () => {
    const { storage, send, sdk } = createScopedStorage();
    const key = `${PREFIX}/org/inst/a.png`;

    await expect(storage.deleteFile(key)).resolves.toBe(true);
    await expect(storage.fileExists(key)).resolves.toBe(true);
    await expect(storage.presignGet(key)).resolves.toBe(
      'https://signed.example/x'
    );
    expect(send.mock.calls.map(call => call[0].Key)).toEqual([key, key]);
    expect(sdk.GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'hc-violins-staging-e2e',
      Key: key,
    });
  });

  it.each([
    ['downloadFile', (s: S3Storage) => s.downloadFile('org/inst/a.png')],
    ['deleteFile', (s: S3Storage) => s.deleteFile('org/inst/a.png')],
    ['fileExists', (s: S3Storage) => s.fileExists('org/inst/a.png')],
    ['presignGet', (s: S3Storage) => s.presignGet('org/inst/a.png')],
    [
      'presignPut',
      (s: S3Storage) => s.presignPut('org/inst/a.png', 'image/png'),
    ],
    [
      'presignPost',
      (s: S3Storage) => s.presignPost('org/inst/a.png', 'image/png'),
    ],
    [
      'deleteFile (other run)',
      (s: S3Storage) => s.deleteFile('e2e/ffffffffffff/org/inst/a.png'),
    ],
  ])(
    '%s refuses a key outside the namespace without calling S3',
    async (_name, call) => {
      const { storage, send, sdk } = createScopedStorage();

      await expect(call(storage)).rejects.toThrow(
        /outside this run's E2E storage namespace/
      );
      expect(send).not.toHaveBeenCalled();
      expect(sdk.getSignedUrl).not.toHaveBeenCalled();
      expect(sdk.createPresignedPost).not.toHaveBeenCalled();
    }
  );
});
