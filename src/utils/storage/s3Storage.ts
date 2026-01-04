/**
 * S3 Storage implementation
 * Ported from Python s3_storage.py
 *
 * Note: Install AWS SDK packages:
 * npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 */

import 'server-only';

import { logInfo, logError, logWarn } from '../logger';
import { getStorageConfig } from './config';
import type { Storage } from './types';
import { createHash, randomUUID } from 'crypto';
import type {
  S3Client as AwsS3Client,
  PutObjectCommandInput,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
type AwsSdk = {
  S3Client: typeof import('@aws-sdk/client-s3').S3Client;
  PutObjectCommand: typeof import('@aws-sdk/client-s3').PutObjectCommand;
  GetObjectCommand: typeof import('@aws-sdk/client-s3').GetObjectCommand;
  DeleteObjectCommand: typeof import('@aws-sdk/client-s3').DeleteObjectCommand;
  HeadObjectCommand: typeof import('@aws-sdk/client-s3').HeadObjectCommand;
  getSignedUrl: typeof import('@aws-sdk/s3-request-presigner').getSignedUrl;
  createPresignedPost: typeof import('@aws-sdk/s3-presigned-post').createPresignedPost;
};

/**
 * Calculate SHA-256 hash of file content for deduplication
 */
function calculateFileHash(fileContent: Buffer | Uint8Array): string {
  return createHash('sha256').update(fileContent).digest('hex');
}

/**
 * Get file metadata
 */
function getFileMetadata(
  fileContent: Buffer | Uint8Array,
  filename: string,
  contentType: string
) {
  return {
    size: fileContent.length,
    hash: calculateFileHash(fileContent),
    filename,
    content_type: contentType,
    upload_timestamp: Date.now(),
  };
}

/**
 * Get SSE (Server-Side Encryption) kwargs
 */
type ServerSideEncryptionType = 'AES256' | 'aws:kms';

function getSseKwargs(config: ReturnType<typeof getStorageConfig>): {
  ServerSideEncryption?: ServerSideEncryptionType;
  SSEKMSKeyId?: string;
} {
  if (config.kmsKeyId) {
    return {
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: config.kmsKeyId,
    };
  }
  if (!config.awsEndpointUrl) {
    return { ServerSideEncryption: 'AES256' };
  }
  return {};
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof (value as Record<PropertyKey, unknown>)[Symbol.asyncIterator] ===
      'function'
  );
}

async function collectBodyBuffer(
  body: GetObjectCommandOutput['Body']
): Promise<Buffer> {
  if (!body) {
    throw new Error('S3 response missing body');
  }

  if (isAsyncIterable<Uint8Array>(body)) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    const buffer = await body.arrayBuffer();
    return Buffer.from(buffer);
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (Buffer.isBuffer(body)) {
    return Buffer.from(body);
  }

  if (typeof body === 'string') {
    return Buffer.from(body);
  }

  throw new Error('Unsupported S3 response body type');
}

function isAwsError(
  error: unknown
): error is { name?: string; Code?: string; message?: string } {
  return typeof error === 'object' && error !== null;
}

/**
 * Bounded cache for file hashes (prevents memory growth)
 */
class BoundedMap<K, V> extends Map<K, V> {
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    super();
    this.maxSize = maxSize;
  }

  set(key: K, value: V): this {
    if (this.size >= this.maxSize && !this.has(key)) {
      const firstKey = this.keys().next().value;
      if (firstKey !== undefined) {
        this.delete(firstKey);
      }
    }
    return super.set(key, value);
  }
}

/**
 * Lazy load AWS SDK (server-only)
 */
async function loadAwsSdk(): Promise<AwsSdk> {
  // Dynamic import to avoid bundling in client
  const s3Module = await import('@aws-sdk/client-s3');
  const presignerModule = await import('@aws-sdk/s3-request-presigner');
  const presignedPostModule = await import('@aws-sdk/s3-presigned-post');

  return {
    S3Client: s3Module.S3Client,
    PutObjectCommand: s3Module.PutObjectCommand,
    GetObjectCommand: s3Module.GetObjectCommand,
    DeleteObjectCommand: s3Module.DeleteObjectCommand,
    HeadObjectCommand: s3Module.HeadObjectCommand,
    getSignedUrl: presignerModule.getSignedUrl,
    createPresignedPost: presignedPostModule.createPresignedPost,
  };
}

