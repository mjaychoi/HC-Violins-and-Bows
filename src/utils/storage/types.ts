/**
 * Storage interface for file operations
 * Similar to Python's Storage Protocol
 */

export interface Storage {
  /**
   * Validate file before upload
   */
  validateFile(
    filename: string,
    contentType: string,
    fileSize: number,
    options?: { allowOctet?: boolean }
  ): void;

  /**
   * Generate a unique file key for storage
   */
  generateFileKey(originalFilename: string, prefix?: string): string;

  /**
   * Save file content to storage
   */
  saveFile(
    fileContent: Buffer | Uint8Array,
    fileKey: string,
    contentType: string
  ): Promise<string>;

  /**
   * Download file from storage
   */
  downloadFile(fileKey: string): Promise<Buffer>;

  /**
   * Delete file from storage
   */
  deleteFile(fileKey: string): Promise<boolean>;

  /**
   * Check if file exists
   */
  fileExists(fileKey: string): Promise<boolean>;

  /**
   * Get public URL for file (if applicable)
   */
  getFileUrl(fileKey: string, expiresIn?: number): string;

  /**
   * Generate presigned PUT URL
   */
  presignPut(
    key: string,
    contentType: string,
    expires?: number
  ): Promise<string>;

  /**
   * Generate presigned POST URL (if applicable)
   */
  presignPost(
    key: string,
    contentType: string,
    maxMb?: number,
    expires?: number
  ): Promise<Record<string, unknown>>;

  presignGet?(key: string, expires?: number): Promise<string>;
}
