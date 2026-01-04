import 'server-only';

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Storage } from './types';
import { getStorageConfig } from './config';

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, '');
}

function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex > 0 ? filename.slice(lastDotIndex + 1) : '';
}

export class LocalFileStorage implements Storage {
  private baseDir: string;
  private basePrefix: string;
  private config: ReturnType<typeof getStorageConfig>;

  constructor(
    config: ReturnType<typeof getStorageConfig> = getStorageConfig()
  ) {
    this.config = config;
    this.baseDir =
      config.localRoot || path.join(process.cwd(), '.local-storage');
    this.basePrefix = normalizePrefix(config.storageBasePrefix || 'uploads');
  }

  validateFile(_filename: string, contentType: string, fileSize: number): void {
    void _filename;
    if (!contentType) {
      throw new Error('Content-Type is required');
    }
    if (fileSize > this.config.maxFileSizeBytes) {
      throw new Error(
        `File size ${fileSize} exceeds maximum ${this.config.maxFileSizeBytes} bytes`
      );
    }
  }

  generateFileKey(originalFilename: string, prefix?: string): string {
    const fileId = randomUUID();
    const ext = getFileExtension(originalFilename);
    const safePrefix = normalizePrefix(prefix || this.basePrefix);
    const fileName = ext ? `${fileId}.${ext}` : fileId;
    return `${safePrefix}/${fileName}`;
  }

  async saveFile(
    fileContent: Buffer | Uint8Array,
    fileKey: string,
    _contentType: string
  ): Promise<string> {
    void _contentType;
    const fullPath = path.join(this.baseDir, fileKey);
    const dirPath = path.dirname(fullPath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(fullPath, fileContent);
    return fileKey;
  }

  async downloadFile(fileKey: string): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, fileKey);
    return fs.readFile(fullPath);
  }

  async deleteFile(fileKey: string): Promise<boolean> {
    const fullPath = path.join(this.baseDir, fileKey);
    try {
      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async fileExists(fileKey: string): Promise<boolean> {
    const fullPath = path.join(this.baseDir, fileKey);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  getFileUrl(fileKey: string): string {
    const fullPath = path.join(this.baseDir, fileKey);
    return `file://${fullPath}`;
  }

  async presignPut(
    _key: string,
    _contentType: string,
    _expires?: number
  ): Promise<string> {
    void _key;
    void _contentType;
    void _expires;
    throw new Error('presignPut is not supported for LocalFileStorage');
  }

  async presignPost(
    _key: string,
    _contentType: string,
    _maxMb?: number,
    _expires?: number
  ): Promise<Record<string, unknown>> {
    void _key;
    void _contentType;
    void _maxMb;
    void _expires;
    throw new Error('presignPost is not supported for LocalFileStorage');
  }
}

export class MemoryStorage implements Storage {
  private files = new Map<string, Buffer>();
  private basePrefix: string;
  private config: ReturnType<typeof getStorageConfig>;

  constructor(
    config: ReturnType<typeof getStorageConfig> = getStorageConfig()
  ) {
    this.config = config;
    this.basePrefix = normalizePrefix(config.storageBasePrefix || 'uploads');
  }

  validateFile(_filename: string, contentType: string, fileSize: number): void {
    void _filename;
    if (!contentType) {
      throw new Error('Content-Type is required');
    }
    if (fileSize > this.config.maxFileSizeBytes) {
      throw new Error(
        `File size ${fileSize} exceeds maximum ${this.config.maxFileSizeBytes} bytes`
      );
    }
  }

  generateFileKey(originalFilename: string, prefix?: string): string {
    const fileId = randomUUID();
    const ext = getFileExtension(originalFilename);
    const safePrefix = normalizePrefix(prefix || this.basePrefix);
    const fileName = ext ? `${fileId}.${ext}` : fileId;
    return `${safePrefix}/${fileName}`;
  }

  async saveFile(
    fileContent: Buffer | Uint8Array,
    fileKey: string,
    _contentType: string
  ): Promise<string> {
    void _contentType;
    this.files.set(fileKey, Buffer.from(fileContent));
    return fileKey;
  }

  async downloadFile(fileKey: string): Promise<Buffer> {
    const data = this.files.get(fileKey);
    if (!data) {
      throw new Error(`File not found: ${fileKey}`);
    }
    return Buffer.from(data);
  }

  async deleteFile(fileKey: string): Promise<boolean> {
    return this.files.delete(fileKey);
  }

  async fileExists(fileKey: string): Promise<boolean> {
    return this.files.has(fileKey);
  }

  getFileUrl(fileKey: string): string {
    return `memory://${fileKey}`;
  }

  async presignPut(
    _key: string,
    _contentType: string,
    _expires?: number
  ): Promise<string> {
    void _key;
    void _contentType;
    void _expires;
    throw new Error('presignPut is not supported for MemoryStorage');
  }

  async presignPost(
    _key: string,
    _contentType: string,
    _maxMb?: number,
    _expires?: number
  ): Promise<Record<string, unknown>> {
    void _key;
    void _contentType;
    void _maxMb;
    void _expires;
    throw new Error('presignPost is not supported for MemoryStorage');
  }

  async presignGet(key: string): Promise<string> {
    return this.getFileUrl(key);
  }
}