/**
 * Initialize S3 client
 */
async function initS3Client(): Promise<AwsS3Client> {
  const sdk = await loadAwsSdk();
  const config = getStorageConfig();

  if (!config.s3Bucket) {
    throw new Error('S3_BUCKET_NAME is required when STORAGE_TYPE=s3');
  }
  if (!config.s3Region) {
    throw new Error('S3_REGION is required when STORAGE_TYPE=s3');
  }

  const clientConfig: {
    region: string;
    credentials?: { accessKeyId: string; secretAccessKey: string };
    endpoint?: string;
    forcePathStyle?: boolean;
  } = {
    region: config.s3Region,
  };

  if (config.awsAccessKeyId && config.awsSecretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey,
    };
  }

  if (config.awsEndpointUrl) {
    clientConfig.endpoint = config.awsEndpointUrl;
  }

  if (config.s3AddressingStyle === 'path-style') {
    clientConfig.forcePathStyle = true;
  }

  return new sdk.S3Client(clientConfig);
}

export class S3Storage implements Storage {
  private s3Client: AwsS3Client | null = null;
  private sdk: AwsSdk | null = null;
  private bucket: string;
  private config: ReturnType<typeof getStorageConfig>;
  // Process-local cache to prevent duplicate uploads within the same instance.
  private fileHashes: Map<string, string>;
  private initPromise: Promise<void> | null = null;

  constructor(client?: AwsS3Client, sdk?: AwsSdk) {
    this.config = getStorageConfig();
    this.bucket = this.config.s3Bucket!;
    this.fileHashes = new BoundedMap<string, string>(1000);

    if (client && sdk) {
      // Dependency injection for testing
      this.s3Client = client;
      this.sdk = sdk;
    } else {
      // Lazy initialization
      this.initPromise = this.initialize();
    }
  }

