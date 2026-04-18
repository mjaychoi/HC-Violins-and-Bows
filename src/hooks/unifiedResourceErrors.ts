type UnifiedResourceErrorMap = {
  clients: unknown | null;
  instruments: unknown | null;
  connections: unknown | null;
};

export type UnifiedResourceErrors = UnifiedResourceErrorMap & {
  any: boolean;
  hasAnyError: boolean;
};

export function normalizeUnifiedResourceErrors(
  errors?: Partial<UnifiedResourceErrorMap> | null
): UnifiedResourceErrors {
  const normalized = {
    clients: errors?.clients ?? null,
    instruments: errors?.instruments ?? null,
    connections: errors?.connections ?? null,
  };
  const hasAnyError =
    Boolean(normalized.clients) ||
    Boolean(normalized.instruments) ||
    Boolean(normalized.connections);

  return {
    ...normalized,
    any: hasAnyError,
    hasAnyError,
  };
}
