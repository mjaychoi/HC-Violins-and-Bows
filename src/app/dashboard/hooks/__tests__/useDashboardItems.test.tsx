import { renderHook, act, waitFor } from '@/test-utils/render';
import { useDashboardItems } from '../useDashboardItems';
import { Instrument, InstrumentImage, ClientInstrument, Client } from '@/types';
import {
  withNormalizedDefaults,
  NormalizedRowDefaults,
} from '@/test/fixtures/rows';
import { apiFetch } from '@/utils/apiFetch';

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logError: jest.fn(),
  logApiRequest: jest.fn(),
}));

type NormalizedInstrument = Instrument & NormalizedRowDefaults;

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const mockInstrument: NormalizedInstrument = withNormalizedDefaults<Instrument>(
  {
    id: 'inst1',
    maker: 'Stradivari',
    type: 'Violin',
    subtype: '4/4',
    year: 1700,
    certificate: true,
    size: null,
    weight: null,
    price: 100000,
    ownership: 'Store',
    note: null,
    serial_number: 'VI0000001',
    status: 'Available',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
);

const mockClient: Client = {
  id: 'client1',
  first_name: 'Jane',
  last_name: 'Doe',
  contact_number: '123',
  email: 'jane@example.com',
  tags: [],
  interest: null,
  note: null,
  client_number: 'C-001',
  created_at: '2024-01-01T00:00:00Z',
};

const mockConnection: ClientInstrument = {
  id: 'rel1',
  client_id: 'client1',
  instrument_id: 'inst1',
  relationship_type: 'Owned',
  notes: null,
  display_order: 1,
  created_at: '2024-01-01T00:00:00Z',
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useDashboardItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch.mockImplementation(async url => {
      if (
        url === '/api/instruments?orderBy=created_at&ascending=false&all=true'
      ) {
        return jsonResponse({ data: [] });
      }
      if (
        url ===
        '/api/connections?orderBy=created_at&ascending=false&pageSize=100'
      ) {
        return jsonResponse({ data: [] });
      }
      if (url === '/api/clients?orderBy=created_at&ascending=false&all=true') {
        return jsonResponse({ data: [] });
      }
      return jsonResponse({ data: null });
    });
  });

  it('should initialize with default values', async () => {
    const { result } = renderHook(() => useDashboardItems());

    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.submitting).toBe(false);
    expect(result.current.itemImages).toEqual([]);
    expect(result.current.uploadingImages).toBe(false);
    expect(result.current.imagesToDelete).toEqual([]);
    expect(result.current.clientRelationships).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/instruments?orderBy=created_at&ascending=false&all=true'
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/connections?orderBy=created_at&ascending=false&pageSize=100'
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/clients?orderBy=created_at&ascending=false&all=true'
    );
  });

  it('should fetch items on mount', async () => {
    mockApiFetch.mockImplementation(async url => {
      if (
        url === '/api/instruments?orderBy=created_at&ascending=false&all=true'
      ) {
        return jsonResponse({ data: [mockInstrument] });
      }
      if (
        url ===
        '/api/connections?orderBy=created_at&ascending=false&pageSize=100'
      ) {
        return jsonResponse({ data: [mockConnection] });
      }
      if (url === '/api/clients?orderBy=created_at&ascending=false&all=true') {
        return jsonResponse({ data: [mockClient] });
      }
      return jsonResponse({ data: [] });
    });

    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      id: mockInstrument.id,
      maker: mockInstrument.maker,
      type: mockInstrument.type,
      price: mockInstrument.price,
      status: mockInstrument.status,
      serial_number: mockInstrument.serial_number,
    });
    expect(result.current.clientRelationships).toHaveLength(1);
    expect(result.current.clientRelationships[0]).toMatchObject({
      id: 'rel1',
      client: mockClient,
      instrument: mockInstrument,
    });
  });

  it('should handle fetch items error', async () => {
    mockApiFetch.mockImplementation(async url => {
      if (
        url === '/api/instruments?orderBy=created_at&ascending=false&all=true'
      ) {
        return jsonResponse({ error: 'Fetch failed' }, { status: 500 });
      }
      return jsonResponse({ data: [] });
    });

    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
  });

  it('should create item', async () => {
    const newInstrument: Instrument = {
      ...mockInstrument,
      id: 'inst2',
      maker: 'Guarneri',
      type: 'Cello',
      status: 'Available',
    };

    mockApiFetch.mockImplementation(async (url, options) => {
      if (
        url === '/api/instruments?orderBy=created_at&ascending=false&all=true'
      ) {
        return jsonResponse({ data: [] });
      }
      if (
        url ===
        '/api/connections?orderBy=created_at&ascending=false&pageSize=100'
      ) {
        return jsonResponse({ data: [] });
      }
      if (url === '/api/clients?orderBy=created_at&ascending=false&all=true') {
        return jsonResponse({ data: [] });
      }
      if (url === '/api/instruments' && options?.method === 'POST') {
        return jsonResponse({ data: newInstrument }, { status: 201 });
      }
      return jsonResponse({ data: null });
    });

    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const created = await result.current.createItem({
        maker: 'Guarneri',
        type: 'Cello',
        subtype: null,
        year: 1750,
        certificate: false,
        size: null,
        weight: null,
        price: 50000,
        ownership: null,
        note: null,
        serial_number: 'CE0000001',
        status: 'Available',
      });
      expect(created).toEqual(newInstrument);
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/instruments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.submitting).toBe(false);
  });

  it('should update item', async () => {
    const updatedInstrument = { ...mockInstrument, price: 150000 };

    mockApiFetch.mockImplementation(async (url, options) => {
      if (
        url === '/api/instruments?orderBy=created_at&ascending=false&all=true'
      ) {
        return jsonResponse({ data: [mockInstrument] });
      }
      if (
        url ===
        '/api/connections?orderBy=created_at&ascending=false&pageSize=100'
      ) {
        return jsonResponse({ data: [] });
      }
      if (url === '/api/clients?orderBy=created_at&ascending=false&all=true') {
        return jsonResponse({ data: [] });
      }
      if (url === '/api/instruments' && options?.method === 'PATCH') {
        return jsonResponse({ data: updatedInstrument });
      }
      return jsonResponse({ data: null });
    });

    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const updated = await result.current.updateItem('inst1', {
        price: 150000,
      });
      expect(updated).toEqual(updatedInstrument);
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/instruments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'inst1', price: 150000 }),
    });
    expect(result.current.items[0].price).toBe(150000);
    expect(result.current.submitting).toBe(false);
  });

  it('should delete item', async () => {
    mockApiFetch.mockImplementation(async (url, options) => {
      if (
        url === '/api/instruments?orderBy=created_at&ascending=false&all=true'
      ) {
        return jsonResponse({ data: [mockInstrument] });
      }
      if (
        url ===
        '/api/connections?orderBy=created_at&ascending=false&pageSize=100'
      ) {
        return jsonResponse({ data: [] });
      }
      if (url === '/api/clients?orderBy=created_at&ascending=false&all=true') {
        return jsonResponse({ data: [] });
      }
      if (url === '/api/instruments?id=inst1' && options?.method === 'DELETE') {
        return jsonResponse({ data: { success: true } });
      }
      return jsonResponse({ data: null });
    });

    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteItem('inst1');
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/instruments?id=inst1', {
      method: 'DELETE',
    });
    expect(result.current.items).toHaveLength(0);
  });

  it('should manage item images', async () => {
    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const mockImage: InstrumentImage = {
      id: 'img1',
      instrument_id: 'inst1',
      image_url: 'https://example.com/image.jpg',
      alt_text: 'Test image',
      file_name: 'image.jpg',
      file_size: 1000,
      mime_type: 'image/jpeg',
      display_order: 1,
      created_at: '2024-01-01',
    };

    act(() => {
      result.current.addItemImage(mockImage);
    });

    expect(result.current.itemImages).toHaveLength(1);
    expect(result.current.itemImages[0]).toEqual(mockImage);

    act(() => {
      result.current.removeItemImage('img1');
    });

    expect(result.current.itemImages).toHaveLength(0);
  });

  it('should manage client relationships', async () => {
    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const mockRelationship: ClientInstrument = {
      id: 'rel2',
      client_id: 'c1',
      instrument_id: 'inst1',
      relationship_type: 'Owned',
      notes: null,
      created_at: '2024-01-01',
    };

    act(() => {
      result.current.addClientRelationship(mockRelationship);
    });

    expect(result.current.clientRelationships).toHaveLength(1);
    expect(result.current.clientRelationships[0]).toEqual(mockRelationship);

    act(() => {
      result.current.removeClientRelationship('rel2');
    });

    expect(result.current.clientRelationships).toHaveLength(0);
  });

  it('should update uploadingImages state', async () => {
    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setUploadingImages(true);
    });

    expect(result.current.uploadingImages).toBe(true);
  });

  it('should update imagesToDelete state', async () => {
    const { result } = renderHook(() => useDashboardItems());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setImagesToDelete(['img1', 'img2']);
    });

    expect(result.current.imagesToDelete).toEqual(['img1', 'img2']);
  });
});
