/** @jest-environment node */

import * as fs from 'fs';
import * as path from 'path';
import {
  HASHED_STATIC_CACHE_DIRECTIVES,
  OPTIMIZER_SOURCE_URL,
  SMOKE_FIXTURE_HEIGHT,
  SMOKE_FIXTURE_MIN_BYTES,
  SMOKE_FIXTURE_WIDTH,
  detectImageFormat,
  findStaticAssetPath,
  parsePngDimensions,
  parseWebpDimensions,
  resolveBaseUrl,
  validateOptimizedNegotiation,
  validateSourceFixture,
  validateStaticAssetCache,
  validateWebpResize,
  type HttpSnapshot,
} from '../../../scripts/staging/image-optimizer-acceptance';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../public/image-optimizer-smoke.png'
);

const fixtureBytes = fs.readFileSync(FIXTURE_PATH);

function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function webpVp8(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(22, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  buf[23] = 0x9d;
  buf[24] = 0x01;
  buf[25] = 0x2a;
  buf.writeUInt16LE(width, 26);
  buf.writeUInt16LE(height, 28);
  return buf;
}

function webpVp8l(width: number, height: number): Buffer {
  const buf = Buffer.alloc(25);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(17, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8L', 12, 'ascii');
  buf.writeUInt32LE(5, 16);
  buf[20] = 0x2f;
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  buf.writeUInt32LE(bits >>> 0, 21);
  return buf;
}

function webpVp8x(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(22, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

function snapshot(overrides: Partial<HttpSnapshot> = {}): HttpSnapshot {
  return {
    status: 200,
    contentType: 'image/png',
    cacheControl: 'public, max-age=0, must-revalidate',
    vary: null,
    body: fixtureBytes,
    ...overrides,
  };
}

describe('committed smoke fixture', () => {
  it('is a 1280x800 PNG', () => {
    expect(parsePngDimensions(fixtureBytes)).toEqual({
      width: SMOKE_FIXTURE_WIDTH,
      height: SMOKE_FIXTURE_HEIGHT,
    });
    expect(detectImageFormat(fixtureBytes)).toBe('png');
  });

  it('is nontrivial, well above the 1x1 solid-color size', () => {
    expect(fixtureBytes.length).toBeGreaterThan(SMOKE_FIXTURE_MIN_BYTES);
  });

  it('passes source fixture validation', () => {
    expect(validateSourceFixture(snapshot())).toEqual({
      contentType: 'image/png',
      bytes: fixtureBytes.length,
      width: SMOKE_FIXTURE_WIDTH,
      height: SMOKE_FIXTURE_HEIGHT,
      cacheControl: 'public, max-age=0, must-revalidate',
    });
  });
});

describe('PNG parser', () => {
  it('reads width and height from IHDR', () => {
    expect(parsePngDimensions(pngHeader(640, 400))).toEqual({
      width: 640,
      height: 400,
    });
  });

  it('rejects non-PNG bytes', () => {
    expect(() => parsePngDimensions(Buffer.alloc(40))).toThrow(/not a PNG/);
  });

  it('rejects a PNG whose first chunk is not IHDR', () => {
    const buf = pngHeader(1, 1);
    buf.write('IDAT', 12, 'ascii');
    expect(() => parsePngDimensions(buf)).toThrow(/IHDR/);
  });
});

describe('WebP dimension parser', () => {
  it('reads lossy VP8 dimensions', () => {
    expect(parseWebpDimensions(webpVp8(640, 400))).toEqual({
      width: 640,
      height: 400,
    });
  });

  it('reads lossless VP8L dimensions', () => {
    expect(parseWebpDimensions(webpVp8l(640, 400))).toEqual({
      width: 640,
      height: 400,
    });
  });

  it('reads extended VP8X canvas dimensions', () => {
    expect(parseWebpDimensions(webpVp8x(640, 400))).toEqual({
      width: 640,
      height: 400,
    });
  });

  it('rejects a non-WebP RIFF container', () => {
    const buf = webpVp8(640, 400);
    buf.write('WAVE', 8, 'ascii');
    expect(() => parseWebpDimensions(buf)).toThrow(/not a WebP/);
  });

  it('rejects a VP8 frame with a bad start code', () => {
    const buf = webpVp8(640, 400);
    buf[24] = 0x00;
    expect(() => parseWebpDimensions(buf)).toThrow(/start code/);
  });

  it('identifies WebP and AVIF containers', () => {
    expect(detectImageFormat(webpVp8(1, 1))).toBe('webp');
    const avif = Buffer.alloc(16);
    avif.writeUInt32BE(16, 0);
    avif.write('ftypavif', 4, 'ascii');
    expect(detectImageFormat(avif)).toBe('avif');
  });
});

describe('optimizer negotiation validation', () => {
  const optimized = Buffer.from('optimized-avif-bytes-not-png');

  it('accepts a modern-format response that differs from the source', () => {
    expect(
      validateOptimizedNegotiation(
        snapshot({
          contentType: 'image/avif',
          vary: 'Accept',
          body: optimized,
        }),
        fixtureBytes
      )
    ).toEqual({
      contentType: 'image/avif',
      bytes: optimized.length,
      vary: 'Accept',
    });
  });

  it('accepts image/webp when Vary includes Accept among other tokens', () => {
    expect(
      validateOptimizedNegotiation(
        snapshot({
          contentType: 'image/webp',
          vary: 'Accept-Encoding, accept',
          body: optimized,
        }),
        fixtureBytes
      ).contentType
    ).toBe('image/webp');
  });

  it('rejects an unchanged source PNG passthrough', () => {
    expect(() =>
      validateOptimizedNegotiation(
        snapshot({
          contentType: 'image/png',
          vary: 'Accept',
          body: fixtureBytes,
        }),
        fixtureBytes
      )
    ).toThrow(/unchanged image\/png/);
  });

  it('rejects a response whose bytes equal the source even if labelled AVIF', () => {
    expect(() =>
      validateOptimizedNegotiation(
        snapshot({
          contentType: 'image/avif',
          vary: 'Accept',
          body: Buffer.from(fixtureBytes),
        }),
        fixtureBytes
      )
    ).toThrow(/identical to the source/);
  });

  it('rejects an empty response', () => {
    expect(() =>
      validateOptimizedNegotiation(
        snapshot({
          contentType: 'image/webp',
          vary: 'Accept',
          body: Buffer.alloc(0),
        }),
        fixtureBytes
      )
    ).toThrow(/empty/);
  });

  it('rejects a response without Accept in Vary', () => {
    expect(() =>
      validateOptimizedNegotiation(
        snapshot({
          contentType: 'image/webp',
          vary: 'Accept-Encoding',
          body: optimized,
        }),
        fixtureBytes
      )
    ).toThrow(/Vary/);
  });

  it('rejects a non-200 response', () => {
    expect(() =>
      validateOptimizedNegotiation(
        snapshot({ status: 502, contentType: 'image/webp', body: optimized }),
        fixtureBytes
      )
    ).toThrow(/HTTP 200/);
  });
});

describe('WebP resize validation', () => {
  it('accepts exactly 640x400', () => {
    expect(
      validateWebpResize(
        snapshot({ contentType: 'image/webp', body: webpVp8(640, 400) })
      )
    ).toMatchObject({ width: 640, height: 400, contentType: 'image/webp' });
  });

  it('rejects the unresized 1280x800 output', () => {
    expect(() =>
      validateWebpResize(
        snapshot({ contentType: 'image/webp', body: webpVp8(1280, 800) })
      )
    ).toThrow(/expected 640x400, got 1280x800/);
  });

  it('rejects a non-WebP content type', () => {
    expect(() =>
      validateWebpResize(
        snapshot({ contentType: 'image/avif', body: webpVp8(640, 400) })
      )
    ).toThrow(/expected image\/webp/);
  });
});

describe('cache assertions', () => {
  it('requires the unhashed fixture to revalidate and never be immutable', () => {
    expect(() =>
      validateSourceFixture(
        snapshot({
          cacheControl: 'public, max-age=0, must-revalidate, immutable',
        })
      )
    ).toThrow(/must not contain "immutable"/);

    expect(() =>
      validateSourceFixture(snapshot({ cacheControl: 'public, max-age=0' }))
    ).toThrow(/missing "must-revalidate"/);
  });

  it('requires the hashed static asset to be immutable for one year', () => {
    const ok: HttpSnapshot = {
      status: 200,
      contentType: 'text/javascript',
      cacheControl: 'public, max-age=31536000, immutable',
      body: Buffer.alloc(0),
    };
    expect(validateStaticAssetCache(ok).cacheControl).toBe(ok.cacheControl);
    expect(HASHED_STATIC_CACHE_DIRECTIVES).toEqual(
      expect.arrayContaining(['max-age=31536000', 'immutable'])
    );

    expect(() =>
      validateStaticAssetCache({
        ...ok,
        cacheControl: 'public, max-age=0, must-revalidate',
      })
    ).toThrow(/missing "max-age=31536000"/);
  });
});

describe('static asset discovery', () => {
  it('finds the first hashed js or css path referenced by HTML', () => {
    const html =
      '<link href="/_next/static/css/abc123.css" rel="stylesheet"/>' +
      '<script src="/_next/static/chunks/main-def456.js"></script>';
    expect(findStaticAssetPath(html)).toBe('/_next/static/css/abc123.css');
  });

  it('fails when no static asset is referenced', () => {
    expect(() => findStaticAssetPath('<html></html>')).toThrow(
      /no \/_next\/static/
    );
  });
});

describe('base URL resolution', () => {
  it('reads STAGING_APP_BASE_URL when no argument is given', () => {
    expect(
      resolveBaseUrl({ STAGING_APP_BASE_URL: 'https://staging.example' }, [])
        .origin
    ).toBe('https://staging.example');
  });

  it('prefers the CLI argument over the environment', () => {
    expect(
      resolveBaseUrl({ STAGING_APP_BASE_URL: 'https://env.example' }, [
        'https://arg.example',
      ]).origin
    ).toBe('https://arg.example');
  });

  it('fails closed when no base URL is supplied', () => {
    expect(() => resolveBaseUrl({}, [])).toThrow(/missing base URL/);
  });

  it('rejects plain http for non-loopback hosts', () => {
    expect(() => resolveBaseUrl({}, ['http://staging.example'])).toThrow(
      /must use https/
    );
  });

  it('allows http only for loopback', () => {
    expect(resolveBaseUrl({}, ['http://localhost:3000']).origin).toBe(
      'http://localhost:3000'
    );
  });
});

describe('request contract', () => {
  it('uses the encoded fixture URL with the 640 width and q=75', () => {
    expect(OPTIMIZER_SOURCE_URL).toBe(
      '/_next/image?url=%2Fimage-optimizer-smoke.png&w=640&q=75'
    );
  });
});
