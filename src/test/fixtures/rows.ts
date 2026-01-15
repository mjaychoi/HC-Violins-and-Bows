import type { ClientInstrument } from '@/types';

type AnyRow = object;

export interface NormalizedRowDefaults {
  certificate_name: string | null;
  cost_price: number | null;
  consignment_price: number | null;
  updated_at: string | null;
  clients: ClientInstrument[];
  client_ids: string[];
  client_names: string[];
}

export function withNormalizedDefaults<T extends AnyRow>(
  row: T
): T & NormalizedRowDefaults {
  return {
    certificate_name: null,
    cost_price: null,
    consignment_price: null,
    updated_at: null,
    clients: [],
    client_ids: [],
    client_names: [],
    ...row,
  };
}
