/** @jest-environment node */

import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  createEmptyRuntimeManifest,
  parseRuntimeManifest,
  readRuntimeManifestFile,
  resolveRuntimeManifestPath,
  writeRuntimeManifestFile,
} from '../runtime-manifest';

const RUN_ID = 'testrunid0123456789abcd';

describe('runtime manifest', () => {
  it('refuses a malformed manifest', () => {
    expect(() => parseRuntimeManifest(null)).toThrow(/json object/i);
    expect(() => parseRuntimeManifest([])).toThrow(/json object/i);
    expect(() => parseRuntimeManifest({ version: 2, runId: RUN_ID })).toThrow(
      /version/i
    );
    expect(() => parseRuntimeManifest({ version: 1, runId: 'bad id' })).toThrow(
      /runId/i
    );
    expect(() =>
      parseRuntimeManifest({
        version: 1,
        runId: RUN_ID,
        orgIds: ['not-a-uuid'],
      })
    ).toThrow(/uuid/i);
  });

  it('accepts a partial bootstrap manifest', () => {
    const parsed = parseRuntimeManifest({
      version: 1,
      runId: RUN_ID,
      orgIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'],
      instrumentIds: [],
      clientIds: [],
      authUserIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'],
      labels: { orgA: 'AUTH_MATRIX_testrun Org A' },
    });

    expect(parsed.orgIds).toHaveLength(1);
    expect(parsed.instrumentIds).toEqual([]);
    expect(parsed.authUserIds).toHaveLength(1);
  });

  it('rejects secret or token fields if accidentally present', () => {
    const base = createEmptyRuntimeManifest(RUN_ID);

    expect(() => parseRuntimeManifest({ ...base, password: 'secret' })).toThrow(
      /forbidden/i
    );
    expect(() =>
      parseRuntimeManifest({ ...base, access_token: 'tok' })
    ).toThrow(/forbidden/i);
    expect(() =>
      parseRuntimeManifest({ ...base, cookieHeader: 'hcv-sb-auth=nope' })
    ).toThrow(/forbidden/i);
    expect(() =>
      parseRuntimeManifest({
        ...base,
        labels: { session: 'should-not-be-here' },
      })
    ).toThrow(/forbidden/i);
  });

  it('requires AUTH_MATRIX_RUNTIME_MANIFEST for hosted cleanup sharing', () => {
    expect(() => resolveRuntimeManifestPath({})).toThrow(
      /AUTH_MATRIX_RUNTIME_MANIFEST/
    );
    expect(
      resolveRuntimeManifestPath({
        AUTH_MATRIX_RUNTIME_MANIFEST: '/tmp/hc-auth-matrix-runtime.json',
      })
    ).toBe('/tmp/hc-auth-matrix-runtime.json');
  });

  it('writes and reads a non-secret manifest file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'auth-matrix-manifest-'));
    const filePath = join(dir, 'hc-auth-matrix-runtime.json');
    const manifest = createEmptyRuntimeManifest(RUN_ID);
    manifest.orgIds.push('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

    await writeRuntimeManifestFile(filePath, manifest);
    const raw = await readFile(filePath, 'utf8');
    expect(raw).not.toMatch(/password|access_token|refresh_token|Cookie/i);

    const loaded = await readRuntimeManifestFile(filePath);
    expect(loaded?.orgIds).toEqual(manifest.orgIds);
    expect(await readRuntimeManifestFile(join(dir, 'missing.json'))).toBeNull();
  });

  it('refuses a file that later gained secret fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'auth-matrix-manifest-'));
    const filePath = join(dir, 'hc-auth-matrix-runtime.json');
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        runId: RUN_ID,
        refresh_token: 'nope',
      })
    );

    await expect(readRuntimeManifestFile(filePath)).rejects.toThrow(
      /forbidden/i
    );
  });
});
