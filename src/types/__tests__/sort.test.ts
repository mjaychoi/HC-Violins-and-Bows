import {
  DASHBOARD_SORT_FIELDS,
  CALENDAR_SORT_FIELDS,
  CLIENT_SORT_FIELDS,
  type DashboardSortField,
  type CalendarSortField,
  type ClientSortField,
  type SortOrder,
  type SortFieldConfig,
} from '../sort';

describe('sort types and constants', () => {
  describe('DASHBOARD_SORT_FIELDS', () => {
    it('should contain all expected dashboard sort fields', () => {
      expect(DASHBOARD_SORT_FIELDS).toContain('created_at');
      expect(DASHBOARD_SORT_FIELDS).toContain('status');
      expect(DASHBOARD_SORT_FIELDS).toContain('serial_number');
      expect(DASHBOARD_SORT_FIELDS).toContain('maker');
      expect(DASHBOARD_SORT_FIELDS).toContain('type');
      expect(DASHBOARD_SORT_FIELDS).toContain('subtype');
      expect(DASHBOARD_SORT_FIELDS).toContain('year');
      expect(DASHBOARD_SORT_FIELDS).toContain('price');
    });

    it('should have correct length', () => {
      expect(DASHBOARD_SORT_FIELDS.length).toBe(9);
    });

    it('should be readonly array', () => {
      // TypeScript compile-time check, but we can verify it's an array
      expect(Array.isArray(DASHBOARD_SORT_FIELDS)).toBe(true);
      // Readonly arrays in TypeScript are not frozen at runtime
      // We just verify it exists and has correct structure
    });
  });

  describe('CALENDAR_SORT_FIELDS', () => {
    it('should contain all expected calendar sort fields', () => {
      expect(CALENDAR_SORT_FIELDS).toContain('date');
      expect(CALENDAR_SORT_FIELDS).toContain('priority');
      expect(CALENDAR_SORT_FIELDS).toContain('status');
      expect(CALENDAR_SORT_FIELDS).toContain('type');
    });

    it('should have correct length', () => {
      expect(CALENDAR_SORT_FIELDS.length).toBe(4);
    });

    it('should be readonly array', () => {
      expect(Array.isArray(CALENDAR_SORT_FIELDS)).toBe(true);
    });
  });

  describe('CLIENT_SORT_FIELDS', () => {
    it('should contain all expected client sort fields', () => {
      expect(CLIENT_SORT_FIELDS).toContain('created_at');
      expect(CLIENT_SORT_FIELDS).toContain('first_name');
      expect(CLIENT_SORT_FIELDS).toContain('last_name');
      expect(CLIENT_SORT_FIELDS).toContain('contact_number');
      expect(CLIENT_SORT_FIELDS).toContain('email');
      expect(CLIENT_SORT_FIELDS).toContain('interest');
    });

    it('should have correct length', () => {
      expect(CLIENT_SORT_FIELDS.length).toBe(6);
    });

    it('should be readonly array', () => {
      expect(Array.isArray(CLIENT_SORT_FIELDS)).toBe(true);
    });
  });

  describe('Type definitions', () => {
    it('should accept valid DashboardSortField values', () => {
      const validFields: DashboardSortField[] = [
        'created_at',
        'status',
        'serial_number',
        'maker',
        'type',
        'subtype',
        'year',
        'price',
      ];

      validFields.forEach(field => {
        expect(DASHBOARD_SORT_FIELDS).toContain(field);
      });
    });

    it('should accept valid CalendarSortField values', () => {
      const validFields: CalendarSortField[] = [
        'date',
        'priority',
        'status',
        'type',
      ];

      validFields.forEach(field => {
        expect(CALENDAR_SORT_FIELDS).toContain(field);
      });
    });

    it('should accept valid ClientSortField values', () => {
      const validFields: ClientSortField[] = [
        'created_at',
        'first_name',
        'last_name',
        'contact_number',
        'email',
        'interest',
      ];

      validFields.forEach(field => {
        expect(CLIENT_SORT_FIELDS).toContain(field);
      });
    });

    it('should accept valid SortOrder values', () => {
      const validOrders: SortOrder[] = ['asc', 'desc'];
      expect(validOrders).toHaveLength(2);
      expect(validOrders).toContain('asc');
      expect(validOrders).toContain('desc');
    });
  });

  describe('SortFieldConfig interface', () => {
    it('should allow creating sort field config with required fields', () => {
      const config: SortFieldConfig<DashboardSortField> = {
        field: 'created_at',
        label: 'Created At',
      };

      expect(config.field).toBe('created_at');
      expect(config.label).toBe('Created At');
      expect(config.defaultOrder).toBeUndefined();
    });

    it('should allow creating sort field config with defaultOrder', () => {
      const config: SortFieldConfig<DashboardSortField> = {
        field: 'status',
        label: 'Status',
        defaultOrder: 'desc',
      };

      expect(config.field).toBe('status');
      expect(config.label).toBe('Status');
      expect(config.defaultOrder).toBe('desc');
    });

    it('should allow creating config for calendar sort fields', () => {
      const config: SortFieldConfig<CalendarSortField> = {
        field: 'priority',
        label: 'Priority',
        defaultOrder: 'asc',
      };

      expect(config.field).toBe('priority');
      expect(config.defaultOrder).toBe('asc');
    });

    it('should allow creating config for client sort fields', () => {
      const config: SortFieldConfig<ClientSortField> = {
        field: 'last_name',
        label: 'Last Name',
        defaultOrder: 'asc',
      };

      expect(config.field).toBe('last_name');
      expect(config.defaultOrder).toBe('asc');
    });
  });
});
