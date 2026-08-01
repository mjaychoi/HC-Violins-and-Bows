/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
/**
 * Cross-surface contract tests for the invoice UI.
 *
 * F7 — money formatting: the same fixture amount (1234.50 USD) must render
 * identically on the invoice list and the invoice detail page, and must agree
 * digit-for-digit with the PDF/document formatter. Before this change the list
 * used minimumFractionDigits 0 ("$1,234.5"), the detail page used 2
 * ("$1,234.50") and the PDF used 0 ("1,234.5 USD").
 *
 * F5 — hard-delete protection: a destructive Delete control must not be offered
 * for invoices the API will always reject with 409 INVOICE_IMMUTABLE, and where
 * it is offered the confirmation must say it permanently deletes the draft and
 * its line items.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import type { Invoice, InvoiceStatus } from '@/types';
import InvoiceList from '../components/InvoiceList';
import InvoiceDetailPage from '../[id]/page';
import {
  formatInvoiceMoney,
  formatInvoiceMoneyWithCurrencyCode,
} from '@/utils/invoiceMoney';
import { apiFetch } from '@/utils/apiFetch';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { usePermissions } from '@/hooks/usePermissions';
import { useParams, useRouter } from 'next/navigation';

jest.mock('@/utils/apiFetch');
jest.mock('@/hooks/useAppFeedback');
jest.mock('@/hooks/usePermissions');
jest.mock('next/navigation', () => ({
  __esModule: true,
  useParams: jest.fn(),
  useRouter: jest.fn(),
}));
jest.mock('next/dynamic', () => () => {
  const MockDynamic = () => null;
  MockDynamic.displayName = 'MockDynamic';
  return MockDynamic;
});
jest.mock('@/components/layout', () => ({
  AppLayout: ({ title, children }: any) => (
    <div data-testid="app-layout">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));
jest.mock('@/components/common/OptimizedImage', () => ({
  __esModule: true,
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}));
jest.mock('../components/InvoiceSettingsPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="invoice-settings-panel" />,
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockUseAppFeedback = useAppFeedback as jest.MockedFunction<
  typeof useAppFeedback
>;
const mockUsePermissions = usePermissions as jest.MockedFunction<
  typeof usePermissions
>;
const mockUseParams = useParams as jest.MockedFunction<typeof useParams>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

/** Shared fixture: subtotal 1234.50, no tax, total 1234.50, USD. */
const FIXTURE_AMOUNT = 1234.5;
const EXPECTED_DISPLAY = '$1,234.50';

const mockClient = {
  id: 'client-1',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  contact_number: '123-456-7890',
  client_number: 'CL001',
  tags: [],
  interest: '',
  note: '',
  address: null,
  created_at: '2024-01-01T00:00:00Z',
};

function makeInvoice(status: InvoiceStatus = 'draft'): Invoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV0000001',
    client_id: 'client-1',
    invoice_date: '2026-08-01',
    due_date: null,
    subtotal: FIXTURE_AMOUNT,
    tax: 0,
    total: FIXTURE_AMOUNT,
    currency: 'USD',
    status,
    notes: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    client: mockClient,
    items: [
      {
        id: 'item-1',
        invoice_id: 'inv-1',
        instrument_id: null,
        description: 'Bow rehair',
        qty: 1,
        rate: FIXTURE_AMOUNT,
        amount: FIXTURE_AMOUNT,
        image_url: null,
        display_order: 0,
        created_at: '2026-08-01T00:00:00Z',
      },
    ],
  } as unknown as Invoice;
}

function renderList(invoice: Invoice, extra: Record<string, unknown> = {}) {
  return render(
    <InvoiceList
      invoices={[invoice]}
      loading={false}
      onSort={jest.fn()}
      getSortState={jest.fn(() => ({ active: false })) as any}
      {...extra}
    />
  );
}

async function renderDetail(invoice: Invoice) {
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: invoice }),
  } as any);

  render(<InvoiceDetailPage />);
  await screen.findByText(invoice.invoice_number as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseParams.mockReturnValue({ id: 'inv-1' } as any);
  mockUseRouter.mockReturnValue({ push: jest.fn() } as any);
  mockUseAppFeedback.mockReturnValue({
    showSuccess: jest.fn(),
    handleError: jest.fn(),
  } as any);
  mockUsePermissions.mockReturnValue({
    canEditInvoice: true,
    canDeleteInvoice: true,
    canManageInvoiceSettings: true,
  } as any);
});

describe('F7 — consistent money formatting across invoice surfaces', () => {
  it('renders $1,234.50 on the invoice list', () => {
    renderList(makeInvoice());
    expect(screen.getAllByText(EXPECTED_DISPLAY).length).toBeGreaterThan(0);
    // The pre-fix list rendered "$1,234.5" and silently dropped the cents.
    expect(screen.queryByText('$1,234.5')).not.toBeInTheDocument();
  });

  it('renders $1,234.50 on the invoice detail page', async () => {
    await renderDetail(makeInvoice());
    expect(screen.getAllByText(EXPECTED_DISPLAY).length).toBeGreaterThan(0);
    expect(screen.queryByText('$1,234.5')).not.toBeInTheDocument();
  });

  it('agrees with the PDF/document formatter on the same fixture', () => {
    expect(formatInvoiceMoney(FIXTURE_AMOUNT, 'USD')).toBe(EXPECTED_DISPLAY);
    expect(formatInvoiceMoneyWithCurrencyCode(FIXTURE_AMOUNT, 'USD')).toBe(
      '1,234.50 USD'
    );
  });
});

describe('F5 — destructive delete is not offered for issued invoices', () => {
  it('offers Delete for a draft invoice on the list', () => {
    renderList(makeInvoice('draft'), { onDelete: jest.fn() });
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it.each<InvoiceStatus>(['sent', 'paid', 'overdue', 'cancelled'])(
    'hides Delete for a %s invoice on the list',
    status => {
      renderList(makeInvoice(status), { onDelete: jest.fn() });
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    }
  );

  it('offers Delete for a draft invoice on the detail page', async () => {
    await renderDetail(makeInvoice('draft'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it.each<InvoiceStatus>(['sent', 'paid', 'overdue', 'cancelled'])(
    'hides Delete for a %s invoice on the detail page',
    async status => {
      await renderDetail(makeInvoice(status));
      expect(
        screen.queryByRole('button', { name: 'Delete' })
      ).not.toBeInTheDocument();
    }
  );

  it('states that deletion permanently removes the draft and its line items', async () => {
    const user = userEvent.setup();
    await renderDetail(makeInvoice('draft'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const message = await screen.findByText(
      /permanently delete draft INV0000001 and all of its line items/i
    );
    expect(message).toBeInTheDocument();
  });
});
