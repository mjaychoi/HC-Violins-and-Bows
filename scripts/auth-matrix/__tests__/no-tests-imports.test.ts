/** @jest-environment node */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

const AUTH_MATRIX_DIR = join(process.cwd(), 'scripts/auth-matrix');
const TESTS_DIR = join(process.cwd(), 'tests');

const MODULE_SPECIFIER =
  /\b(?:from|import)\s*(?:\(\s*)?['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function isExecutableSource(relativePosix: string): boolean {
  if (relativePosix.split('/').includes('__tests__')) {
    return false;
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(relativePosix)) {
    return false;
  }
  return /\.[cm]?[jt]sx?$/.test(relativePosix);
}

function collectExecutableScripts(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      if (entry === '__tests__') {
        continue;
      }
      files.push(...collectExecutableScripts(absolute));
      continue;
    }
    const relativePosix = relative(AUTH_MATRIX_DIR, absolute)
      .split(sep)
      .join('/');
    if (isExecutableSource(relativePosix)) {
      files.push(absolute);
    }
  }
  return files;
}

function moduleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of stripComments(source).matchAll(MODULE_SPECIFIER)) {
    const specifier = match[1] ?? match[2];
    if (specifier) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function pointsAtTestsTree(fromFile: string, specifier: string): boolean {
  const normalized = specifier.replace(/\\/g, '/');
  if (
    normalized === 'tests' ||
    normalized.startsWith('tests/') ||
    normalized.includes('/tests/')
  ) {
    return true;
  }
  if (!normalized.startsWith('.')) {
    return false;
  }
  const resolved = resolve(join(fromFile, '..'), normalized);
  return resolved === TESTS_DIR || resolved.startsWith(`${TESTS_DIR}${sep}`);
}

describe('auth-matrix production module boundary', () => {
  it('does not import executable auth-matrix scripts from tests/', () => {
    const files = collectExecutableScripts(AUTH_MATRIX_DIR);
    const offenders = files.flatMap(file =>
      moduleSpecifiers(readFileSync(file, 'utf8'))
        .filter(specifier => pointsAtTestsTree(file, specifier))
        .map(
          specifier =>
            `${relative(process.cwd(), file).split(sep).join('/')} -> ${specifier}`
        )
    );

    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
    expect(
      existsSync(join(TESTS_DIR, 'integration/auth-matrix/env-guard.ts'))
    ).toBe(false);

    for (const entry of [
      'cleanup-fixtures.ts',
      'run-hosted-matrix.ts',
      'hosted-runner.ts',
    ]) {
      expect(
        moduleSpecifiers(readFileSync(join(AUTH_MATRIX_DIR, entry), 'utf8'))
      ).toContain('./env-guard');
    }
  });
});
