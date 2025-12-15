// src/app/clients/hooks/index.ts
// Export all custom hooks from a single entry point
export * from './useClientInstruments';
export * from './useFilters';
export * from './useClientView';
export * from './useInstrumentSearch';
export * from './useOwnedItems';
export * from './useContactLogs';
// Note: useClientsContactInfo is imported directly in components to avoid webpack issues
// export * from './useClientsContactInfo';
