/**
 * Pure validation and parsing helpers for the hosted image optimizer
 * acceptance check. No network access: the CLI in verify-image-optimizer.ts
 * performs the requests and feeds the responses through these functions.
 */

export const SMOKE_FIXTURE_PATH = '/image-optimizer-smoke.png';
export const SMOKE_FIXTURE_WIDTH = 1280;
export const SMOKE_FIXTURE_HEIGHT = 800;
/** A 1x1 solid PNG is ~67 bytes; the real fixture is far larger. */
export const SMOKE_FIXTURE_MIN_BYTES = 4 * 1024;

export const OPTIMIZER_WIDTH = 640;
export const OPTIMIZER_QUALITY = 75;
export const OPTIMIZER_SOURCE_URL = `/_next/image?url=${encodeURIComponent(SMOKE_FIXTURE_PATH)}&w=${OPTIMIZER_WIDTH}&q=${OPTIMIZER_QUALITY}`;

/** Expected for unhashed public assets (see #145). */
export const UNHASHED_CACHE_DIRECTIVES = ['max-age=0', 'must-revalidate'];
/** Expected for hashed `/_next/static` assets (see next.config.ts). */
export const HASHED_STATIC_CACHE_DIRECTIVES = [
  'public',
  'max-age=31536000',
  'immutable',
];

export interface Dimensions {
  width: number;
  height: number;
}

export interface HttpSnapshot {
  status: number;
  contentType: string | null;
  cacheControl: string | null;
  vary?: string | null;
  body: Buffer;
}

