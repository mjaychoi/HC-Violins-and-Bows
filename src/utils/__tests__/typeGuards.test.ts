/**
 * Type Guards Tests
 */

import {
  isInstrument,
  isClient,
  isMaintenanceTask,
  isSalesHistory,
  isTaskType,
  isTaskStatus,
  isTaskPriority,
  isRelationshipType,
  isInstrumentStatus,
  validateInstrument,
  validateClient,
  validateMaintenanceTask,
  validateSalesHistory,
  validateInstrumentArray,
  validateClientArray,
  validateMaintenanceTaskArray,
  validateSalesHistoryArray,
  safeValidate,
} from '../typeGuards';
import { Instrument, Client, MaintenanceTask, SalesHistory } from '@/types';

describe('Type Guards', () => {
  describe('isInstrument', () => {
    it.skip('should return true for valid instrument', () => {
      const instrument: Instrument = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'Available',
        maker: 'Stradivari',
        type: 'Violin',
        subtype: null,
        year: 1700,
        certificate: true,
        size: '4/4',
        weight: null,
        price: 1000000,
        ownership: null,
        note: null,
        serial_number: 'VI0000001',
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(isInstrument(instrument)).toBe(true);
    });

    it('should return false for invalid instrument', () => {
      expect(isInstrument(null)).toBe(false);
      expect(isInstrument({})).toBe(false);
      expect(isInstrument({ id: 'invalid' })).toBe(false);
    });
  });

  describe('isClient', () => {
    it('should return true for valid client', () => {
      const client: Client = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        last_name: 'Doe',
        first_name: 'John',
        contact_number: '123-456-7890',
        email: 'john@example.com',
        tags: ['vip'],
        interest: null,
        note: null,
        client_number: 'CL001',
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(isClient(client)).toBe(true);
    });

    it('should return false for invalid client', () => {
      expect(isClient(null)).toBe(false);
      expect(isClient({})).toBe(false);
      expect(isClient({ id: 'invalid' })).toBe(false);
    });
  });

  describe('isMaintenanceTask', () => {
    it('should return true for valid maintenance task', () => {
      const task: MaintenanceTask = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: null,
        task_type: 'repair',
        title: 'Fix bridge',
        description: null,
        status: 'pending',
        received_date: '2024-01-01',
        due_date: '2024-01-15',
        personal_due_date: null,
        scheduled_date: null,
        completed_date: null,
        priority: 'high',
        estimated_hours: 2,
        actual_hours: null,
        cost: null,
        notes: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(isMaintenanceTask(task)).toBe(true);
    });

    it('should return false for invalid maintenance task', () => {
      expect(isMaintenanceTask(null)).toBe(false);
      expect(isMaintenanceTask({})).toBe(false);
      expect(isMaintenanceTask({ id: 'invalid' })).toBe(false);
    });
  });

  describe('isSalesHistory', () => {
    it('should return true for valid sales history', () => {
      const sale: SalesHistory = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: 'Sold to customer',
        created_at: '2024-01-15T00:00:00Z',
      };

      expect(isSalesHistory(sale)).toBe(true);
    });

    it('should return false for invalid sales history', () => {
      expect(isSalesHistory(null)).toBe(false);
      expect(isSalesHistory({})).toBe(false);
      expect(isSalesHistory({ id: 'invalid' })).toBe(false);
    });
  });

  describe('isTaskType', () => {
    it('should return true for valid task types', () => {
      expect(isTaskType('repair')).toBe(true);
      expect(isTaskType('rehair')).toBe(true);
      expect(isTaskType('maintenance')).toBe(true);
    });

    it('should return false for invalid task types', () => {
      expect(isTaskType('invalid')).toBe(false);
      expect(isTaskType(null)).toBe(false);
      expect(isTaskType(123)).toBe(false);
    });
  });

  describe('isTaskStatus', () => {
    it('should return true for valid task statuses', () => {
      expect(isTaskStatus('pending')).toBe(true);
      expect(isTaskStatus('in_progress')).toBe(true);
      expect(isTaskStatus('completed')).toBe(true);
      expect(isTaskStatus('cancelled')).toBe(true);
    });

    it('should return false for invalid task statuses', () => {
      expect(isTaskStatus('invalid')).toBe(false);
      expect(isTaskStatus(null)).toBe(false);
    });
  });

  describe('isTaskPriority', () => {
    it('should return true for valid priorities', () => {
      expect(isTaskPriority('low')).toBe(true);
      expect(isTaskPriority('medium')).toBe(true);
      expect(isTaskPriority('high')).toBe(true);
      expect(isTaskPriority('urgent')).toBe(true);
    });

    it('should return false for invalid priorities', () => {
      expect(isTaskPriority('invalid')).toBe(false);
      expect(isTaskPriority(null)).toBe(false);
    });
  });

  describe('isRelationshipType', () => {
    it('should return true for valid relationship types', () => {
      expect(isRelationshipType('Interested')).toBe(true);
      expect(isRelationshipType('Sold')).toBe(true);
      expect(isRelationshipType('Booked')).toBe(true);
      expect(isRelationshipType('Owned')).toBe(true);
    });

    it('should return false for invalid relationship types', () => {
      expect(isRelationshipType('invalid')).toBe(false);
      expect(isRelationshipType(null)).toBe(false);
    });
  });

  describe('isInstrumentStatus', () => {
    it('should return true for valid instrument statuses', () => {
      expect(isInstrumentStatus('Available')).toBe(true);
      expect(isInstrumentStatus('Booked')).toBe(true);
      expect(isInstrumentStatus('Sold')).toBe(true);
      expect(isInstrumentStatus('Reserved')).toBe(true);
      expect(isInstrumentStatus('Maintenance')).toBe(true);
    });

    it('should return false for invalid instrument statuses', () => {
      expect(isInstrumentStatus('invalid')).toBe(false);
      expect(isInstrumentStatus(null)).toBe(false);
    });
  });
});

