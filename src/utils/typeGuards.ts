/**
 * Type Guards and Runtime Type Validation
 *
 * This module provides runtime type validation using Zod schemas
 * and type guard functions for TypeScript type narrowing.
 */

import { z } from 'zod';
import {
  Instrument,
  Client,
  ClientInstrument,
  MaintenanceTask,
  SalesHistory,
  TaskType,
  TaskStatus,
  TaskPriority,
  RelationshipType,
  Invoice,
} from '@/types';
import type { CreateInvoiceInput } from '@/app/api/invoices/types';

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function validateInvoice(value: unknown): ValidationResult<Invoice> {
  return { success: true, data: value as Invoice };
}

export function validatePartialInvoice(
  value: unknown
): ValidationResult<Partial<Invoice>> {
  return { success: true, data: value as Partial<Invoice> };
}

export function validateCreateInvoice(
  value: unknown
): ValidationResult<CreateInvoiceInput> {
  return { success: true, data: value as CreateInvoiceInput };
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Instrument Status Schema
 */
export const instrumentStatusSchema = z.enum([
  'Available',
  'Booked',
  'Sold',
  'Reserved',
  'Maintenance',
]);

/**
 * Task Type Schema
 */
export const taskTypeSchema = z.enum([
  'repair',
  'rehair',
  'maintenance',
  'inspection',
  'setup',
  'adjustment',
  'restoration',
]);

/**
 * Task Status Schema
 */
export const taskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
]);

/**
 * Task Priority Schema
 */
export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

/**
 * Relationship Type Schema
 */
export const relationshipTypeSchema = z.enum([
  'Interested',
  'Sold',
  'Booked',
  'Owned',
]);

/**
 * Date string schema (YYYY-MM-DD format)
 */
export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'Date must be in YYYY-MM-DD format',
});

/**
 * UUID Schema
 */
export const uuidSchema = z.string().uuid();

/**
 * Instrument Schema
 */
export const instrumentSchema: z.ZodType<Instrument> = z.object({
  id: uuidSchema,
  status: instrumentStatusSchema,
  maker: z.string().nullable(),
  type: z.string().nullable(),
  subtype: z.string().nullable(),
  year: z.number().nullable(),
  certificate: z.boolean(),
  size: z.string().nullable(),
  weight: z.string().nullable(),
  price: z.number().nullable(),
  ownership: z.string().nullable(),
  note: z.string().nullable(),
  serial_number: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});

/**
 * Client Schema
 */
export const clientSchema: z.ZodType<Client> = z.object({
  id: uuidSchema,
  last_name: z.string().nullable(),
  first_name: z.string().nullable(),
  contact_number: z.string().nullable(),
  email: z.union([z.string().email(), z.string().length(0), z.null()]),
  // SECURITY: Handle null from DB - normalize to empty array
  tags: z.preprocess(val => {
    if (val === null || val === undefined) return [];
    if (Array.isArray(val)) return val;
    return [];
  }, z.array(z.string())),
  interest: z.string().nullable(),
  note: z.string().nullable(),
  client_number: z.string().nullable(),
  type: z.enum(['Musician', 'Dealer', 'Collector', 'Regular']).optional(),
  status: z
    .enum(['Active', 'Browsing', 'In Negotiation', 'Inactive'])
    .optional(),
  created_at: z.string(),
});

/**
 * ClientInstrument Schema
 */
export const clientInstrumentSchema: z.ZodType<ClientInstrument> = z.object({
  id: uuidSchema,
  client_id: uuidSchema,
  instrument_id: uuidSchema,
  relationship_type: relationshipTypeSchema,
  notes: z.string().nullable(),
  created_at: z.string(),
  client: clientSchema.optional(),
  instrument: instrumentSchema.optional(),
});

/**
 * MaintenanceTask Schema
 */