  private async initialize(): Promise<void> {
    if (this.s3Client && this.sdk) return;
    this.sdk = await loadAwsSdk();
    this.s3Client = await initS3Client();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.s3Client && this.sdk) return;
    if (this.initPromise) {
      await this.initPromise;
    } else {
      await this.initialize();
    }
    if (!this.s3Client || !this.sdk) {
      throw new Error('S3 client not initialized');
    }
  }

  validateFile(
    filename: string,
    contentType: string,
    fileSize: number,
    _options?: { allowOctet?: boolean }
  ): void {
    void _options;
    if (fileSize > this.config.maxFileSizeBytes) {
      throw new Error(
        `File size ${fileSize} exceeds maximum ${this.config.maxFileSizeBytes} bytes`
      );
    }

    // Basic validation - can be extended
    if (!contentType) {
      throw new Error(`Content-Type is required for ${filename}`);
    }
  }

  generateFileKey(originalFilename: string, prefix?: string): string {
    const fileId = randomUUID();
    const lastDotIndex = originalFilename.lastIndexOf('.');
    const ext =
      lastDotIndex > 0 ? originalFilename.slice(lastDotIndex + 1) : '';
    const fileName = ext ? `${fileId}.${ext}` : fileId;
    const basePrefix = this.config.storageBasePrefix || 'uploads';
    const safePrefix = (prefix || basePrefix).replace(/^\/+|\/+$/g, '');
    return `${safePrefix}/${fileName}`;
  }

  getFileUrl(fileKey: string, _expiresIn: number = 3600): string {
    void _expiresIn;
    if (!this.config.awsEndpointUrl) {
      return `https://${this.bucket}.s3.${this.config.s3Region}.amazonaws.com/${fileKey}`;
    } else {
      const endpoint = this.config.awsEndpointUrl.replace(/\/$/, '');
      return `${endpoint}/${this.bucket}/${fileKey}`;
    }
  }

  async saveFile(
    fileContent: Buffer | Uint8Array,
    fileKey: string,
    contentType: string
  ): Promise<string> {
    await this.ensureInitialized();

    const fileHash = calculateFileHash(fileContent);

    if (this.fileHashes.has(fileHash)) {
      logInfo(
        `File with hash ${fileHash.slice(0, 16)} already exists, skipping upload`
      );
      return this.fileHashes.get(fileHash)!;
    }

    try {
      const metadata = getFileMetadata(fileContent, fileKey, contentType);

      const commandInput: PutObjectCommandInput = {
        Bucket: this.bucket,
        Key: fileKey,
        Body: fileContent,
        ContentType: contentType,
        Metadata: {
          'file-hash': fileHash,
          'original-filename': metadata.filename,
          'upload-timestamp': metadata.upload_timestamp.toString(),
        },
        ...getSseKwargs(this.config),
      };

      const command = new this.sdk!.PutObjectCommand(commandInput);

      await this.s3Client!.send(command);
      this.fileHashes.set(fileHash, fileKey);

      logInfo(
        `File saved successfully - key: ${fileKey}, hash: ${fileHash.slice(0, 16)}, size: ${metadata.size} bytes`
      );

      return fileKey;
    } catch (error) {
      logError('Failed to save file to S3:', error);
      throw new Error(
        `S3 upload failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async downloadFile(fileKey: string): Promise<Buffer> {
    await this.ensureInitialized();

    try {
      logInfo(`Downloading file from S3: ${fileKey}`);

      const command = new this.sdk!.GetObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      const response = await this.s3Client!.send(command);
      const buffer = await collectBodyBuffer(response.Body);

      logInfo(
        `File downloaded successfully - key: ${fileKey}, size: ${buffer.length} bytes`
      );

      return buffer;
    } catch (error) {
      if (
        isAwsError(error) &&
        (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey')
      ) {
        logWarn(`File not found in S3: ${fileKey}`);
        throw new Error(`File not found: ${fileKey}`);
      }
      logError('Failed to download file from S3:', error);
      throw new Error(
        `S3 download failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async deleteFile(fileKey: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      logInfo(`Deleting file from S3: ${fileKey}`);

      const command = new this.sdk!.DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      await this.s3Client!.send(command);

      // Remove from hash cache
      for (const [hash, cachedKey] of this.fileHashes.entries()) {
        if (cachedKey === fileKey) {
          this.fileHashes.delete(hash);
          break;
        }
      }

      logInfo(`File deleted successfully from S3: ${fileKey}`);
      return true;
    } catch (error) {
      logError('Failed to delete file from S3:', error);
      throw new Error(
        `S3 delete failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async fileExists(fileKey: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const command = new this.sdk!.HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      await this.s3Client!.send(command);
      return true;
    } catch (error) {
      if (
        isAwsError(error) &&
        (error.name === 'NotFound' ||
          error.Code === '404' ||
          error.Code === 'NoSuchKey')
      ) {
        return false;
      }
      logError(`Failed to check existence of ${fileKey} in S3:`, error);
      throw new Error(
        `S3 head failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async presignPut(
    key: string,
    contentType: string,
    expires: number = 3600
  ): Promise<string> {
    await this.ensureInitialized();

    const command = new this.sdk!.PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return this.sdk!.getSignedUrl(this.s3Client!, command, {
      expiresIn: expires,
    });
  }

  async presignGet(key: string, expires: number = 3600): Promise<string> {
    await this.ensureInitialized();

    const command = new this.sdk!.GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return this.sdk!.getSignedUrl(this.s3Client!, command, {
      expiresIn: expires,
    });
  }

  async presignPost(
    key: string,
    contentType: string,
    maxMb: number = 10,
    expires: number = 900
  ): Promise<Record<string, unknown>> {
    await this.ensureInitialized();

    const maxBytes =
      maxMb && maxMb > 0
        ? Math.round(maxMb * 1024 * 1024)
        : this.config.maxFileSizeBytes;

    const { url, fields } = await this.sdk!.createPresignedPost(
      this.s3Client!,
      {
        Bucket: this.bucket,
        Key: key,
        Fields: {
          'Content-Type': contentType,
        },
        Conditions: [['content-length-range', 0, maxBytes]],
        Expires: expires,
      }
    );

    return {
      url,
      fields,
    };
  }
}
