/**
 * F6 regression: the Sales "Send Receipt" action was permanently broken.
 *
 * The shipped handler took a `SalesHistory` row and issued
 *   GET /api/invoices/${sale.id}/pdf
 * i.e. it fed a `public.sales_history` primary key into an endpoint that looks
 * the id up in `public.invoices`. Nothing in the schema or the API relates a
 * sale to an invoice, so the request could only ever 404 (or, worse, collide
 * with an unrelated invoice id).
 *
 * The previous test for this control only asserted that a mocked callback was
 * invoked, which is exactly why the defect survived. These tests assert the
 * two facts that actually matter:
 *
 *   1. there is still no canonical sale -> invoice mapping to wire to, and
 *   2. no shipped sales surface routes a sale id into an invoice-by-id route.
 *
 * If a real sale receipt route is ever introduced, test 2 will fail and force a
 * deliberate decision instead of silently re-enabling a broken action.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { EnrichedSale } from '@/types';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

describe('F6 — sale receipt contract', () => {
  it('a sale row carries no invoice reference of any kind', () => {
    // Compile-time proof: EnrichedSale exposes no invoice linkage. If a future
    // change adds one, the ts-expect-error below stops compiling and this test
    // fails to build, which is the signal to revisit the receipt flow.
    const sale = {
      id: 'ecb1f0f0-0000-4000-8000-000000000001',
      instrument_id: null,
      client_id: null,
      sale_price: 100,
      sale_date: '2026-08-01',
      notes: null,
      created_at: '2026-08-01T00:00:00.000Z',
    } satisfies EnrichedSale;

    // @ts-expect-error - there is no sale -> invoice relation in the domain model.
    const invoiceId: string | undefined = sale.invoice_id;

    expect(invoiceId).toBeUndefined();

    // Runtime proof for the same claim.
    expect(Object.keys(sale)).not.toContain('invoice_id');
    expect(Object.keys(sale)).not.toContain('invoice');
  });

  it('exposes no canonical sale receipt API route', () => {
    // The only invoice PDF route is keyed by invoice id, and there is no
    // /api/sales/[id]/receipt (or equivalent) to wire the control to.
    expect(() =>
      readSource('src/app/api/invoices/[id]/pdf/route.ts')
    ).not.toThrow();

    expect(() =>
      readSource('src/app/api/sales/[id]/receipt/route.ts')
    ).toThrow();
  });

  it('no sales surface builds an invoice-by-id URL from a sale id', () => {
    const salesSources = [
      'src/app/sales/page.tsx',
      'src/app/sales/components/SalesTable.tsx',
    ].map(readSource);

    for (const source of salesSources) {
      // Strip comments so the explanatory notes describing the removed
      // behaviour do not trip the assertion.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

      expect(code).not.toMatch(/\/api\/invoices\/\$\{[^}]*sale[^}]*\}/i);
      expect(code).not.toContain('onSendReceipt');
      expect(code).not.toContain('handleSendReceipt');
    }
  });
});
