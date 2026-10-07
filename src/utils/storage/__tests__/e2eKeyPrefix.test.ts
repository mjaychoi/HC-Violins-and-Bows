import {
  applyE2EKeyPrefix,
  assertKeyInE2ENamespace,
  parseStorageE2EKeyPrefix,
} from '../e2eKeyPrefix';

const PREFIX = 'e2e/0a1b2c3d4e5f';

describe('parseStorageE2EKeyPrefix', () => {
  it('is undefined when unset or empty', () => {
    expect(parseStorageE2EKeyPrefix({})).toBeUndefined();
    expect(
      parseStorageE2EKeyPrefix({ STORAGE_E2E_KEY_PREFIX: '' })
    ).toBeUndefined();
  });

  it('accepts exactly e2e/<12 lowercase hex>', () => {
    expect(parseStorageE2EKeyPrefix({ STORAGE_E2E_KEY_PREFIX: PREFIX })).toBe(
      PREFIX
    );
  });

  it.each([
    'e2e',
    'e2e/',
    'e2e/0a1b2c3d4e5f/',
    '/e2e/0a1b2c3d4e5f',
    'e2e/0A1B2C3D4E5F',
    'e2e/0a1b2c3d4e5',
    'e2e/0a1b2c3d4e5f0',
    'e2e/../0a1b2c3d4e5f',
    'uploads',
    ' e2e/0a1b2c3d4e5f',
    'E2E/0a1b2c3d4e5f',
    'e2e/0a1b2c3d4e5f/x',
    '   ',
  ])('refuses malformed value %p without echoing it', value => {
    let message = '';
    try {
      parseStorageE2EKeyPrefix({ STORAGE_E2E_KEY_PREFIX: value });
    } catch (error) {
      message = (error as Error).message;
    }
    // Fixed message: the value itself is never echoed.
    expect(message).toBe(
      'STORAGE_E2E_KEY_PREFIX is malformed. Expected exactly "e2e/<12 lowercase hex scope key>".'
    );
  });

  it('refuses a valid prefix on a Vercel production runtime', () => {
    expect(() =>
      parseStorageE2EKeyPrefix({
        STORAGE_E2E_KEY_PREFIX: PREFIX,
        VERCEL_ENV: 'production',
      })
    ).toThrow(/production/);
  });

  it('allows a valid prefix on a non-Vercel or preview runtime', () => {
    expect(
      parseStorageE2EKeyPrefix({
        STORAGE_E2E_KEY_PREFIX: PREFIX,
        VERCEL_ENV: 'preview',
      })
    ).toBe(PREFIX);
  });
});

describe('applyE2EKeyPrefix', () => {
  it('returns the key unchanged when no prefix is set', () => {
    for (const key of ['org/inst/file.png', '/abs', '', 'e2e/x/y']) {
      expect(applyE2EKeyPrefix(undefined, key)).toBe(key);
    }
  });

  it('prefixes a route-built key', () => {
    expect(applyE2EKeyPrefix(PREFIX, 'org/inst/file.png')).toBe(
      `${PREFIX}/org/inst/file.png`
    );
  });

  it('is idempotent for keys already in the namespace', () => {
    const once = applyE2EKeyPrefix(PREFIX, 'org/inst/file.png');
    expect(applyE2EKeyPrefix(PREFIX, once)).toBe(once);
  });

  it("keeps another run's prefix inside this run's namespace", () => {
    expect(applyE2EKeyPrefix(PREFIX, 'e2e/ffffffffffff/org/x.png')).toBe(
      `${PREFIX}/e2e/ffffffffffff/org/x.png`
    );
  });

  it('refuses empty and absolute keys in E2E mode', () => {
    expect(() => applyE2EKeyPrefix(PREFIX, '')).toThrow(/empty or absolute/);
    expect(() => applyE2EKeyPrefix(PREFIX, '/org/x.png')).toThrow(
      /empty or absolute/
    );
  });
});

describe('assertKeyInE2ENamespace', () => {
  it('is a no-op without a prefix', () => {
    expect(() =>
      assertKeyInE2ENamespace(undefined, 'org/inst/file.png')
    ).not.toThrow();
  });

  it('allows keys under <prefix>/', () => {
    expect(() =>
      assertKeyInE2ENamespace(PREFIX, `${PREFIX}/org/inst/file.png`)
    ).not.toThrow();
  });

  it.each([
    'org/inst/file.png',
    'e2e/ffffffffffff/org/file.png',
    `${PREFIX}`,
    `${PREFIX}/`,
    `${PREFIX}0/org/file.png`,
    'e2e/',
    '',
  ])('refuses %p', key => {
    expect(() => assertKeyInE2ENamespace(PREFIX, key)).toThrow(
      /outside this run's E2E storage namespace/
    );
  });
});
