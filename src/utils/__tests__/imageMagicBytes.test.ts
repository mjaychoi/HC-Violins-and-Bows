import {
  isValidImageSignature,
  detectMimeTypeFromSignature,
  resolveImageMimeType,
} from '../imageMagicBytes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function jpegBuffer(): Buffer {
  // Minimal valid JPEG header
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

function pngBuffer(): Buffer {
  // Full 8-byte PNG magic
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function webpBuffer(): Buffer {
  // RIFF????WEBP
  return Buffer.from([
    0x52,
    0x49,
    0x46,
    0x46, // RIFF
    0x00,
    0x00,
    0x00,
    0x00, // file size (don't care)
    0x57,
    0x45,
    0x42,
    0x50, // WEBP
  ]);
}

function pdfBuffer(): Buffer {
  // %PDF- magic — not an image
  return Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
}

function phpBuffer(): Buffer {
  // <?php magic
  return Buffer.from([0x3c, 0x3f, 0x70, 0x68, 0x70]);
}

function shortBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8]); // JPEG but only 2 bytes
}

// ── isValidImageSignature ─────────────────────────────────────────────────────

describe('isValidImageSignature', () => {
  it('accepts a JPEG buffer for image/jpeg', () => {
    expect(isValidImageSignature(jpegBuffer(), 'image/jpeg')).toBe(true);
  });

  it('accepts a JPEG buffer for image/jpg alias', () => {
    expect(isValidImageSignature(jpegBuffer(), 'image/jpg')).toBe(true);
  });

  it('accepts a PNG buffer for image/png', () => {
    expect(isValidImageSignature(pngBuffer(), 'image/png')).toBe(true);
  });

  it('accepts a WebP buffer for image/webp', () => {
    expect(isValidImageSignature(webpBuffer(), 'image/webp')).toBe(true);
  });

  it('rejects a PDF buffer declared as image/jpeg', () => {
    expect(isValidImageSignature(pdfBuffer(), 'image/jpeg')).toBe(false);
  });

  it('rejects a PHP script buffer declared as image/png', () => {
    expect(isValidImageSignature(phpBuffer(), 'image/png')).toBe(false);
  });

  it('rejects a PNG buffer declared as image/jpeg', () => {
    expect(isValidImageSignature(pngBuffer(), 'image/jpeg')).toBe(false);
  });

  it('rejects a JPEG buffer declared as image/png', () => {
    expect(isValidImageSignature(jpegBuffer(), 'image/png')).toBe(false);
  });

  it('rejects a buffer that is too short for JPEG', () => {
    expect(isValidImageSignature(shortBuffer(), 'image/jpeg')).toBe(false);
  });

  it('rejects an empty buffer', () => {
    expect(isValidImageSignature(Buffer.alloc(0), 'image/jpeg')).toBe(false);
  });

  it('returns false for an unknown MIME type', () => {
    expect(
      isValidImageSignature(jpegBuffer(), 'application/octet-stream')
    ).toBe(false);
  });
});

// ── detectMimeTypeFromSignature ───────────────────────────────────────────────

describe('detectMimeTypeFromSignature', () => {
  it('detects JPEG', () => {
    expect(detectMimeTypeFromSignature(jpegBuffer())).toBe('image/jpeg');
  });

  it('detects PNG', () => {
    expect(detectMimeTypeFromSignature(pngBuffer())).toBe('image/png');
  });

  it('detects WebP', () => {
    expect(detectMimeTypeFromSignature(webpBuffer())).toBe('image/webp');
  });

  it('returns null for PDF bytes', () => {
    expect(detectMimeTypeFromSignature(pdfBuffer())).toBeNull();
  });

  it('returns null for empty buffer', () => {
    expect(detectMimeTypeFromSignature(Buffer.alloc(0))).toBeNull();
  });
});

// ── resolveImageMimeType ──────────────────────────────────────────────────────

describe('resolveImageMimeType', () => {
  it('resolves JPEG from matching Content-Type, extension, and magic bytes', () => {
    expect(resolveImageMimeType('photo.jpg', 'image/jpeg', jpegBuffer())).toBe(
      'image/jpeg'
    );
  });

  it('normalises image/jpg alias to image/jpeg', () => {
    expect(resolveImageMimeType('photo.jpg', 'image/jpg', jpegBuffer())).toBe(
      'image/jpeg'
    );
  });

  it('resolves PNG from matching signals', () => {
    expect(resolveImageMimeType('image.png', 'image/png', pngBuffer())).toBe(
      'image/png'
    );
  });

  it('resolves WebP from matching signals', () => {
    expect(resolveImageMimeType('img.webp', 'image/webp', webpBuffer())).toBe(
      'image/webp'
    );
  });

  it('returns null when magic bytes do not match Content-Type', () => {
    // File claims to be JPEG but contains PNG bytes
    expect(
      resolveImageMimeType('photo.jpg', 'image/jpeg', pngBuffer())
    ).toBeNull();
  });

  it('returns null when a PHP file is renamed to .jpg', () => {
    expect(
      resolveImageMimeType('shell.jpg', 'image/jpeg', phpBuffer())
    ).toBeNull();
  });

  it('returns null when a PDF is renamed to .png', () => {
    expect(
      resolveImageMimeType('document.png', 'image/png', pdfBuffer())
    ).toBeNull();
  });

  it('falls back to extension when Content-Type is empty, if magic bytes match', () => {
    expect(resolveImageMimeType('photo.jpg', '', jpegBuffer())).toBe(
      'image/jpeg'
    );
  });

  it('falls back to magic-byte detection when Content-Type and extension are both missing', () => {
    expect(resolveImageMimeType('', '', jpegBuffer())).toBe('image/jpeg');
  });

  it('returns null for an unsupported Content-Type even if bytes look like JPEG', () => {
    // Content-Type is application/octet-stream, extension missing, bytes are JPEG
    // Should still resolve because signature detection kicks in
    expect(
      resolveImageMimeType('', 'application/octet-stream', jpegBuffer())
    ).toBe('image/jpeg');
  });

  it('returns null for an empty buffer regardless of declared type', () => {
    expect(
      resolveImageMimeType('photo.jpg', 'image/jpeg', Buffer.alloc(0))
    ).toBeNull();
  });
});
