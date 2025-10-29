// src/app/clients/utils/__tests__/clientUtils.simple.test.ts
import {
  formatClientName,
  formatClientContact,
  getClientInitials,
  isClientComplete,
} from '../clientUtils';

// Mock Client type for testing
interface MockClient {
  id: string;
  first_name: string;
  last_name: string;
  contact_number: string;
  email: string;
  tags: string[];
  interest: string;
  note: string;
  created_at: string;
}

describe('Client Utils - Simple Tests', () => {
  const mockClient: MockClient = {
    id: '1',
    first_name: 'John',
    last_name: 'Doe',
    contact_number: '123-456-7890',
    email: 'john@example.com',
    tags: ['Owner', 'Musician'],
    interest: 'Active',
    note: 'Test note',
    created_at: new Date().toISOString(),
  };

  test('should format client name correctly', () => {
    const result = formatClientName(mockClient);
    expect(result).toBe('John Doe');
  });

  test('should handle missing first name', () => {
    const client = { ...mockClient, first_name: '' };
    const result = formatClientName(client);
    expect(result).toBe('Doe');
  });

  test('should handle missing last name', () => {
    const client = { ...mockClient, last_name: '' };
    const result = formatClientName(client);
    expect(result).toBe('John');
  });

  test('should handle missing both names', () => {
    const client = { ...mockClient, first_name: '', last_name: '' };
    const result = formatClientName(client);
    expect(result).toBe('Unknown Client');
  });

  test('should format client contact with phone number only', () => {
    const result = formatClientContact(mockClient);
    expect(result).toBe('123-456-7890');
  });

  test('should handle missing phone', () => {
    const client = { ...mockClient, contact_number: '' };
    const result = formatClientContact(client);
    expect(result).toBe('No contact info');
  });

  test('should handle missing phone with email present', () => {
    const client = {
      ...mockClient,
      contact_number: '',
      email: 'john@example.com',
    };
    const result = formatClientContact(client);
    expect(result).toBe('No contact info');
  });

  test('should handle missing both contact info', () => {
    const client = { ...mockClient, email: '', contact_number: '' };
    const result = formatClientContact(client);
    expect(result).toBe('No contact info');
  });

  test('should return initials for full name', () => {
    const result = getClientInitials(mockClient);
    expect(result).toBe('JD');
  });

  test('should handle single name', () => {
    const client = { ...mockClient, first_name: '' };
    const result = getClientInitials(client);
    expect(result).toBe('D');
  });

  test('should handle no names', () => {
    const client = { ...mockClient, first_name: '', last_name: '' };
    const result = getClientInitials(client);
    expect(result).toBe('U');
  });

  test('should return true for complete client', () => {
    const result = isClientComplete(mockClient);
    expect(result).toBe(true);
  });

  test('should return false for incomplete client', () => {
    const client = { ...mockClient, first_name: '', last_name: '' };
    const result = isClientComplete(client);
    expect(result).toBe(false);
  });
});
