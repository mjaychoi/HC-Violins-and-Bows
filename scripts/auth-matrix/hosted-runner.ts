import type { SupabaseClient } from '@supabase/supabase-js';

import type { AuthMatrixEnvironment } from '../../tests/integration/auth-matrix/env-guard';
import {
  AUTH_MATRIX_ACTORS,
  actorDisplayLabel,
  type AuthMatrixActor,
} from './constants';
import { executeHostedCleanup } from './hosted-cleanup';
import { bootstrapHostedFixtures, createHostedRunId } from './hosted-fixtures';
import {
  formatMatrixFailure,
  runHostedCookieMatrix,
  type HostedCookieJar,
} from './hosted-matrix';
import type { HostedActor } from './hosted-session';
import { mintHostedActorSession } from './hosted-session';
import type { RuntimeFixtureManifest } from './runtime-manifest';
import {
  createEmptyRuntimeManifest,
  writeRuntimeManifestFile,
} from './runtime-manifest';

export type HostedRunnerDeps = {
  env: AuthMatrixEnvironment;
  admin: SupabaseClient;
  manifestPath: string;
  fetchImpl?: typeof fetch;
  generateId?: () => string;
  generatePassword?: () => string;
  mintSession?: typeof mintHostedActorSession;
  cleanup?: typeof executeHostedCleanup;
};

export type HostedRunnerResult = {
  runId: string;
  passed: number;
  failed: number;
  cleanupRan: boolean;
  manifestPath: string;
};

export async function runHostedCookieAuthMatrix(
  deps: HostedRunnerDeps
): Promise<HostedRunnerResult> {
  const mintSession = deps.mintSession ?? mintHostedActorSession;
  const cleanup = deps.cleanup ?? executeHostedCleanup;
  let manifest = createEmptyRuntimeManifest(createHostedRunId(deps.generateId));
  let passed = 0;
  let failed = 0;
  let runError: unknown;
  let cleanupRan = false;

  const persist = async (next: RuntimeFixtureManifest) => {
    manifest = next;
    await writeRuntimeManifestFile(deps.manifestPath, next);
  };

  await persist(manifest);

  try {
    const fixtures = await bootstrapHostedFixtures({
      admin: deps.admin,
      runId: manifest.runId,
      generateId: deps.generateId,
      generatePassword: deps.generatePassword,
      persistManifest: persist,
    });
    manifest = fixtures.manifest;

    const actors = {} as HostedCookieJar;

    try {
      for (const user of fixtures.users) {
        const cookieHeader = await mintSession({
          supabaseUrl: deps.env.supabaseUrl,
          anonKey: deps.env.supabaseAnonKey,
          email: user.email,
          password: user.password,
          expectedUserId: user.userId,
          expectedProjectRef: deps.env.projectRef,
          productionProjectRef: deps.env.productionProjectRef,
          actorLabel: user.label,
        });
        user.password = '';
        const actor: HostedActor = {
          userId: user.userId,
          orgId: user.orgId,
          role: user.role,
          label: user.label,
          cookieHeader,
        };
        actors[user.label] = actor;
      }
    } finally {
      for (const user of fixtures.users) {
        user.password = '';
      }
    }

    for (const label of AUTH_MATRIX_ACTORS) {
      if (!actors[label as AuthMatrixActor]?.cookieHeader) {
        throw new Error(
          `Missing cookie-backed session for ${actorDisplayLabel(label)}.`
        );
      }
    }

    const results = await runHostedCookieMatrix({
      baseUrl: deps.env.baseUrl,
      actors,
      fixtures: {
        orgAId: fixtures.orgAId,
        orgBId: fixtures.orgBId,
        orgAInstrumentId: fixtures.orgAInstrumentId,
        orgBInstrumentId: fixtures.orgBInstrumentId,
        orgAClientId: fixtures.orgAClientId,
        orgBClientId: fixtures.orgBClientId,
        orgACostPrice: fixtures.orgACostPrice,
        orgAConsignmentPrice: fixtures.orgAConsignmentPrice,
      },
      fetchImpl: deps.fetchImpl,
    });

    const failedResults = results.filter(result => !result.ok);
    passed = results.length - failedResults.length;
    failed = failedResults.length;

    for (const result of results) {
      const mark = result.ok ? 'ok' : 'FAIL';
      console.log(
        `[${mark}] ${result.name} (${formatMatrixFailure(result.report)})`
      );
    }

    if (failedResults.length > 0) {
      throw new Error(
        `Cookie-backed auth matrix failed ${failedResults.length}/${results.length} case(s): ${failedResults
          .map(result => formatMatrixFailure(result.report))
          .join(' | ')}`
      );
    }
  } catch (error) {
    runError = error;
  } finally {
    try {
      await cleanup(deps.admin, manifest);
      cleanupRan = true;
    } catch (cleanupError) {
      cleanupRan = true;
      const message =
        cleanupError instanceof Error
          ? cleanupError.message
          : 'Auth matrix cleanup failed after hosted run.';
      console.error(message);
      if (!runError) {
        runError = cleanupError;
      }
    }
  }

  if (runError) {
    throw runError;
  }

  return {
    runId: manifest.runId,
    passed,
    failed,
    cleanupRan,
    manifestPath: deps.manifestPath,
  };
}
