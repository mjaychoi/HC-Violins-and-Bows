import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { Invoice } from '@/types';
import InvoiceDetailPage from '../page';
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
  function MockInvoiceModal({
    isOpen,
    onSubmit,
  }: {
    isOpen: boolean;
    onSubmit: (data: Record<string, unknown>) => Promise<void>;
  }) {
    if (!isOpen) return null;
    return (
      <button
        type="button"
        onClick={() =>
          void onSubmit({
            client_id: 'client-1',
            invoice_date: '2026-08-01',
            due_date: null,
            subtotal: 1500,
            tax: 0,
            total: 1500,
            currency: 'USD',
            status: 'sent',
            notes: 'hosted-staging-qa notes',
            items: [
              {
                instrument_id: 'inst-1',
                description: 'Violin',
                qty: 1,
                rate: 1500,
                amount: 1500,
                image_url: null,
                display_order: 0,
              },
            ],
          })
        }
      >
        Save invoice
      </button>
    );
  }
  MockInvoiceModal.displayName = 'MockInvoiceModal';
  return MockInvoiceModal;
});
jest.mock('@/components/layout', () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));
jest.mock('@/components/common/OptimizedImage', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../../components/InvoiceSettingsPanel', () => ({
  __esModule: true,
  default: () => null,
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

const invoice = {
  id: 'inv-1',
  invoice_number: 'INV0000001',
  client_id: 'client-1',
  invoice_date: '2026-08-01',
  due_date: null,
  subtotal: 1500,
  tax: 0,
  total: 1500,
  currency: 'USD',
  status: 'draft',
  notes: 'original',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  client: {
    id: 'client-1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
  },
  items: [
    {
      id: 'item-1',
      invoice_id: 'inv-1',
      instrument_id: 'inst-1',
      description: 'Violin',
      qty: 1,
      rate: 1500,
      amount: 1500,
      image_url: null,
      display_order: 0,
      created_at: '2026-08-01T00:00:00Z',
    },
  ],
} as unknown as Invoice;

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data }),
  } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseParams.mockReturnValue({ id: 'inv-1' } as never);
  mockUseRouter.mockReturnValue({ push: jest.fn() } as never);
  mockUseAppFeedback.mockReturnValue({
    showSuccess: jest.fn(),
    handleError: jest.fn(),
  } as never);
  mockUsePermissions.mockReturnValue({
    permissionsReady: true,
    canViewInvoices: true,
    canEditInvoice: true,
    canDeleteInvoice: true,
    canManageInvoiceSettings: true,
  } as never);
});

function putCalls() {
  return mockApiFetch.mock.calls.filter(
    call => (call[1] as RequestInit | undefined)?.method === 'PUT'
  );
}

describe('invoice detail update contract', () => {
  it('sends Idempotency-Key and CAS updated_at, then adopts the returned timestamp', async () => {
    const user = userEvent.setup();
    const mockShowSuccess = jest.fn();
    mockUseAppFeedback.mockReturnValue({
      showSuccess: mockShowSuccess,
      handleError: jest.fn(),
    } as never);

    mockApiFetch.mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        return jsonResponse({
          ...invoice,
          status: 'sent',
          notes: 'hosted-staging-qa notes',
          updated_at:
            body.updated_at === '2026-08-01T00:00:00Z'
              ? '2026-08-01T01:00:00Z'
              : '2026-08-01T02:00:00Z',
        });
      }
      if (url.includes('/api/invoices/inv-1')) {
        return jsonResponse(invoice);
      }
      return jsonResponse(null, 404);
    });

    render(<InvoiceDetailPage />);
    await screen.findByText('INV0000001');
    expect(screen.getByText('original')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save invoice' }));

    await waitFor(() => {
      expect(putCalls()).toHaveLength(1);
    });

    const firstPut = putCalls()[0];
    expect(String(firstPut[0])).toBe('/api/invoices/inv-1');
    const firstBody = JSON.parse(String((firstPut[1] as RequestInit).body));
    expect(firstBody.updated_at).toBe('2026-08-01T00:00:00Z');
    expect(firstBody.status).toBe('sent');
    expect(firstPut[2]).toEqual(
      expect.objectContaining({
        idempotencyKey: expect.any(String),
      })
    );
    const firstKey = String(firstPut[2]?.idempotencyKey);
    expect(firstKey.length).toBeGreaterThan(8);

    await waitFor(() => {
      expect(screen.getByText('hosted-staging-qa notes')).toBeInTheDocument();
    });
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save invoice' })
    ).not.toBeInTheDocument();
    expect(mockShowSuccess).toHaveBeenCalledWith('Invoice updated');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save invoice' }));

    await waitFor(() => {
      expect(putCalls()).toHaveLength(2);
    });

    const secondPut = putCalls()[1];
    const secondBody = JSON.parse(String((secondPut[1] as RequestInit).body));
    expect(secondBody.updated_at).toBe('2026-08-01T01:00:00Z');
    expect(secondPut[2]).toEqual(
      expect.objectContaining({
        idempotencyKey: expect.any(String),
      })
    );
    expect(String(secondPut[2]?.idempotencyKey)).not.toBe(firstKey);
  });
});
