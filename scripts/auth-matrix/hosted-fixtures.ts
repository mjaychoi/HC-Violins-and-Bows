import { randomBytes, randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE,
  AUTH_MATRIX_ORG_A_COST_PRICE,
  AUTH_MATRIX_ORG_B_CONSIGNMENT_PRICE,
  AUTH_MATRIX_ORG_B_COST_PRICE,
  type AuthMatrixActor,
  type AuthMatrixRole,
} from './constants';
import type { RuntimeFixtureManifest } from './runtime-manifest';
import { createEmptyRuntimeManifest } from './runtime-manifest';

export type HostedRuntimeIds = {
  runId: string;
  orgAId: string;
  orgBId: string;
  orgASerial: string;
  orgBSerial: string;
  orgAClientNumber: string;
  orgBClientNumber: string;
  orgAName: string;
  orgBName: string;
  emails: Record<AuthMatrixActor, string>;
};

export type HostedSyntheticUser = {
  label: AuthMatrixActor;
  userId: string;
  orgId: string;
  role: AuthMatrixRole;
  email: string;
  password: string;
};

export type HostedFixtureSet = {
  runId: string;
  orgAId: string;
  orgBId: string;
  orgAInstrumentId: string;
  orgBInstrumentId: string;
  orgAClientId: string;
  orgBClientId: string;
  orgASerial: string;
  orgBSerial: string;
  orgACostPrice: number;
  orgAConsignmentPrice: number;
  orgBCostPrice: number;
  orgBConsignmentPrice: number;
  users: HostedSyntheticUser[];
  manifest: RuntimeFixtureManifest;
};

function throwIfError(error: { message: string } | null, action: string): void {
  if (error) {
    throw new Error(`${action}: ${error.message}`);
  }
}

export function generateAuthMatrixPassword(): string {
  return randomBytes(24).toString('base64url');
}

export function createHostedRunId(
  generateId: () => string = randomUUID
): string {
  return generateId().replace(/-/g, '').slice(0, 24);
}

export function createHostedRuntimeIds(
  runId: string,
  generateId: () => string = randomUUID
): HostedRuntimeIds {
  const prefix = `AUTH_MATRIX_${runId}`;
  return {
    runId,
    orgAId: generateId(),
    orgBId: generateId(),
    orgASerial: `${prefix}_A`,
    orgBSerial: `${prefix}_B`,
    orgAClientNumber: `AM${runId.slice(0, 8)}A`,
    orgBClientNumber: `AM${runId.slice(0, 8)}B`,
    orgAName: `${prefix} Org A`,
    orgBName: `${prefix} Org B`,
    emails: {
      orgAAdmin: `auth-matrix-${runId}-org-a-admin@example.test`,
      orgAMember: `auth-matrix-${runId}-org-a-member@example.test`,
      orgBAdmin: `auth-matrix-${runId}-org-b-admin@example.test`,
      orgBMember: `auth-matrix-${runId}-org-b-member@example.test`,
    },
  };
}

function recordId(
  list: string[],
  id: string,
  persist: (manifest: RuntimeFixtureManifest) => Promise<void>,
  manifest: RuntimeFixtureManifest
): Promise<void> {
  list.push(id);
  return persist(manifest);
}