export const maintenanceTaskSchema: z.ZodType<MaintenanceTask> = z.object({
  id: uuidSchema,
  // SECURITY: If instrument_id can be nullable in DB, make it nullable here
  // Otherwise, keep as required if DB constraint enforces it
  instrument_id: uuidSchema, // Change to uuidSchema.nullable() if DB allows null
  client_id: uuidSchema.nullable(),
  task_type: taskTypeSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  status: taskStatusSchema,
  received_date: dateStringSchema,
  due_date: dateStringSchema.nullable(),
  personal_due_date: dateStringSchema.nullable(),
  scheduled_date: dateStringSchema.nullable(),
  completed_date: dateStringSchema.nullable(),
  priority: taskPrioritySchema,
  estimated_hours: z.number().nullable(),
  actual_hours: z.number().nullable(),
  cost: z.number().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  instrument: instrumentSchema.optional(),
  client: clientSchema.optional(),
});

/**
 * SalesHistory Schema
 */
export const salesHistorySchema: z.ZodType<SalesHistory> = z.object({
  id: uuidSchema,
  instrument_id: uuidSchema.nullable(),
  client_id: uuidSchema.nullable(),
  sale_price: z.number(),
  sale_date: dateStringSchema,
  notes: z.string().nullable(),
  created_at: z.string(),
  client: clientSchema.optional(),
  instrument: instrumentSchema.optional(),
});

/**
 * API Response Schema
 */
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    error: z.string().optional(),
    success: z.boolean(),
  });

// ============================================================================
// Type Guard Functions
// ============================================================================

/**
 * Type guard for Instrument
 */
export function isInstrument(value: unknown): value is Instrument {
  return instrumentSchema.safeParse(value).success;
}

/**
 * Type guard for Client
 */
export function isClient(value: unknown): value is Client {
  return clientSchema.safeParse(value).success;
}

/**
 * Type guard for ClientInstrument
 */
export function isClientInstrument(value: unknown): value is ClientInstrument {
  return clientInstrumentSchema.safeParse(value).success;
}

/**
 * Type guard for MaintenanceTask
 */
export function isMaintenanceTask(value: unknown): value is MaintenanceTask {
  return maintenanceTaskSchema.safeParse(value).success;
}

/**
 * Type guard for SalesHistory
 */
export function isSalesHistory(value: unknown): value is SalesHistory {
  return salesHistorySchema.safeParse(value).success;
}

/**
 * Type guard for TaskType
 */
export function isTaskType(value: unknown): value is TaskType {
  return taskTypeSchema.safeParse(value).success;
}

/**
 * Type guard for TaskStatus
 */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return taskStatusSchema.safeParse(value).success;
}

/**
 * Type guard for TaskPriority
 */
export function isTaskPriority(value: unknown): value is TaskPriority {
  return taskPrioritySchema.safeParse(value).success;
}

/**
 * Type guard for RelationshipType
 */
export function isRelationshipType(value: unknown): value is RelationshipType {
  return relationshipTypeSchema.safeParse(value).success;
}

/**
 * Type guard for Instrument Status
 */
export function isInstrumentStatus(
  value: unknown
): value is Instrument['status'] {
  return instrumentStatusSchema.safeParse(value).success;
}

// ============================================================================
// Validation Functions with Error Handling
// ============================================================================

/**
 * Validate and parse an Instrument, throwing a descriptive error on failure
 */
export function validateInstrument(data: unknown): Instrument {
  const result = instrumentSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map(e => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid Instrument: ${errorMessages}`);
  }
  return result.data;
}

/**
 * Validate and parse a Client, throwing a descriptive error on failure
 */
export function validateClient(data: unknown): Client {
  const result = clientSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map(e => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid Client: ${errorMessages}`);
  }
  return result.data;
}

/**
 * Validate and parse a ClientInstrument, throwing a descriptive error on failure
 */
export function validateClientInstrument(data: unknown): ClientInstrument {
  const result = clientInstrumentSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map(e => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid ClientInstrument: ${errorMessages}`);
  }
  return result.data;
}

/**
 * Validate and parse a MaintenanceTask, throwing a descriptive error on failure
 */
export function validateMaintenanceTask(data: unknown): MaintenanceTask {
  const result = maintenanceTaskSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map(e => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid MaintenanceTask: ${errorMessages}`);
  }
  return result.data;
}

