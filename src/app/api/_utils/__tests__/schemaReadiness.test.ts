import {
  __resetSchemaReadinessCacheForTests,
  assertClientConnectionsSchemaReadiness,
  assertClientRpcSchemaReadiness,
  assertClientsSchemaReadiness,
  assertInstrumentImagesSchemaReadiness,
  assertInstrumentsSchemaReadiness,
  assertSchemaReadiness,
  checkSchemaReadiness,
  SchemaCheckFailedError,
  SchemaNotReadyError,
} from '../schemaReadiness';

jest.mock('@/utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logDebug: jest.fn(),
}));

describe('schemaReadiness', () => {
  beforeEach(() => {
    __resetSchemaReadinessCacheForTests();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const allRuntimeContractDefaults = {
    api_create_idempotency_exists: true,
    api_create_idempotency_columns_ok: true,
    api_create_idempotency_unique_ok: true,
    create_connection_atomic_hardened: true,
    instrument_type_nullable: true,
    instrument_identity_check_exists: true,
    instrument_certificate_name_check_exists: true,
    client_identity_columns_exist: true,
    client_identity_check_exists: true,
    client_rpc_5_arg_exists: true,
    client_rpc_6_arg_exists: true,
    client_rpc_10_arg_exists: true,
    client_rpc_all_security_invoker: true,
    client_rpc_authenticated_execute: true,
    client_rpc_anon_execute_revoked: true,
  };

  function createSupabaseMock(
    errorsByTable: Record<string, unknown> = {},
    runtimeContracts: Record<string, boolean> = allRuntimeContractDefaults
  ) {
    const selections: Record<string, string> = {};
    const supabase = {
      from: jest.fn((table: string) => ({
        select: jest.fn((columns: string) => {
          selections[table] = columns;
          return {
            limit: jest.fn().mockResolvedValue({
              data:
                table === 'runtime_contract_checks'
                  ? [runtimeContracts]
                  : undefined,
              error: errorsByTable[table] ?? null,
            }),
          };
        }),
      })),
    };

    return { supabase, selections };
  }

  it('checks required columns for all high-risk API tables', async () => {
    const { supabase, selections } = createSupabaseMock();

    const result = await checkSchemaReadiness({
      bypassCache: true,
      supabase,
    });

    expect(result.ready).toBe(true);
    expect(selections.instruments).toBe('certificate_name');
    expect(selections.clients).toBe('client_number,first_name,last_name');
    expect(selections.runtime_contract_checks).toContain(
      'instrument_type_nullable'
    );
    expect(selections.runtime_contract_checks).toContain(
      'client_rpc_10_arg_exists'
    );
  });

  it('reports certificate_name missing as SCHEMA_OUT_OF_DATE', async () => {
    const { supabase } = createSupabaseMock({
      instruments: {
        code: 'PGRST204',
        message:
          "Could not find the 'certificate_name' column of 'instruments' in the schema cache",
      },
    });

    await expect(
      assertInstrumentsSchemaReadiness({ bypassCache: true, supabase })
    ).rejects.toMatchObject({
      code: 'SCHEMA_OUT_OF_DATE',
      status: 503,
      retryable: false,
      details: {
        missingColumns: ['public.instruments.certificate_name'],
      },
    });
  });

  it('reports first_name and last_name missing for client flows', async () => {
    const { supabase } = createSupabaseMock({
      clients: {
        code: '42703',
        message: 'column clients.first_name does not exist',
      },
    });

    await expect(
      assertClientsSchemaReadiness({ bypassCache: true, supabase })
    ).rejects.toMatchObject({
      code: 'SCHEMA_OUT_OF_DATE',
      details: {
        missingColumns: expect.arrayContaining([
          'public.clients.client_number',
          'public.clients.first_name',
          'public.clients.last_name',
        ]),
      },
    });
  });

  it('reports instrument type still NOT NULL via runtime contract drift', async () => {
    const { supabase } = createSupabaseMock(
      {},
      {
        ...allRuntimeContractDefaults,
        instrument_type_nullable: false,
      }
    );

    await expect(
      assertInstrumentsSchemaReadiness({ bypassCache: true, supabase })
    ).rejects.toMatchObject({
      code: 'SCHEMA_OUT_OF_DATE',
      details: {
        missingContracts: ['public.instruments.type nullable contract'],
      },
    });
  });

  it('reports missing 5-arg and 10-arg client RPC overloads', async () => {
    const { supabase } = createSupabaseMock(
      {},
      {
        ...allRuntimeContractDefaults,
        client_rpc_5_arg_exists: false,
        client_rpc_10_arg_exists: false,
      }
    );

    await expect(
      assertClientRpcSchemaReadiness({ bypassCache: true, supabase })
    ).rejects.toMatchObject({
      code: 'SCHEMA_OUT_OF_DATE',
      details: {
        missingContracts: expect.arrayContaining([
          'public.create_client_with_connections_atomic 5-arg overload',
          'public.create_client_with_connections_atomic 10-arg overload',
        ]),
      },
    });
  });

  it('reports SECURITY DEFINER client RPC as schema drift', async () => {
    const { supabase } = createSupabaseMock(
      {},
      {
        ...allRuntimeContractDefaults,
        client_rpc_all_security_invoker: false,
      }
    );

    await expect(
      assertClientRpcSchemaReadiness({ bypassCache: true, supabase })
    ).rejects.toMatchObject({
      details: {
        missingContracts: [
          'public.create_client_with_connections_atomic SECURITY INVOKER overloads',
        ],
      },
    });
  });

  it('reports missing authenticated EXECUTE grant as schema drift', async () => {
    const { supabase } = createSupabaseMock(
      {},
      {
        ...allRuntimeContractDefaults,
        client_rpc_authenticated_execute: false,
      }
    );

    await expect(
      assertClientRpcSchemaReadiness({ bypassCache: true, supabase })
    ).rejects.toMatchObject({
      details: {
        missingContracts: [
          'public.create_client_with_connections_atomic authenticated EXECUTE grants',
        ],
      },
    });
  });

  it('reports anon EXECUTE present as schema drift', async () => {
    const { supabase } = createSupabaseMock(
      {},
      {
        ...allRuntimeContractDefaults,
        client_rpc_anon_execute_revoked: false,
      }
    );

    await expect(
      assertClientRpcSchemaReadiness({ bypassCache: true, supabase })
    ).rejects.toMatchObject({
      details: {
        missingContracts: [
          'public.create_client_with_connections_atomic anon EXECUTE revocation',
        ],
      },
    });
  });

  it('allows routes to proceed when all item/client contracts are present', async () => {
    const { supabase } = createSupabaseMock();

    await expect(
      assertInstrumentsSchemaReadiness({ bypassCache: true, supabase })
    ).resolves.toMatchObject({ ready: true });

    await expect(
      assertClientsSchemaReadiness({ bypassCache: true, supabase })
    ).resolves.toMatchObject({ ready: true });

    await expect(
      assertClientRpcSchemaReadiness({ bypassCache: true, supabase })
    ).resolves.toMatchObject({ ready: true });
  });

  it('fails closed on unexpected catalog errors as SCHEMA_CHECK_FAILED', async () => {
    const { supabase } = createSupabaseMock({
      runtime_contract_checks: {
        code: 'XX000',
        message: 'unexpected catalog failure',
      },
    });

    const result = await checkSchemaReadiness({
      bypassCache: true,
      supabase,
      tables: ['instruments'],
      runtimeContracts: {
        instrument_type_nullable: 'public.instruments.type nullable contract',
      },
      includeRuntimeContracts: false,
    });

    expect(result.ready).toBe(false);
    expect(result.checkFailed).toBe(true);
    expect(result.missingContracts).toEqual([
      'public.instruments.type nullable contract',
    ]);

    await expect(
      assertSchemaReadiness({
        bypassCache: true,
        supabase,
        tables: ['instruments'],
        runtimeContracts: {
          instrument_type_nullable: 'public.instruments.type nullable contract',
        },
        includeRuntimeContracts: false,
      })
    ).rejects.toMatchObject({
      code: 'SCHEMA_CHECK_FAILED',
      retryable: true,
      name: 'SchemaCheckFailedError',
    });
  });

  it('columns-only transient errors do not report unrelated runtime contracts', async () => {
    const { supabase } = createSupabaseMock({
      instrument_images: {
        code: '57014',
        message: 'canceling statement due to statement timeout',
      },
    });

    const result = await checkSchemaReadiness({
      bypassCache: true,
      supabase,
      tables: ['instrument_images'],
      runtimeContracts: null,
      includeRuntimeContracts: false,
    });

    expect(result.ready).toBe(false);
    expect(result.checkFailed).toBe(true);
    expect(result.missingColumns).toEqual([
      'public.instrument_images.storage_key',
      'public.instrument_images.file_name',
      'public.instrument_images.file_size',
      'public.instrument_images.mime_type',
      'public.instrument_images.display_order',
    ]);
    expect(result.missingContracts).toEqual([]);
  });

  it('does not treat permission denied for relation as schema drift', async () => {
    const { supabase } = createSupabaseMock({
      instruments: {
        code: '42501',
        message: 'permission denied for relation instruments',
      },
    });

    const result = await checkSchemaReadiness({
      bypassCache: true,
      supabase,
      tables: ['instruments'],
      runtimeContracts: null,
      includeRuntimeContracts: false,
    });

    expect(result.checkFailed).toBe(true);
    expect(result.ready).toBe(false);

    await expect(
      assertInstrumentsSchemaReadiness({ bypassCache: true, supabase })
    ).rejects.toBeInstanceOf(SchemaCheckFailedError);
  });

  it('recovers after stale negative cache TTL expires', async () => {
    jest.useFakeTimers();

    const failing = createSupabaseMock({
      instruments: {
        code: 'PGRST204',
        message: "Could not find the 'certificate_name' column",
      },
    });

    const first = await checkSchemaReadiness({
      supabase: failing.supabase,
      tables: ['instruments'],
      runtimeContracts: null,
      includeRuntimeContracts: false,
    });
    expect(first.ready).toBe(false);
    expect(first.checkFailed).toBeFalsy();

    const succeeding = createSupabaseMock();

    // Within TTL: stale failure is served from cache.
    const cached = await checkSchemaReadiness({
      supabase: succeeding.supabase,
      tables: ['instruments'],
      runtimeContracts: null,
      includeRuntimeContracts: false,
    });
    expect(cached.ready).toBe(false);
    expect(succeeding.supabase.from).not.toHaveBeenCalled();

    jest.advanceTimersByTime(30_001);

    const recovered = await checkSchemaReadiness({
      supabase: succeeding.supabase,
      tables: ['instruments'],
      runtimeContracts: null,
      includeRuntimeContracts: false,
    });
    expect(recovered.ready).toBe(true);
    expect(succeeding.supabase.from).toHaveBeenCalled();
  });

  it('does not cache infrastructure check failures across retries', async () => {
    const transient = createSupabaseMock({
      instruments: {
        code: '57014',
        message: 'canceling statement due to statement timeout',
      },
    });

    const first = await checkSchemaReadiness({
      supabase: transient.supabase,
      tables: ['instruments'],
      runtimeContracts: null,
      includeRuntimeContracts: false,
    });
    expect(first.checkFailed).toBe(true);

    const succeeding = createSupabaseMock();
    const second = await checkSchemaReadiness({
      supabase: succeeding.supabase,
      tables: ['instruments'],
      runtimeContracts: null,
      includeRuntimeContracts: false,
    });
    expect(second.ready).toBe(true);
    expect(succeeding.supabase.from).toHaveBeenCalled();
  });

  it('caches missing readiness state and bypasses cache on demand', async () => {
    const { supabase } = createSupabaseMock({
      instruments: {
        code: 'PGRST204',
        message: "Could not find the 'certificate_name' column",
      },
    });

    await expect(
      assertInstrumentsSchemaReadiness({ supabase })
    ).rejects.toBeInstanceOf(SchemaNotReadyError);
    await expect(
      assertInstrumentsSchemaReadiness({ supabase })
    ).rejects.toBeInstanceOf(SchemaNotReadyError);
    expect(supabase.from).toHaveBeenCalledTimes(2);

    await expect(
      assertInstrumentsSchemaReadiness({ bypassCache: true, supabase })
    ).rejects.toBeInstanceOf(SchemaNotReadyError);
    expect(supabase.from).toHaveBeenCalledTimes(4);
  });

  it('uses separate cache keys for different contract sets', async () => {
    const { supabase } = createSupabaseMock();

    await assertInstrumentsSchemaReadiness({ supabase });
    await assertClientRpcSchemaReadiness({ supabase });

    expect(supabase.from).toHaveBeenCalledTimes(3);
  });

  it('reports invoice_settings columns as missing on PostgREST schema-cache errors', async () => {
    const { supabase } = createSupabaseMock({
      invoice_settings: {
        code: 'PGRST204',
        message:
          "Could not find the 'business_name' column of 'invoice_settings' in the schema cache",
      },
    });

    const result = await checkSchemaReadiness({
      bypassCache: true,
      supabase,
      tables: ['invoice_settings'],
      runtimeContracts: null,
      includeRuntimeContracts: false,
    });

    expect(result.ready).toBe(false);
    expect(result.missingColumns).toContain(
      'public.invoice_settings.business_name'
    );
  });

  it('checks only instrument image metadata columns for the image wrapper', async () => {
    const { supabase, selections } = createSupabaseMock();

    await assertInstrumentImagesSchemaReadiness({
      bypassCache: true,
      supabase,
    });

    expect(Object.keys(selections)).toEqual(['instrument_images']);
  });

  it('reports client_instruments display_order drift for connection flows', async () => {
    const { supabase } = createSupabaseMock({
      client_instruments: {
        code: '42703',
        message: 'column client_instruments.display_order does not exist',
      },
    });

    await expect(
      assertClientConnectionsSchemaReadiness({
        bypassCache: true,
        supabase,
      })
    ).rejects.toMatchObject({
      code: 'SCHEMA_OUT_OF_DATE',
      details: {
        missingColumns: ['public.client_instruments.display_order'],
      },
    });
  });

  it('surfaces missing invoice_settings fields in SchemaNotReadyError details', () => {
    const error = new SchemaNotReadyError([
      'public.invoice_settings.business_name',
    ]);

    expect(error.status).toBe(503);
    expect(error.code).toBe('SCHEMA_OUT_OF_DATE');
    expect(error.retryable).toBe(false);
  });
});