export async function bootstrapHostedFixtures(options: {
  admin: SupabaseClient;
  runId?: string;
  generateId?: () => string;
  generatePassword?: () => string;
  persistManifest: (manifest: RuntimeFixtureManifest) => Promise<void>;
}): Promise<HostedFixtureSet> {
  const generateId = options.generateId ?? randomUUID;
  const generatePassword =
    options.generatePassword ?? generateAuthMatrixPassword;
  const runId = options.runId ?? createHostedRunId(generateId);
  const ids = createHostedRuntimeIds(runId, generateId);
  const manifest = createEmptyRuntimeManifest(runId);
  manifest.labels = {
    orgA: ids.orgAName,
    orgB: ids.orgBName,
    orgASerial: ids.orgASerial,
    orgBSerial: ids.orgBSerial,
  };
  await options.persistManifest(manifest);

  async function insertOrg(id: string, name: string): Promise<void> {
    const { error } = await options.admin
      .from('organizations')
      .insert({ id, name });
    throwIfError(error, 'Create auth-matrix organization');
    await recordId(manifest.orgIds, id, options.persistManifest, manifest);
  }

  async function insertInstrument(row: {
    org_id: string;
    maker: string;
    serial_number: string;
    cost_price: number;
    consignment_price: number;
  }): Promise<string> {
    const { data, error } = await options.admin
      .from('instruments')
      .insert({
        ...row,
        type: 'Violin',
        status: 'Available',
        certificate: false,
      })
      .select('id')
      .single();
    throwIfError(error, 'Create auth-matrix instrument');
    if (!data?.id) {
      throw new Error('Auth-matrix instrument bootstrap returned no id.');
    }
    await recordId(
      manifest.instrumentIds,
      data.id,
      options.persistManifest,
      manifest
    );
    return data.id;
  }

  async function insertClient(row: {
    org_id: string;
    first_name: string;
    last_name: string;
    name: string;
    client_number: string;
  }): Promise<string> {
    const { data, error } = await options.admin
      .from('clients')
      .insert(row)
      .select('id')
      .single();
    throwIfError(error, 'Create auth-matrix client');
    if (!data?.id) {
      throw new Error('Auth-matrix client bootstrap returned no id.');
    }
    await recordId(
      manifest.clientIds,
      data.id,
      options.persistManifest,
      manifest
    );
    return data.id;
  }

  await insertOrg(ids.orgAId, ids.orgAName);
  await insertOrg(ids.orgBId, ids.orgBName);

  const orgAInstrumentId = await insertInstrument({
    org_id: ids.orgAId,
    maker: ids.orgAName,
    serial_number: ids.orgASerial,
    cost_price: AUTH_MATRIX_ORG_A_COST_PRICE,
    consignment_price: AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE,
  });
  const orgBInstrumentId = await insertInstrument({
    org_id: ids.orgBId,
    maker: ids.orgBName,
    serial_number: ids.orgBSerial,
    cost_price: AUTH_MATRIX_ORG_B_COST_PRICE,
    consignment_price: AUTH_MATRIX_ORG_B_CONSIGNMENT_PRICE,
  });

  const orgAClientId = await insertClient({
    org_id: ids.orgAId,
    first_name: 'OrgA',
    last_name: 'Client',
    name: `${ids.orgAName} Client`,
    client_number: ids.orgAClientNumber,
  });
  const orgBClientId = await insertClient({
    org_id: ids.orgBId,
    first_name: 'OrgB',
    last_name: 'Client',
    name: `${ids.orgBName} Client`,
    client_number: ids.orgBClientNumber,
  });

  const userSpecs: Array<{
    label: AuthMatrixActor;
    orgId: string;
    role: AuthMatrixRole;
    email: string;
  }> = [
    {
      label: 'orgAAdmin',
      orgId: ids.orgAId,
      role: 'admin',
      email: ids.emails.orgAAdmin,
    },
    {
      label: 'orgAMember',
      orgId: ids.orgAId,
      role: 'member',
      email: ids.emails.orgAMember,
    },
    {
      label: 'orgBAdmin',
      orgId: ids.orgBId,
      role: 'admin',
      email: ids.emails.orgBAdmin,
    },
    {
      label: 'orgBMember',
      orgId: ids.orgBId,
      role: 'member',
      email: ids.emails.orgBMember,
    },
  ];

  const users: HostedSyntheticUser[] = [];

  for (const spec of userSpecs) {
    const password = generatePassword();
    const { data, error } = await options.admin.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      app_metadata: { org_id: spec.orgId, role: spec.role },
    });
    throwIfError(error, `Create auth-matrix user ${spec.label}`);
    const userId = data.user?.id;
    if (!userId) {
      throw new Error(`Create auth-matrix user ${spec.label} returned no id.`);
    }
    await recordId(
      manifest.authUserIds,
      userId,
      options.persistManifest,
      manifest
    );
    users.push({
      label: spec.label,
      userId,
      orgId: spec.orgId,
      role: spec.role,
      email: spec.email,
      password,
    });
  }

  return {
    runId,
    orgAId: ids.orgAId,
    orgBId: ids.orgBId,
    orgAInstrumentId,
    orgBInstrumentId,
    orgAClientId,
    orgBClientId,
    orgASerial: ids.orgASerial,
    orgBSerial: ids.orgBSerial,
    orgACostPrice: AUTH_MATRIX_ORG_A_COST_PRICE,
    orgAConsignmentPrice: AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE,
    orgBCostPrice: AUTH_MATRIX_ORG_B_COST_PRICE,
    orgBConsignmentPrice: AUTH_MATRIX_ORG_B_CONSIGNMENT_PRICE,
    users,
    manifest,
  };
}
