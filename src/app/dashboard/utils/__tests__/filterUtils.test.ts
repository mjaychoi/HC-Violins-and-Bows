// src/app/dashboard/utils/__tests__/filterUtils.test.ts
import { filterDashboardItems, EMPTY_DASHBOARD_FILTERS } from '../filterUtils';
import { Instrument } from '@/types';
import { DashboardFilters } from '../../types';
import { DASHBOARD_FILTER_KEYS } from '../../constants';

describe('dashboard filterUtils', () => {
  const mockInstruments: Instrument[] = [
    {
      id: '1',
      maker: 'Stradivarius',
      type: 'Violin',
      subtype: '4/4',
      status: 'Available',
      ownership: 'Private',
      certificate: true,
      price: 1000000,
      year: 1700,
      size: null,
      weight: null,
      note: null,
      serial_number: 'SN123',
      created_at: '2024-01-15T00:00:00Z',
    },
    {
      id: '2',
      maker: 'Guarneri',
      type: 'Violin',
      subtype: null,
      status: 'Sold',
      ownership: 'Public',
      certificate: false,
      price: 500000,
      year: 1750,
      size: null,
      weight: null,
      note: null,
      serial_number: null,
      created_at: '2024-02-15T00:00:00Z',
    },
    {
      id: '3',
      maker: 'Amati',
      type: 'Viola',
      subtype: '15"',
      status: 'Available',
      ownership: 'Private',
      certificate: true,
      price: 300000,
      year: 1650,
      size: null,
      weight: null,
      note: null,
      serial_number: null,
      created_at: '2024-03-15T00:00:00Z',
    },
  ];

  describe('filterDashboardItems', () => {
    it('returns all items when no filters are applied', () => {
      const filtered = filterDashboardItems(
        mockInstruments,
        EMPTY_DASHBOARD_FILTERS,
        null
      );

      expect(filtered).toHaveLength(3);
    });

    it('filters by status', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.STATUS]: ['Available'],
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(item => item.status === 'Available')).toBe(true);
    });

    it('filters by multiple statuses', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.STATUS]: ['Available', 'Sold'],
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(3);
    });

    it('filters by maker', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.MAKER]: ['Stradivarius'],
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].maker).toBe('Stradivarius');
    });

    it('filters by type', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.TYPE]: ['Violin'],
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(item => item.type === 'Violin')).toBe(true);
    });

    it('filters by subtype', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.SUBTYPE]: ['4/4'],
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].subtype).toBe('4/4');
    });

    it('filters by ownership', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.OWNERSHIP]: ['Private'],
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(item => item.ownership === 'Private')).toBe(true);
    });

    it('filters by certificate (true)', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.CERTIFICATE]: [true],
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(item => Boolean(item.certificate) === true)).toBe(
        true
      );
    });

    it('filters by certificate (false)', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.CERTIFICATE]: [false],
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(1);
      expect(Boolean(filtered[0].certificate)).toBe(false);
    });

    it('filters by price range (min only)', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        priceRange: { min: '400000', max: '' },
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(item => (item.price as number) >= 400000)).toBe(
        true
      );
    });

    it('filters by price range (max only)', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        priceRange: { min: '', max: '600000' },
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(item => (item.price as number) <= 600000)).toBe(
        true
      );
    });

    it('filters by price range (min and max)', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        priceRange: { min: '400000', max: '800000' },
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(1);
      expect((filtered[0].price as number) >= 400000).toBe(true);
      expect((filtered[0].price as number) <= 800000).toBe(true);
    });

    it('excludes items with null price when filtering by price range', () => {
      const instrumentsWithNullPrice = [
        ...mockInstruments,
        {
          ...mockInstruments[0],
          id: '4',
          price: null,
        },
      ];
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        priceRange: { min: '100000', max: '' },
      };

      const filtered = filterDashboardItems(
        instrumentsWithNullPrice,
        filters,
        null
      );

      expect(filtered).not.toContainEqual(
        expect.objectContaining({ id: '4', price: null })
      );
    });

    it('filters by date range (from only)', () => {
      const dateRange = { from: '2024-02-01' };

      const filtered = filterDashboardItems(
        mockInstruments,
        EMPTY_DASHBOARD_FILTERS,
        dateRange
      );

      expect(filtered).toHaveLength(2); // Items from Feb and Mar
    });

    it('filters by date range (to only)', () => {
      const dateRange = { to: '2024-02-28' };

      const filtered = filterDashboardItems(
        mockInstruments,
        EMPTY_DASHBOARD_FILTERS,
        dateRange
      );

      expect(filtered).toHaveLength(2); // Items from Jan and Feb
    });

    it('filters by date range (from and to)', () => {
      const dateRange = { from: '2024-02-01', to: '2024-02-28' };

      const filtered = filterDashboardItems(
        mockInstruments,
        EMPTY_DASHBOARD_FILTERS,
        dateRange
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].created_at).toContain('2024-02');
    });

    it('handles invalid date formats gracefully', () => {
      const instrumentsWithInvalidDate = [
        {
          ...mockInstruments[0],
          created_at: 'invalid-date',
        },
      ];
      const dateRange = { from: '2024-01-01', to: '2024-12-31' };

      const filtered = filterDashboardItems(
        instrumentsWithInvalidDate,
        EMPTY_DASHBOARD_FILTERS,
        dateRange
      );

      expect(filtered).toHaveLength(0);
    });

    it('filters by hasClients (true)', () => {
      const enrichedInstruments = mockInstruments.map(item => ({
        ...item,
        clients: [{ id: 'client-1' }],
      })) as Array<Instrument & { clients?: unknown[] }>;
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.HAS_CLIENTS]: [true],
      };

      const filtered = filterDashboardItems(
        enrichedInstruments as Instrument[],
        filters,
        null
      );

      expect(filtered).toHaveLength(3);
    });

    it('filters by hasClients (false)', () => {
      const enrichedInstruments = mockInstruments.map((item, i) => ({
        ...item,
        clients: i === 0 ? [] : [{ id: 'client-1' }],
      })) as Array<Instrument & { clients?: unknown[] }>;
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.HAS_CLIENTS]: [false],
      };

      const filtered = filterDashboardItems(
        enrichedInstruments as Instrument[],
        filters,
        null
      );

      expect(filtered).toHaveLength(1);
      expect((filtered[0] as { clients?: unknown[] }).clients?.length).toBe(0);
    });

    it('combines multiple filters', () => {
      const filters: DashboardFilters = {
        ...EMPTY_DASHBOARD_FILTERS,
        [DASHBOARD_FILTER_KEYS.STATUS]: ['Available'],
        [DASHBOARD_FILTER_KEYS.TYPE]: ['Violin'],
        [DASHBOARD_FILTER_KEYS.OWNERSHIP]: ['Private'],
        [DASHBOARD_FILTER_KEYS.CERTIFICATE]: [true],
      };

      const filtered = filterDashboardItems(mockInstruments, filters, null);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('handles empty instrument array', () => {
      const filtered = filterDashboardItems([], EMPTY_DASHBOARD_FILTERS, null);

      expect(filtered).toHaveLength(0);
    });
  });

  describe('EMPTY_DASHBOARD_FILTERS', () => {
    it('has all filter keys with empty values', () => {
      expect(EMPTY_DASHBOARD_FILTERS[DASHBOARD_FILTER_KEYS.STATUS]).toEqual([]);
      expect(EMPTY_DASHBOARD_FILTERS[DASHBOARD_FILTER_KEYS.MAKER]).toEqual([]);
      expect(EMPTY_DASHBOARD_FILTERS[DASHBOARD_FILTER_KEYS.TYPE]).toEqual([]);
      expect(EMPTY_DASHBOARD_FILTERS[DASHBOARD_FILTER_KEYS.SUBTYPE]).toEqual(
        []
      );
      expect(EMPTY_DASHBOARD_FILTERS[DASHBOARD_FILTER_KEYS.OWNERSHIP]).toEqual(
        []
      );
      expect(
        EMPTY_DASHBOARD_FILTERS[DASHBOARD_FILTER_KEYS.CERTIFICATE]
      ).toEqual([]);
      expect(
        EMPTY_DASHBOARD_FILTERS[DASHBOARD_FILTER_KEYS.PRICE_RANGE]
      ).toEqual({ min: '', max: '' });
      expect(
        EMPTY_DASHBOARD_FILTERS[DASHBOARD_FILTER_KEYS.HAS_CLIENTS]
      ).toEqual([]);
    });
  });
});
