#!/usr/bin/env tsx
/**
 * Runs the pinned Supabase CLI reset against the already verified staging
 * database URL.
 *
 * Caller must have passed confirmation, identity, TLS, and the pre-reset
 * probe. This script repeats those gates and refuses to spawn the CLI when
 * any gate fails. It deletes the runner copy of supabase/.temp without
 * reading it, so linked-project metadata cannot select the target.
 *
 * The rewritten database URL is passed as an argv element and is never printed.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';
import type { EnvMap } from './env-guard';
import { prepareStagingDbReset, ResetGateError } from './reset-gates';

export type ResetSpawnResult = { status: number | null };

export type ResetSpawn = (
  command: string,
  args: readonly string[]
) => ResetSpawnResult;

export function isolateLinkedProjectMetadata(repoRoot: string): void {
  const tempDir = path.join(repoRoot, 'supabase', '.temp');
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (fs.existsSync(path.join(tempDir, 'project-ref'))) {
    throw new ResetGateError(
      'BLOCKED_SAFETY_GUARD',
      'Linked project metadata is still present. Refusing to reset.'
    );
  }
}

function defaultSpawn(
  command: string,
  args: readonly string[]
): ResetSpawnResult {
  const childEnv = { ...process.env };
  delete childEnv.SUPABASE_ACCESS_TOKEN;
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: childEnv,
    stdio: 'inherit',
  });
  return { status: result.status };
}

export function executeStagingDbReset(
  env: EnvMap = process.env,
  options: {
    repoRoot?: string;
    spawn?: ResetSpawn;
  } = {}
): void {
  const prepared = prepareStagingDbReset(env);
  const repoRoot = options.repoRoot ?? process.cwd();
  isolateLinkedProjectMetadata(repoRoot);

  const spawn = options.spawn ?? defaultSpawn;
  const result = spawn('supabase', prepared.args);
  if (result.status !== 0) {
    throw new ResetGateError(
      'RESET_COMMAND_FAILED',
      `supabase db reset exited ${result.status ?? 'null'}.`
    );
  }
}

function writeGithubOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile || /[\r\n]/.test(value)) {
    return;
  }
  fs.appendFileSync(outputFile, `${name}=${value}\n`);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  try {
    executeStagingDbReset();
    writeGithubOutput('executed', 'true');
    console.error('Hosted staging database reset command finished.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      error instanceof ResetGateError
        ? error.classification
        : 'RESET_COMMAND_FAILED'
    );
    console.error(message);
    process.exit(1);
  }
}