export function parseCacheControl(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(directive => directive.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeMediaType(contentType: string | null): string {
  return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

/** Reads width/height from the PNG IHDR chunk directly (no dependencies). */
export function parsePngDimensions(buf: Buffer): Dimensions {
  if (!isPng(buf) || buf.length < 24) {
    throw new Error('not a PNG: signature missing or truncated');
  }
  if (buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('PNG is missing the IHDR chunk at the expected offset');
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Reads dimensions from a WebP file header. Supports the simple lossy
 * (VP8), lossless (VP8L) and extended (VP8X) container layouts.
 */
export function parseWebpDimensions(buf: Buffer): Dimensions {
  if (
    buf.length < 25 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('not a WebP file: RIFF/WEBP header missing');
  }
  const chunk = buf.toString('ascii', 12, 16);
  switch (chunk) {
    case 'VP8 ': {
      // 3-byte frame tag, then the 9d 01 2a start code, then 14-bit sizes.
      if (buf.length < 30) {
        throw new Error('WebP VP8 header is truncated');
      }
      if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) {
        throw new Error('WebP VP8 frame start code is invalid');
      }
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
    case 'VP8L': {
      if (buf[20] !== 0x2f) {
        throw new Error('WebP VP8L signature byte is invalid');
      }
      const bits = buf.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    case 'VP8X': {
      if (buf.length < 30) {
        throw new Error('WebP VP8X header is truncated');
      }
      return {
        width: buf.readUIntLE(24, 3) + 1,
        height: buf.readUIntLE(27, 3) + 1,
      };
    }
    default:
      throw new Error(`unsupported WebP chunk: "${chunk}"`);
  }
}

/** Identifies the container for diagnostics; AVIF dimensions are not parsed. */
export function detectImageFormat(
  buf: Buffer
): 'png' | 'webp' | 'avif' | 'unknown' {
  if (isPng(buf)) return 'png';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }
  return 'unknown';
}

function assertStatus200(label: string, snapshot: HttpSnapshot): void {
  if (snapshot.status !== 200) {
    throw new Error(`${label}: expected HTTP 200, got ${snapshot.status}`);
  }
}

function assertCacheDirectives(
  label: string,
  cacheControl: string | null,
  required: string[],
  forbidden: string[]
): void {
  const directives = parseCacheControl(cacheControl);
  for (const directive of required) {
    if (!directives.includes(directive)) {
      throw new Error(
        `${label}: Cache-Control "${cacheControl ?? ''}" is missing "${directive}"`
      );
    }
  }
  for (const directive of forbidden) {
    if (directives.includes(directive)) {
      throw new Error(
        `${label}: Cache-Control "${cacheControl ?? ''}" must not contain "${directive}"`
      );
    }
  }
}

export interface SourceFixtureEvidence {
  contentType: string;
  bytes: number;
  width: number;
  height: number;
  cacheControl: string | null;
}

/** A. The unhashed public source fixture. */
export function validateSourceFixture(
  snapshot: HttpSnapshot
): SourceFixtureEvidence {
  assertStatus200('source fixture', snapshot);

  const contentType = normalizeMediaType(snapshot.contentType);
  if (contentType !== 'image/png') {
    throw new Error(
      `source fixture: expected image/png, got "${snapshot.contentType ?? ''}"`
    );
  }
  if (snapshot.body.length < SMOKE_FIXTURE_MIN_BYTES) {
    throw new Error(
      `source fixture: ${snapshot.body.length} bytes is below the ${SMOKE_FIXTURE_MIN_BYTES}-byte minimum; the fixture is too trivial`
    );
  }
  const { width, height } = parsePngDimensions(snapshot.body);
  if (width !== SMOKE_FIXTURE_WIDTH || height !== SMOKE_FIXTURE_HEIGHT) {
    throw new Error(
      `source fixture: expected ${SMOKE_FIXTURE_WIDTH}x${SMOKE_FIXTURE_HEIGHT}, got ${width}x${height}`
    );
  }
  assertCacheDirectives(
    'source fixture',
    snapshot.cacheControl,
    UNHASHED_CACHE_DIRECTIVES,
    ['immutable']
  );

  return {
    contentType,
    bytes: snapshot.body.length,
    width,
    height,
    cacheControl: snapshot.cacheControl,
  };
}

export interface NegotiationEvidence {
  contentType: string;
  bytes: number;
  vary: string | null;
}

/**
 * B. Modern-format negotiation. Rejects any response that is the unchanged
 * source PNG, since that means the optimizer passed the file through.
 */
export function validateOptimizedNegotiation(
  snapshot: HttpSnapshot,
  source: Buffer
): NegotiationEvidence {
  assertStatus200('optimized (avif/webp negotiation)', snapshot);

  const contentType = normalizeMediaType(snapshot.contentType);
  if (contentType === 'image/png' || contentType === 'image/jpeg') {
    throw new Error(
      `optimized: optimizer returned unchanged ${contentType}; expected image/avif or image/webp`
    );
  }
  if (contentType !== 'image/avif' && contentType !== 'image/webp') {
    throw new Error(
      `optimized: expected image/avif or image/webp, got "${snapshot.contentType ?? ''}"`
    );
  }
  if (snapshot.body.length === 0) {
    throw new Error('optimized: response body is empty');
  }
  if (snapshot.body.equals(source)) {
    throw new Error(
      'optimized: response bytes are identical to the source PNG'
    );
  }
  const vary = snapshot.vary ?? null;
  const varyTokens = (vary ?? '')
    .split(',')
    .map(token => token.trim().toLowerCase());
  if (!varyTokens.includes('accept')) {
    throw new Error(`optimized: Vary "${vary ?? ''}" does not contain Accept`);
  }

  return { contentType, bytes: snapshot.body.length, vary };
}

export interface WebpResizeEvidence {
  contentType: string;
  bytes: number;
  width: number;
  height: number;
}

/** C. Deterministic resize, verified on a WebP-only request. */
export function validateWebpResize(snapshot: HttpSnapshot): WebpResizeEvidence {
  assertStatus200('optimized (webp resize)', snapshot);

  const contentType = normalizeMediaType(snapshot.contentType);
  if (contentType !== 'image/webp') {
    throw new Error(
      `webp resize: expected image/webp, got "${snapshot.contentType ?? ''}"`
    );
  }
  const { width, height } = parseWebpDimensions(snapshot.body);
  const expectedHeight = Math.round(
    (SMOKE_FIXTURE_HEIGHT * OPTIMIZER_WIDTH) / SMOKE_FIXTURE_WIDTH
  );
  if (width !== OPTIMIZER_WIDTH || height !== expectedHeight) {
    throw new Error(
      `webp resize: expected ${OPTIMIZER_WIDTH}x${expectedHeight}, got ${width}x${height}`
    );
  }

  return {
    contentType,
    bytes: snapshot.body.length,
    width,
    height,
  };
}

export interface StaticAssetEvidence {
  cacheControl: string | null;
}

/** D. A hashed `/_next/static` asset keeps its one-year immutable cache. */
export function validateStaticAssetCache(
  snapshot: HttpSnapshot
): StaticAssetEvidence {
  assertStatus200('hashed static asset', snapshot);
  assertCacheDirectives(
    'hashed static asset',
    snapshot.cacheControl,
    HASHED_STATIC_CACHE_DIRECTIVES,
    []
  );
  return { cacheControl: snapshot.cacheControl };
}

const STATIC_ASSET_PATTERN = /\/_next\/static\/[^"'\s<>()\\?#]+\.(?:js|css)/g;

/** Returns the first hashed `/_next/static` JS or CSS path referenced by HTML. */
export function findStaticAssetPath(html: string): string {
  const match = html.match(STATIC_ASSET_PATTERN);
  if (!match || match.length === 0) {
    throw new Error(
      'no /_next/static .js or .css asset referenced by the page'
    );
  }
  return match[0];
}

/**
 * Resolves the staging base URL from the env var or the CLI argument.
 * Requires https, except for a loopback host used for local verification.
 */
export function resolveBaseUrl(
  env: Record<string, string | undefined>,
  argv: string[]
): URL {
  const raw = (argv[0] ?? env.STAGING_APP_BASE_URL ?? '').trim();
  if (!raw) {
    throw new Error(
      'missing base URL: set STAGING_APP_BASE_URL or pass it as the first argument'
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('base URL is not a valid URL');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error(
      'base URL must use https (http is allowed only for loopback)'
    );
  }
  return url;
}
