import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { AuthMatrixActor, AuthMatrixRole } from '../auth-matrix/constants';
import {
  createHostedRunId,
  generateAuthMatrixPassword,
} from '../auth-matrix/hosted-fixtures';
import type { RuntimeFixtureManifest } from '../auth-matrix/runtime-manifest';
import { createEmptyRuntimeManifest } from '../auth-matrix/runtime-manifest';
import {
  EXPORT_E2E_DROP_SALE_DATE,
  EXPORT_E2E_DROP_SALE_PRICE,
  EXPORT_E2E_ITEM_CONSIGNMENT_PRICE,
  EXPORT_E2E_ITEM_COST_PRICE,
  EXPORT_E2E_ITEM_RETAIL_PRICE,
  EXPORT_E2E_KEEP_SALE_DATE,
  EXPORT_E2E_KEEP_SALE_PRICE,
  EXPORT_E2E_ORG_B_ITEM_CONSIGNMENT_PRICE,
  EXPORT_E2E_ORG_B_ITEM_COST_PRICE,
  EXPORT_E2E_ORG_B_ITEM_RETAIL_PRICE,
  EXPORT_E2E_ORG_B_SALE_PRICE,
  createExportFixtureMarkers,
  type ExportFixtureMarkers,
} from './constants';

export type ExportSyntheticUser = {
  label: AuthMatrixActor;
  userId: string;
  orgId: string;
  role: AuthMatrixRole;
  email: string;
  password: string;
};

export type ExportFixtureSet = {
  runId: string;
  markers: ExportFixtureMarkers;
  orgAId: string;
  orgBId: string;
  orgAAdminUserId: string;
  orgBAdminUserId: string;
  keepInstrumentId: string;
  dropInstrumentId: string;
  orgBInstrumentId: string;
  orgAClientId: string;
  orgBClientId: string;
  keepConnectionId: string;
  keepSaleId: string;
  dropSaleId: string;
  orgBSaleId: string;
  users: ExportSyntheticUser[];
  manifest: RuntimeFixtureManifest;
};

function throwIfError(error: { message: string } | null, action: string): void {
  if (error) {
    throw new Error(`${action}: ${error.message}`);
  }
}

async function recordId(
  list: string[],
  id: string,
  persist: (manifest: RuntimeFixtureManifest) => Promise<void>,
  manifest: RuntimeFixtureManifest
): Promise<void> {
  list.push(id);
  await persist(manifest);
}

