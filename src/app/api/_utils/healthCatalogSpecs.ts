export type HealthCatalogPolicyRow = {
  policyname: string;
  schemaname: string;
  tablename: string;
  qual: string | null;
  with_check: string | null;
};

export type HealthCatalogFunctionRow = {
  proname: string;
  prosrc: string;
};

export type HealthCatalogRuntimeContracts = {
  api_create_idempotency_exists: boolean;
  api_create_idempotency_columns_ok: boolean;
  api_create_idempotency_unique_ok: boolean;
  create_connection_atomic_hardened: boolean;
};

export type HealthCatalogSnapshot = {
  migrationVersions: string[];
  functions: HealthCatalogFunctionRow[];
  policies: HealthCatalogPolicyRow[];
  presentColumns: string[];
  runtimeContracts: HealthCatalogRuntimeContracts | null;
};

type RequiredColumnSpec = {
  schema: 'public';
  table: string;
  column: string;
};

export const HEALTH_REQUIRED_COLUMNS: readonly RequiredColumnSpec[] = [
  { schema: 'public', table: 'invoices', column: 'invoice_number' },
  { schema: 'public', table: 'invoice_settings', column: 'business_name' },
  { schema: 'public', table: 'invoice_settings', column: 'business_address' },
  { schema: 'public', table: 'invoice_settings', column: 'business_phone' },
  { schema: 'public', table: 'invoice_settings', column: 'business_email' },
  {
    schema: 'public',
    table: 'invoice_settings',
    column: 'bank_account_holder',
  },
  { schema: 'public', table: 'invoice_settings', column: 'bank_name' },
  { schema: 'public', table: 'invoice_settings', column: 'bank_swift_code' },
  {
    schema: 'public',
    table: 'invoice_settings',
    column: 'bank_account_number',
  },
  { schema: 'public', table: 'invoice_settings', column: 'default_conditions' },
  {
    schema: 'public',
    table: 'invoice_settings',
    column: 'default_exchange_rate',
  },
  { schema: 'public', table: 'invoice_settings', column: 'default_currency' },
  { schema: 'public', table: 'instrument_images', column: 'storage_key' },
  { schema: 'public', table: 'instrument_images', column: 'file_name' },
  { schema: 'public', table: 'instrument_images', column: 'file_size' },
  { schema: 'public', table: 'instrument_images', column: 'mime_type' },
  { schema: 'public', table: 'instrument_images', column: 'display_order' },
  { schema: 'public', table: 'client_instruments', column: 'display_order' },
  { schema: 'public', table: 'clients', column: 'client_number' },
];

export const RUNTIME_CONTRACT_LABELS = {
  api_create_idempotency_exists: 'public.api_create_idempotency table',
  api_create_idempotency_columns_ok:
    'public.api_create_idempotency required columns',
  api_create_idempotency_unique_ok:
    'public.api_create_idempotency scoped uniqueness',
  create_connection_atomic_hardened:
    'public.create_connection_atomic org-scoped parent checks',
} as const;

type RuntimeContractColumn = keyof typeof RUNTIME_CONTRACT_LABELS;

const RUNTIME_CONTRACT_COLUMNS = Object.keys(
  RUNTIME_CONTRACT_LABELS
) as RuntimeContractColumn[];

function columnKey(spec: RequiredColumnSpec): string {
  return `${spec.schema}.${spec.table}.${spec.column}`;
}

export function getMissingRequiredColumns(
  presentColumns: readonly string[]
): string[] {
  const present = new Set(presentColumns);
  return HEALTH_REQUIRED_COLUMNS.map(columnKey).filter(
    key => !present.has(key)
  );
}

export function getMissingRuntimeContracts(
  runtimeContracts: HealthCatalogRuntimeContracts | null
): string[] {
  if (!runtimeContracts) {
    return RUNTIME_CONTRACT_COLUMNS.map(
      column => RUNTIME_CONTRACT_LABELS[column]
    );
  }

  return RUNTIME_CONTRACT_COLUMNS.filter(
    column => runtimeContracts[column] !== true
  ).map(column => RUNTIME_CONTRACT_LABELS[column]);
}
