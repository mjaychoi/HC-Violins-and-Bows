/**
 * useClientCollection — request identity and collection contract smoke tests.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useClientCollection } from '../useClientCollection';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/clients',
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: jest.fn(() => ({ tenantIdentityKey: 'org-a' })),
}));

jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('@/utils/handleApiResponse', () => ({
  readApiResponseEnvelope: jest.fn(),
}));

describe('useClientCollection', () => {
  const { apiFetch } = require('@/utils/apiFetch');
  const { readApiResponseEnvelope } = require('@/utils/handleApiResponse');
  const { useTenantIdentity } = require('@/hooks/useTenantIdentity');

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    useTenantIdentity.mockReturnValue({ tenantIdentityKey: 'org-a' });
    apiFetch.mockImplementation((url: string) => {
      if (String(url).includes('filter-options')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true });
    });
    readApiResponseEnvelope.mockImplementation(
      async (_res: unknown, msg: string) => {
        if (String(msg).includes('filter')) {
          return {
            data: {
              lastNames: [],
              firstNames: [],
              emails: [],
              contactNumbers: [],
              tags: [],
              interests: [],
            },
          };
        }
        return {
          data: [
            {
              id: 'c1',
              first_name: 'Ann',
              last_name: 'Lee',
              email: null,
              contact_number: null,
              tags: [],
              interest: null,
              note: null,
              client_number: 'CL1001',
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
          count: 1001,
          pagination: {
            page: 1,
            pageSize: 20,
            totalCount: 1001,
            totalPages: 51,
          },
          has_more: true,
          truncated: false,
          scope: 'paged',
        };
      }
    );
  });

  it('fetches a paginated collection without all=true', async () => {
    const { result } = renderHook(() => useClientCollection());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.totalCount).toBe(1001);
    });

    const listCall = (apiFetch as jest.Mock).mock.calls.find((c: string[]) =>
      String(c[0]).startsWith('/api/clients?')
    );
    expect(String(listCall?.[0])).toContain('page=1');
    expect(String(listCall?.[0])).toContain('pageSize=20');
    expect(String(listCall?.[0])).not.toContain('all=true');
    expect(result.current.totalPages).toBe(51);
    expect(result.current.pageRows).toHaveLength(1);
  });

  it('fetchClientById uses secure by-id endpoint', async () => {
    const { result } = renderHook(() => useClientCollection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    readApiResponseEnvelope.mockResolvedValueOnce({
      data: {
        id: 'deep',
        first_name: 'Deep',
        last_name: 'Link',
        email: null,
        contact_number: null,
        tags: [],
        interest: null,
        note: null,
        client_number: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    });

    const client = await result.current.fetchClientById('deep');
    expect(apiFetch).toHaveBeenCalledWith('/api/clients?id=deep');
    expect(client).toMatchObject({ id: 'deep', first_name: 'Deep' });
  });

  it('S3/S4: normalizes legacy name and phone sort URLs to canonical keys', async () => {
    mockSearchParams = new URLSearchParams('sortBy=first_name&sortOrder=asc');
    const { result } = renderHook(() => useClientCollection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sortBy).toBe('name');
    expect(result.current.getSortArrow('name')).toBe('↑');
    expect(result.current.getSortArrow('first_name')).toBe('↑');
    expect(result.current.getSortArrow('phone')).toBe('');

    const listCall = (apiFetch as jest.Mock).mock.calls.find((c: string[]) =>
      String(c[0]).startsWith('/api/clients?')
    );
    expect(String(listCall?.[0])).toContain('orderBy=name');
  });

  it('keeps contact_number alias aligned with phone sort', async () => {
    mockSearchParams = new URLSearchParams(
      'sort_by=contact_number&sort_direction=desc'
    );
    const { result } = renderHook(() => useClientCollection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sortBy).toBe('phone');
    expect(result.current.sortOrder).toBe('desc');
    expect(result.current.getSortArrow('phone')).toBe('↓');
  });

  it('S6: changing sort resets page to 1 and writes canonical URL keys', async () => {
    mockSearchParams = new URLSearchParams('page=4&sortBy=created_at');
    const { result } = renderHook(() => useClientCollection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleColumnSort('client_number');
    });

    const url = String(mockReplace.mock.calls.at(-1)?.[0]);
    expect(url).toContain('sortBy=client_number');
    expect(url).toContain('orderBy=client_number');
    expect(url).toContain('page=1');
    expect(url).toContain('sortOrder=asc');
  });

  it('S7: invalid URL sort falls back to created_at without a false header arrow', async () => {
    mockSearchParams = new URLSearchParams('sortBy=tags&sortOrder=asc');
    const { result } = renderHook(() => useClientCollection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sortBy).toBe('created_at');
    expect(result.current.getSortArrow('tags')).toBe('');
    expect(result.current.getSortArrow('name')).toBe('');
    expect(result.current.getSortArrow('client_number')).toBe('');
  });

  it('toggles sort direction on the same canonical field', async () => {
    mockSearchParams = new URLSearchParams('sortBy=name&sortOrder=asc');
    const { result } = renderHook(() => useClientCollection());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleColumnSort('name');
    });

    const url = String(mockReplace.mock.calls.at(-1)?.[0]);
    expect(url).toContain('sortBy=name');
    expect(url).toContain('sortOrder=desc');
  });
});