export async function bootstrapExportFixtures(options: {
  admin: SupabaseClient;
  runId?: string;
  generateId?: () => string;
  generatePassword?: () => string;
  persistManifest: (manifest: RuntimeFixtureManifest) => Promise<void>;
}): Promise<ExportFixtureSet> {
  const generateId = options.generateId ?? randomUUID;
  const generatePassword =
    options.generatePassword ?? generateAuthMatrixPassword;
  const runId = options.runId ?? createHostedRunId(generateId);
  const markers = createExportFixtureMarkers(runId);
  const manifest = createEmptyRuntimeManifest(runId);
  const orgAId = generateId();
  const orgBId = generateId();
  manifest.labels = {
    orgA: `EXPORT_E2E_${runId} Org A`,
    orgB: `EXPORT_E2E_${runId} Org B`,
    keepSerial: markers.keepSerial,
    dropSerial: markers.dropSerial,
    orgBSerial: markers.orgBSerial,
  };
  await options.persistManifest(manifest);

  async function insertOrg(id: string, name: string): Promise<void> {
    const { error } = await options.admin
      .from('organizations')
      .insert({ id, name });
    throwIfError(error, 'Create export-e2e organization');
    await recordId(manifest.orgIds, id, options.persistManifest, manifest);
  }

  await insertOrg(orgAId, manifest.labels.orgA ?? '');
  await insertOrg(orgBId, manifest.labels.orgB ?? '');

  const userSpecs: Array<{
    label: AuthMatrixActor;
    orgId: string;
    role: AuthMatrixRole;
    email: string;
  }> = [
    {
      label: 'orgAAdmin',
      orgId: orgAId,
      role: 'admin',
      email: `export-e2e-${runId}-org-a-admin@example.test`,
    },
    {
      label: 'orgAMember',
      orgId: orgAId,
      role: 'member',
      email: `export-e2e-${runId}-org-a-member@example.test`,
    },
    {
      label: 'orgBAdmin',
      orgId: orgBId,
      role: 'admin',
      email: `export-e2e-${runId}-org-b-admin@example.test`,
    },
    {
      label: 'orgBMember',
      orgId: orgBId,
      role: 'member',
      email: `export-e2e-${runId}-org-b-member@example.test`,
    },
  ];

  const users: ExportSyntheticUser[] = [];
  for (const spec of userSpecs) {
    const password = generatePassword();
    const { data, error } = await options.admin.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      app_metadata: { org_id: spec.orgId, role: spec.role },
    });
    throwIfError(error, `Create export-e2e user ${spec.label}`);
    const userId = data.user?.id;
    if (!userId) {
      throw new Error(`Create export-e2e user ${spec.label} returned no id.`);
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

  const orgAAdminUserId = users.find(
    user => user.label === 'orgAAdmin'
  )?.userId;
  const orgBAdminUserId = users.find(
    user => user.label === 'orgBAdmin'
  )?.userId;
  if (!orgAAdminUserId || !orgBAdminUserId) {
    throw new Error('Export E2E admin users were not created.');
  }

  async function insertInstrument(row: {
    org_id: string;
    maker: string;
    type: string;
    serial_number: string;
    status: string;
    year: number;
    price: number;
    cost_price: number;
    consignment_price: number;
    note: string;
    certificate?: boolean;
    certificate_name?: string;
  }): Promise<string> {
    const { data, error } = await options.admin
      .from('instruments')
      .insert({
        ...row,
        certificate: row.certificate ?? false,
      })
      .select('id')
      .single();
    throwIfError(error, 'Create export-e2e instrument');
    if (!data?.id) {
      throw new Error('Export E2E instrument bootstrap returned no id.');
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
    email: string;
    client_number: string;
  }): Promise<string> {
    const { data, error } = await options.admin
      .from('clients')
      .insert({
        ...row,
        name: `${row.first_name} ${row.last_name}`,
      })
      .select('id')
      .single();
    throwIfError(error, 'Create export-e2e client');
    if (!data?.id) {
      throw new Error('Export E2E client bootstrap returned no id.');
    }
    await recordId(
      manifest.clientIds,
      data.id,
      options.persistManifest,
      manifest
    );
    return data.id;
  }

  const keepInstrumentId = await insertInstrument({
    org_id: orgAId,
    maker: markers.keepMaker,
    type: markers.keepType,
    serial_number: markers.keepSerial,
    status: 'Available',
    year: 1721,
    price: EXPORT_E2E_ITEM_RETAIL_PRICE,
    cost_price: EXPORT_E2E_ITEM_COST_PRICE,
    consignment_price: EXPORT_E2E_ITEM_CONSIGNMENT_PRICE,
    note: markers.keepNote,
    certificate: true,
    certificate_name: markers.certificateName,
  });
  const dropInstrumentId = await insertInstrument({
    org_id: orgAId,
    maker: markers.dropMaker,
    type: 'Viola',
    serial_number: markers.dropSerial,
    status: 'Sold',
    year: 1801,
    price: 111.11,
    cost_price: EXPORT_E2E_ITEM_COST_PRICE,
    consignment_price: EXPORT_E2E_ITEM_CONSIGNMENT_PRICE,
    note: markers.dropItemNote,
  });
  const orgBInstrumentId = await insertInstrument({
    org_id: orgBId,
    maker: markers.orgBMaker,
    type: 'Cello',
    serial_number: markers.orgBSerial,
    status: 'Available',
    year: 1901,
    price: EXPORT_E2E_ORG_B_ITEM_RETAIL_PRICE,
    cost_price: EXPORT_E2E_ORG_B_ITEM_COST_PRICE,
    consignment_price: EXPORT_E2E_ORG_B_ITEM_CONSIGNMENT_PRICE,
    note: markers.orgBItemNote,
  });

  const orgAClientId = await insertClient({
    org_id: orgAId,
    first_name: 'Export',
    last_name: 'KeepA',
    email: markers.orgAClientEmail,
    client_number: `EX${runId.slice(0, 8)}A`,
  });
  const orgBClientId = await insertClient({
    org_id: orgBId,
    first_name: 'Export',
    last_name: 'KeepB',
    email: markers.orgBClientEmail,
    client_number: `EX${runId.slice(0, 8)}B`,
  });

  const { data: connection, error: connectionError } = await options.admin
    .from('client_instruments')
    .insert({
      org_id: orgAId,
      client_id: orgAClientId,
      instrument_id: keepInstrumentId,
      relationship_type: 'Interested',
      notes: `EXPORT_E2E_${runId}`,
    })
    .select('id')
    .single();
  throwIfError(connectionError, 'Create export-e2e connection');
  if (!connection?.id) {
    throw new Error('Export E2E connection bootstrap returned no id.');
  }

  const { error: reservedError } = await options.admin
    .from('instruments')
    .update({
      reserved_by_user_id: orgAAdminUserId,
      reserved_connection_id: connection.id,
    })
    .eq('id', keepInstrumentId);
  throwIfError(reservedError, 'Set export-e2e reserved fields');

  async function insertSale(row: {
    org_id: string;
    instrument_id: string;
    client_id: string;
    sale_price: number;
    sale_date: string;
    notes: string;
  }): Promise<string> {
    const { data, error } = await options.admin
      .from('sales_history')
      .insert({ ...row, entry_kind: 'sale' })
      .select('id')
      .single();
    throwIfError(error, 'Create export-e2e sale');
    if (!data?.id) {
      throw new Error('Export E2E sale bootstrap returned no id.');
    }
    return data.id;
  }

  const keepSaleId = await insertSale({
    org_id: orgAId,
    instrument_id: keepInstrumentId,
    client_id: orgAClientId,
    sale_price: EXPORT_E2E_KEEP_SALE_PRICE,
    sale_date: EXPORT_E2E_KEEP_SALE_DATE,
    notes: markers.keepSaleNote,
  });
  const dropSaleId = await insertSale({
    org_id: orgAId,
    instrument_id: dropInstrumentId,
    client_id: orgAClientId,
    sale_price: EXPORT_E2E_DROP_SALE_PRICE,
    sale_date: EXPORT_E2E_DROP_SALE_DATE,
    notes: markers.dropSaleNote,
  });
  const orgBSaleId = await insertSale({
    org_id: orgBId,
    instrument_id: orgBInstrumentId,
    client_id: orgBClientId,
    sale_price: EXPORT_E2E_ORG_B_SALE_PRICE,
    sale_date: EXPORT_E2E_KEEP_SALE_DATE,
    notes: markers.orgBSaleNote,
  });

  return {
    runId,
    markers,
    orgAId,
    orgBId,
    orgAAdminUserId,
    orgBAdminUserId,
    keepInstrumentId,
    dropInstrumentId,
    orgBInstrumentId,
    orgAClientId,
    orgBClientId,
    keepConnectionId: connection.id,
    keepSaleId,
    dropSaleId,
    orgBSaleId,
    users,
    manifest,
  };
}