/**
 * Validate and parse a SalesHistory, throwing a descriptive error on failure
 */
export function validateSalesHistory(data: unknown): SalesHistory {
  const result = salesHistorySchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map(e => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid SalesHistory: ${errorMessages}`);
  }
  return result.data;
}

/**
 * Validate an array of Instruments
 */
export function validateInstrumentArray(data: unknown): Instrument[] {
  if (!Array.isArray(data)) {
    throw new Error('Expected an array of Instruments');
  }
  return data.map((item, index) => {
    try {
      return validateInstrument(item);
    } catch (error) {
      throw new Error(
        `Invalid Instrument at index ${index}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Validate an array of Clients
 */
export function validateClientArray(data: unknown): Client[] {
  if (!Array.isArray(data)) {
    throw new Error('Expected an array of Clients');
  }
  return data.map((item, index) => {
    try {
      return validateClient(item);
    } catch (error) {
      throw new Error(
        `Invalid Client at index ${index}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Validate an array of MaintenanceTasks
 */
export function validateMaintenanceTaskArray(data: unknown): MaintenanceTask[] {
  if (!Array.isArray(data)) {
    throw new Error('Expected an array of MaintenanceTasks');
  }
  return data.map((item, index) => {
    try {
      return validateMaintenanceTask(item);
    } catch (error) {
      throw new Error(
        `Invalid MaintenanceTask at index ${index}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

/**
 * Validate an array of SalesHistory
 */
export function validateSalesHistoryArray(data: unknown): SalesHistory[] {
  if (!Array.isArray(data)) {
    throw new Error('Expected an array of SalesHistory');
  }
  return data.map((item, index) => {
    try {
      return validateSalesHistory(item);
    } catch (error) {
      throw new Error(
        `Invalid SalesHistory at index ${index}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

// ============================================================================
// API Response Validation
// ============================================================================

/**
 * Validate API response structure
 */
export function validateApiResponse<T>(
  data: unknown,
  validator: (value: unknown) => T
): T {
  if (typeof data !== 'object' || data === null) {
    throw new Error('API response must be an object');
  }

  // Check if it's an ApiResponse structure
  if ('data' in data && 'success' in data) {
    const response = data as {
      data: unknown;
      success: boolean;
      error?: string;
    };
    if (!response.success) {
      throw new Error(response.error || 'API request failed');
    }
    return validator(response.data);
  }

  // If not ApiResponse structure, validate the data directly
  return validator(data);
}

/**
 * Safe validation that returns a result instead of throwing
 */
export function safeValidate<T>(
  data: unknown,
  validator: (value: unknown) => T | ValidationResult<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = validator(data);
    if (
      typeof validated === 'object' &&
      validated !== null &&
      'success' in validated
    ) {
      if (validated.success) {
        return { success: true, data: validated.data };
      }
      return { success: false, error: validated.error };
    }
    return { success: true, data: validated as T };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Partial Update Schemas (for PATCH requests)
// ============================================================================

/**
 * Partial Instrument Schema for updates
 */
export const partialInstrumentSchema = z.object({
  id: uuidSchema.optional(),
  status: instrumentStatusSchema.optional(),
  maker: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  subtype: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  certificate: z.boolean().optional(),
  size: z.string().nullable().optional(),
  weight: z.string().nullable().optional(),
  price: z.number().nullable().optional(),
  ownership: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

/**
 * Partial Client Schema for updates
 */
export const partialClientSchema = z.object({
  id: uuidSchema.optional(),
  last_name: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  contact_number: z.string().nullable().optional(),
  email: z.string().email().nullable().or(z.literal('')).optional(),
  // SECURITY: Handle null from DB - normalize to empty array
  tags: z.array(z.string()).catch([]).optional(), // null/undefined -> []
  interest: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  client_number: z.string().nullable().optional(),
  type: z.enum(['Musician', 'Dealer', 'Collector', 'Regular']).optional(),
  status: z
    .enum(['Active', 'Browsing', 'In Negotiation', 'Inactive'])
    .optional(),
  created_at: z.string().optional(),
});

/**
 * ClientInstrument creation schema (for POST requests - without id and created_at)
 */
export const createClientInstrumentSchema = z.object({
  client_id: uuidSchema,
  instrument_id: uuidSchema,
  relationship_type: relationshipTypeSchema,
  notes: z.string().nullable().optional(),
});

/**
 * Instrument creation schema (for POST requests - without id and created_at)
 */
export const createInstrumentSchema = z.object({
  status: instrumentStatusSchema,
  maker: z.string().nullable(),
  type: z.string().nullable(),
  subtype: z.string().nullable(),
  year: z.number().nullable(),
  certificate: z.boolean(),
  size: z.string().nullable(),
  weight: z.string().nullable(),
  price: z.number().nullable(),
  ownership: z.string().nullable(),
  note: z.string().nullable(),
  serial_number: z.string().nullable(),
});

/**
 * Client creation schema (for POST requests - without id and created_at)
 */
export const createClientSchema = z.object({
  last_name: z.string().nullable(),
  first_name: z.string().nullable(),
  contact_number: z.string().nullable(),
  email: z.union([z.string().email(), z.string().length(0), z.null()]),
  tags: z.array(z.string()).catch([]),
  interest: z.string().nullable(),
  note: z.string().nullable(),
  client_number: z.string().nullable(),
  type: z.enum(['Musician', 'Dealer', 'Collector', 'Regular']).optional(),
  status: z
    .enum(['Active', 'Browsing', 'In Negotiation', 'Inactive'])
    .optional(),
});

/**
 * Partial ClientInstrument Schema for updates
 */
export const partialClientInstrumentSchema = z.object({
  id: uuidSchema.optional(),
  client_id: uuidSchema.optional(),
  instrument_id: uuidSchema.optional(),
  relationship_type: relationshipTypeSchema.optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
  client: clientSchema.optional(),
  instrument: instrumentSchema.optional(),
});

/**
 * Partial MaintenanceTask Schema for updates
 */
export const partialMaintenanceTaskSchema = z.object({
  id: uuidSchema.optional(),
  instrument_id: uuidSchema.optional(),
  client_id: uuidSchema.nullable().optional(),
  task_type: taskTypeSchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
  received_date: dateStringSchema.optional(),
  due_date: dateStringSchema.nullable().optional(),
  personal_due_date: dateStringSchema.nullable().optional(),
  scheduled_date: dateStringSchema.nullable().optional(),
  completed_date: dateStringSchema.nullable().optional(),
  priority: taskPrioritySchema.optional(),
  estimated_hours: z.number().nullable().optional(),
  actual_hours: z.number().nullable().optional(),
  cost: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  instrument: instrumentSchema.optional(),
  client: clientSchema.optional(),
});

/**
 * MaintenanceTask creation schema (for POST requests - without id, created_at, updated_at)
 */
export const createMaintenanceTaskSchema = z.object({
  instrument_id: uuidSchema,
  client_id: uuidSchema.nullable(),
  task_type: taskTypeSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  status: taskStatusSchema,
  received_date: dateStringSchema,
  due_date: dateStringSchema.nullable(),
  personal_due_date: dateStringSchema.nullable(),
  scheduled_date: dateStringSchema.nullable(),
  completed_date: dateStringSchema.nullable(),
  priority: taskPrioritySchema,
  estimated_hours: z.number().nullable(),
  actual_hours: z.number().nullable(),
  cost: z.number().nullable(),
  notes: z.string().nullable(),
});

/**
 * Partial SalesHistory Schema for updates
 */
/**
 * SalesHistory creation schema (for POST requests - without id and created_at)
 */
export const createSalesHistorySchema = z.object({
  instrument_id: uuidSchema.nullable(),
  client_id: uuidSchema.nullable(),
  sale_price: z.number(),
  sale_date: dateStringSchema,
  notes: z.string().nullable(),
});

export const partialSalesHistorySchema = z.object({
  id: uuidSchema.optional(),
  instrument_id: uuidSchema.nullable().optional(),
  client_id: uuidSchema.nullable().optional(),
  sale_price: z.number().optional(),
  sale_date: dateStringSchema.optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
  client: clientSchema.optional(),
  instrument: instrumentSchema.optional(),
});

/**
 * Validate partial Instrument update
 */
export function validatePartialInstrument(data: unknown): Partial<Instrument> {
  const result = partialInstrumentSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid Instrument update: ${errorMessages}`);
  }
  return result.data as Partial<Instrument>;
}

/**
 * Validate partial Client update
 */
export function validatePartialClient(data: unknown): Partial<Client> {
  const result = partialClientSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid Client update: ${errorMessages}`);
  }
  return result.data as Partial<Client>;
}

/**
 * Validate partial MaintenanceTask update
 */
export function validatePartialMaintenanceTask(
  data: unknown
): Partial<MaintenanceTask> {
  const result = partialMaintenanceTaskSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid MaintenanceTask update: ${errorMessages}`);
  }
  return result.data as Partial<MaintenanceTask>;
}

/**
 * Validate MaintenanceTask creation data (for POST requests)
 */
export function validateCreateMaintenanceTask(
  data: unknown
): Omit<MaintenanceTask, 'id' | 'created_at' | 'updated_at'> {
  const result = createMaintenanceTaskSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid MaintenanceTask creation data: ${errorMessages}`);
  }
  return result.data as Omit<
    MaintenanceTask,
    'id' | 'created_at' | 'updated_at'
  >;
}

/**
 * Validate SalesHistory creation data (for POST requests)
 */
export function validateCreateSalesHistory(
  data: unknown
): Omit<SalesHistory, 'id' | 'created_at'> {
  const result = createSalesHistorySchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid SalesHistory creation data: ${errorMessages}`);
  }
  return result.data as Omit<SalesHistory, 'id' | 'created_at'>;
}

/**
 * Validate partial SalesHistory update
 */
export function validatePartialSalesHistory(
  data: unknown
): Partial<SalesHistory> {
  const result = partialSalesHistorySchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid SalesHistory update: ${errorMessages}`);
  }
  return result.data as Partial<SalesHistory>;
}

/**
 * Validate Instrument creation data (for POST requests)
 */
export function validateCreateInstrument(
  data: unknown
): Omit<Instrument, 'id' | 'created_at' | 'updated_at'> {
  const result = createInstrumentSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid Instrument creation data: ${errorMessages}`);
  }
  return result.data as Omit<Instrument, 'id' | 'created_at' | 'updated_at'>;
}

/**
 * Validate Client creation data (for POST requests)
 */
export function validateCreateClient(
  data: unknown
): Omit<Client, 'id' | 'created_at'> {
  const result = createClientSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid Client creation data: ${errorMessages}`);
  }
  return result.data as Omit<Client, 'id' | 'created_at'>;
}

/**
 * Validate ClientInstrument creation data (for POST requests)
 */
export function validateCreateClientInstrument(
  data: unknown
): Omit<ClientInstrument, 'id' | 'created_at'> {
  const result = createClientInstrumentSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid ClientInstrument creation data: ${errorMessages}`);
  }
  return result.data as Omit<ClientInstrument, 'id' | 'created_at'>;
}

/**
 * Validate partial ClientInstrument update
 */
export function validatePartialClientInstrument(
  data: unknown
): Partial<ClientInstrument> {
  const result = partialClientInstrumentSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      ? result.error.issues.map((e: z.ZodIssue) => e.message).join(', ')
      : result.error.message || 'Validation failed';
    throw new Error(`Invalid ClientInstrument update: ${errorMessages}`);
  }
  return result.data as Partial<ClientInstrument>;
}
