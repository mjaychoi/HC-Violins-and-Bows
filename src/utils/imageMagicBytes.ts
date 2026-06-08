/**
 * Shared image magic-byte validation.
 *
 * Both the instrument-images upload route and the invoice-images upload route
 * use these helpers. Keeping them in one place ensures both paths apply the
 * same content check and prevents future drift.
 */

export const IMAGE_ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Returns true when the first bytes of `buffer` match the canonical magic
 * bytes for `mimeType`.  Rejects when content does not match the declared
 * type, preventing renamed non-image files from bypassing extension checks.
 */
export function isValidImageSignature(
  buffer: Buffer,
  mimeType: string
): boolean {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (mimeType === 'image/webp') {
    // RIFF....WEBP
    return (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50 // P
    );
  }

  return false;
}

/**
 * Detects the actual MIME type of `buffer` by reading its magic bytes.
 * Returns null when the content is not a recognised image format.
 */
export function detectMimeTypeFromSignature(buffer: Buffer): string | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Resolves a MIME type that is consistent with the file's declared Content-Type,
 * its extension, AND its magic bytes.  Returns null if any of these signals
 * conflict or if the content is not a recognised image.
 *
 * Resolution order: Content-Type → extension → signature detection.
 * The resolved type is always verified against actual magic bytes before
 * being returned, so the caller can trust the result for both storage and
 * Content-Type headers.
 */
export function resolveImageMimeType(
  fileName: string,
  contentType: string,
  buffer: Buffer
): string | null {
  const rawType = (contentType || '').toLowerCase();
  const normalizedType = rawType === 'image/jpg' ? 'image/jpeg' : rawType;

  const extension = fileName.includes('.')
    ? (fileName.split('.').pop()?.toLowerCase() ?? '')
    : '';

  const extensionType = extension
    ? IMAGE_EXTENSION_TO_MIME[extension]
    : undefined;
  const signatureType = detectMimeTypeFromSignature(buffer);

  const resolvedType = IMAGE_ALLOWED_MIME_TYPES[normalizedType]
    ? normalizedType
    : extensionType && IMAGE_ALLOWED_MIME_TYPES[extensionType]
      ? extensionType
      : signatureType && IMAGE_ALLOWED_MIME_TYPES[signatureType]
        ? signatureType
        : null;

  if (!resolvedType) return null;
  if (!isValidImageSignature(buffer, resolvedType)) return null;

  return resolvedType;
}
