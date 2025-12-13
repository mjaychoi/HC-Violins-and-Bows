// Utility functions exports
// NOTE: apiClient and supabaseHelpers are NOT exported here to prevent dependency leakage
// Import them directly from their modules when needed:
//   import { apiClient } from '@/utils/apiClient';
//   import { escapeILike } from '@/utils/supabaseHelpers';

export * from './validationUtils';
export * from './inputValidation';
export * from './browserNotifications';
export * from './formatUtils';
export * from './classNames';
export * from './errorHandler';
export * from './logger';
export * from './errorSanitization';
// Removed: export * from './supabaseHelpers'; // Prevents Supabase SDK from being included in all pages
// Removed: export * from './apiClient'; // Prevents Supabase SDK from being included in all pages
export * from './filters';
export * from './filterUI';
export * from './typeGuards';
export * from './responsive';
