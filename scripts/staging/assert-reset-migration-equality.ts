#!/usr/bin/env tsx
/**
 * Post-reset exact migration-set gate.
 *
 * remote-only, local-only, and the two counts must all agree. A mismatch
 * exits 1 with RESET_FAILED_POSTFLIGHT. Stdout is one JSON document and
 * never includes a connection string.
 */
import fs from 'fs';
import { pathToFileURL } from 'url';
import {
  assertExactMigrationEquality,
  compareCanonicalMigrationSets,
  readCheckedOutCanonicalMigrations,
} from './reset-gates';
import {
  readRemoteMigrationVersionsReadOnly,
  requireStagingDatabaseUrl,
} from './reset-db-read';

function writeGithubOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile || /[\r\n]/.test(value)) {
    return;
  }
  fs.appendFileSync(outputFile, `${name}=${value}\n`);
}

async function main(): Promise<void> {
  const databaseUrl = requireStagingDatabaseUrl(
    process.env.STAGING_DATABASE_URL
  );
  const local = readCheckedOutCanonicalMigrations();
  const remote = await readRemoteMigrationVersionsReadOnly(databaseUrl);
  const comparison = compareCanonicalMigrationSets(local.versions, remote);

  writeGithubOutput('local_count', String(comparison.localMigrationCount));
  writeGithubOutput('remote_count', String(comparison.remoteMigrationCount));
  writeGithubOutput('remote_only', String(comparison.remoteOnlyCount));
  writeGithubOutput('local_only', String(comparison.localOnlyCount));
  process.stdout.write(`${JSON.stringify(comparison)}\n`);

  assertExactMigrationEquality(comparison);
  console.error('Post-reset canonical migration set matches exactly.');
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