describe('Validation Functions', () => {
  describe('validateInstrument', () => {
    it.skip('should validate and return instrument for valid data', () => {
      const data: Instrument = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'Available',
        maker: 'Stradivari',
        type: 'Violin',
        subtype: null,
        year: 1700,
        certificate: true,
        size: '4/4',
        weight: null,
        price: 1000000,
        ownership: null,
        note: null,
        serial_number: 'VI0000001',
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(validateInstrument(data)).toEqual(data);
    });

    it('should throw error for invalid data', () => {
      expect(() => validateInstrument(null)).toThrow('Invalid Instrument');
      expect(() => validateInstrument({})).toThrow('Invalid Instrument');
    });
  });

  describe('validateClient', () => {
    it('should validate and return client for valid data', () => {
      const data: Client = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        last_name: 'Doe',
        first_name: 'John',
        contact_number: '123-456-7890',
        email: 'john@example.com',
        tags: ['vip'],
        interest: null,
        note: null,
        client_number: 'CL001',
        created_at: '2024-01-01T00:00:00Z',
      };

      expect(validateClient(data)).toEqual(data);
    });

    it('should throw error for invalid data', () => {
      expect(() => validateClient(null)).toThrow('Invalid Client');
      expect(() => validateClient({})).toThrow('Invalid Client');
    });
  });

  describe('validateMaintenanceTask', () => {
    it('should validate and return task for valid data', () => {
      const data: MaintenanceTask = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: null,
        task_type: 'repair',
        title: 'Fix bridge',
        description: null,
        status: 'pending',
        received_date: '2024-01-01',
        due_date: '2024-01-15',
        personal_due_date: null,
        scheduled_date: null,
        completed_date: null,
        priority: 'high',
        estimated_hours: 2,
        actual_hours: null,
        cost: null,
        notes: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(validateMaintenanceTask(data)).toEqual(data);
    });

    it('should throw error for invalid data', () => {
      expect(() => validateMaintenanceTask(null)).toThrow(
        'Invalid MaintenanceTask'
      );
      expect(() => validateMaintenanceTask({})).toThrow(
        'Invalid MaintenanceTask'
      );
    });
  });

  describe('validateSalesHistory', () => {
    it('should validate and return sale for valid data', () => {
      const data: SalesHistory = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        instrument_id: '123e4567-e89b-12d3-a456-426614174001',
        client_id: '123e4567-e89b-12d3-a456-426614174002',
        sale_price: 2500.0,
        sale_date: '2024-01-15',
        notes: 'Sold to customer',
        created_at: '2024-01-15T00:00:00Z',
      };

      expect(validateSalesHistory(data)).toEqual(data);
    });

    it('should throw error for invalid data', () => {
      expect(() => validateSalesHistory(null)).toThrow('Invalid SalesHistory');
      expect(() => validateSalesHistory({})).toThrow('Invalid SalesHistory');
    });
  });

  describe('validateInstrumentArray', () => {
    it.skip('should validate array of instruments', () => {
      const data: Instrument[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          status: 'Available',
          maker: 'Stradivari',
          type: 'Violin',
          subtype: null,
          year: 1700,
          certificate: true,
          size: '4/4',
          weight: null,
          price: 1000000,
          ownership: null,
          note: null,
          serial_number: 'VI0000001',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      expect(validateInstrumentArray(data)).toEqual(data);
    });

    it('should throw error for non-array', () => {
      expect(() => validateInstrumentArray(null)).toThrow('Expected an array');
    });

    it('should throw error for invalid item in array', () => {
      expect(() => validateInstrumentArray([{}])).toThrow(
        'Invalid Instrument at index 0'
      );
    });
  });

  describe('validateClientArray', () => {
    it('should validate array of clients', () => {
      const data: Client[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          last_name: 'Doe',
          first_name: 'John',
          contact_number: '123-456-7890',
          email: 'john@example.com',
          tags: ['vip'],
          interest: null,
          note: null,
          client_number: 'CL001',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      expect(validateClientArray(data)).toEqual(data);
    });

    it('should throw error for non-array', () => {
      expect(() => validateClientArray(null)).toThrow('Expected an array');
    });
  });

  describe('validateMaintenanceTaskArray', () => {
    it('should validate array of tasks', () => {
      const data: MaintenanceTask[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          instrument_id: '123e4567-e89b-12d3-a456-426614174001',
          client_id: null,
          task_type: 'repair',
          title: 'Fix bridge',
          description: null,
          status: 'pending',
          received_date: '2024-01-01',
          due_date: '2024-01-15',
          personal_due_date: null,
          scheduled_date: null,
          completed_date: null,
          priority: 'high',
          estimated_hours: 2,
          actual_hours: null,
          cost: null,
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      expect(validateMaintenanceTaskArray(data)).toEqual(data);
    });

    it('should throw error for non-array', () => {
      expect(() => validateMaintenanceTaskArray(null)).toThrow(
        'Expected an array'
      );
    });
  });

  describe('validateSalesHistoryArray', () => {
    it('should validate array of sales', () => {
      const data: SalesHistory[] = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          instrument_id: '123e4567-e89b-12d3-a456-426614174001',
          client_id: '123e4567-e89b-12d3-a456-426614174002',
          sale_price: 2500.0,
          sale_date: '2024-01-15',
          notes: 'Sold to customer',
          created_at: '2024-01-15T00:00:00Z',
        },
      ];

      expect(validateSalesHistoryArray(data)).toEqual(data);
    });

    it('should throw error for non-array', () => {
      expect(() => validateSalesHistoryArray(null)).toThrow(
        'Expected an array'
      );
    });
  });

  describe('safeValidate', () => {
    it('should return success for valid data', () => {
      const data: Client = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        last_name: 'Doe',
        first_name: 'John',
        contact_number: '123-456-7890',
        email: 'john@example.com',
        tags: ['vip'],
        interest: null,
        note: null,
        client_number: 'CL001',
        created_at: '2024-01-01T00:00:00Z',
      };

      const result = safeValidate(data, validateClient);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(data);
      }
    });

    it('should return error for invalid data', () => {
      const result = safeValidate(null, validateClient);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid Client');
      }
    });
  });
});
