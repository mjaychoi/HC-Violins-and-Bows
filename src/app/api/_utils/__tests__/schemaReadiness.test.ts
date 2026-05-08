import {
  __resetSchemaReadinessCacheForTests,
  assertClientConnectionsSchemaReadiness,
  assertClientsSchemaReadiness,
  assertInstrumentImagesSchemaReadiness,
  checkSchemaReadiness,
  SchemaNotReadyError,
} from '../schemaReadiness';

describe('schemaReadiness', () => {
  beforeEach(() => {
    __resetSchemaReadinessCacheForTests();
  });

  function createSupabaseMock(errorsByTable: Record<string, unknown> = {}) {
    const selections: Record<string, string> = {};
    const supabase = {
      from: jest.fn((table: string) => ({
        select: jest.fn((columns: string) => {
          selections[table] = columns;
          return {
            limit: jest.fn().mockResolvedValue({
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
    expect(selections.invoices).toBe('invoice_number');
    expect(selections.invoice_settings).toEqual(
      [
        'business_name',
        'business_address',
        'business_phone',
        'business_email',
        'bank_account_holder',
        'bank_name',
        'bank_swift_code',
        'bank_account_number',
        'default_conditions',
        'default_exchange_rate',
        'default_currency',
      ].join(',')
    );
    expect(selections.instrument_images).toBe(
      'storage_key,file_name,file_size,mime_type,display_order'
    );
    expect(selections.client_instruments).toBe('display_order');
    expect(selections.clients).toBe('client_number');
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
    });

    expect(result.ready).toBe(false);
    expect(result.missingColumns).toContain(
      'public.invoice_settings.business_name'
    );
    expect(result.missingColumns).toContain(
      'public.invoice_settings.default_currency'
    );
  });

  it('surfaces missing invoice_settings fields in SchemaNotReadyError details', () => {
    const error = new SchemaNotReadyError([
      'public.invoice_settings.business_name',
    ]);

    expect(error.status).toBe(503);
    expect(error.code).toBe('SCHEMA_OUT_OF_DATE');
    expect(error.details.missingColumns).toEqual([
      'public.invoice_settings.business_name',
    ]);
  });

  it('checks only instrument image metadata columns for the image wrapper', async () => {
    const { supabase, selections } = createSupabaseMock();

    await assertInstrumentImagesSchemaReadiness({
      bypassCache: true,
      supabase,
    });

    expect(Object.keys(selections)).toEqual(['instrument_images']);
    expect(selections.instrument_images).toBe(
      'storage_key,file_name,file_size,mime_type,display_order'
    );
  });

  it('reports instrument image metadata columns as missing on schema drift', async () => {
    const { supabase } = createSupabaseMock({
      instrument_images: {
        code: 'PGRST204',
        message:
          "Could not find the 'storage_key' column of 'instrument_images' in the schema cache",
      },
    });

    await expect(
      assertInstrumentImagesSchemaReadiness({
        bypassCache: true,
        supabase,
      })
    ).rejects.toMatchObject({
      code: 'SCHEMA_OUT_OF_DATE',
      status: 503,
      details: {
        missingColumns: expect.arrayContaining([
          'public.instrument_images.storage_key',
          'public.instrument_images.display_order',
        ]),
      },
    });
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

  it('reports clients client_number drift for client flows', async () => {
    const { supabase } = createSupabaseMock({
      clients: {
        code: 'PGRST204',
        message:
          "Could not find the 'client_number' column of 'clients' in the schema cache",
      },
    });

    await expect(
      assertClientsSchemaReadiness({
        bypassCache: true,
        supabase,
      })
    ).rejects.toMatchObject({
      code: 'SCHEMA_OUT_OF_DATE',
      details: {
        missingColumns: ['public.clients.client_number'],
      },
    });
  });
});
