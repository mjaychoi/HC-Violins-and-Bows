// src/app/clients/utils/clientUtils.ts
import { Client } from '@/types';

// Client utility functions
export const formatClientName = (client: Client): string => {
  const firstName = client.first_name || '';
  const lastName = client.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || 'Unknown Client';
};

export const formatClientContact = (client: Client): string => {
  return client.contact_number || 'No contact info';
};

export const getClientInitials = (client: Client): string => {
  const firstName = client.first_name || '';
  const lastName = client.last_name || '';
  const firstInitial = firstName.charAt(0).toUpperCase();
  const lastInitial = lastName.charAt(0).toUpperCase();
  const initials = `${firstInitial}${lastInitial}`;
  return initials || 'U';
};

export const isClientComplete = (client: Client): boolean => {
  return !!(
    client.first_name &&
    client.last_name &&
    (client.contact_number || client.email)
  );
};

export const getClientDisplayInfo = (client: Client) => {
  return {
    name: formatClientName(client),
    contact: formatClientContact(client),
    initials: getClientInitials(client),
    isComplete: isClientComplete(client),
  };
};

// Search and filter functions
export const filterClients = (
  clients: Client[],
  searchTerm: string,
  filters: Record<string, string[]>,
  opts?: { clientsWithInstruments?: Set<string> }
): Client[] => {
  const withInst = opts?.clientsWithInstruments ?? new Set<string>();
  return clients.filter(client => {
    // Text search
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        client.first_name?.toLowerCase().includes(searchLower) ||
        client.last_name?.toLowerCase().includes(searchLower) ||
        client.contact_number?.toLowerCase().includes(searchLower) ||
        client.email?.toLowerCase().includes(searchLower) ||
        client.interest?.toLowerCase().includes(searchLower) ||
        client.note?.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;
    }

    // Filter by specific fields
    if (
      filters.last_name.length > 0 &&
      !filters.last_name.includes(client.last_name || '')
    ) {
      return false;
    }
    if (
      filters.first_name.length > 0 &&
      !filters.first_name.includes(client.first_name || '')
    ) {
      return false;
    }
    if (
      filters.contact_number.length > 0 &&
      !filters.contact_number.includes(client.contact_number || '')
    ) {
      return false;
    }
    if (
      filters.email.length > 0 &&
      !filters.email.includes(client.email || '')
    ) {
      return false;
    }
    if (
      filters.tags.length > 0 &&
      !filters.tags.some(tag => client.tags?.includes(tag))
    ) {
      return false;
    }
    if (
      filters.interest.length > 0 &&
      !filters.interest.includes(client.interest || '')
    ) {
      return false;
    }

    // hasInstruments filter
    if (filters.hasInstruments && filters.hasInstruments.length > 0) {
      const has = withInst.has(client.id);
      if (filters.hasInstruments.includes('Has Instruments') && !has)
        return false;
      if (filters.hasInstruments.includes('No Instruments') && has)
        return false;
    }

    return true;
  });
};

export const sortClients = <T extends { [k: string]: unknown }>(
  clients: T[],
  field: keyof T = 'first_name',
  order: 'asc' | 'desc' = 'asc'
): T[] => {
  const copy = [...clients];
  const dir = order === 'asc' ? 1 : -1;

  return copy.sort((a, b) => {
    const av = a?.[field];
    const bv = b?.[field];

    // null/undefined는 뒤로
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    // 문자열 비교는 대소문자 무시
    const aa = typeof av === 'string' ? av.toLowerCase() : av;
    const bb = typeof bv === 'string' ? bv.toLowerCase() : bv;

    if (aa < bb) return -1 * dir;
    if (aa > bb) return 1 * dir;

    // 2차키: last_name으로 안정 정렬
    const as2 = (a as { last_name?: string }).last_name?.toLowerCase?.() ?? '';
    const bs2 = (b as { last_name?: string }).last_name?.toLowerCase?.() ?? '';
    if (as2 < bs2) return -1 * dir;
    if (as2 > bs2) return 1 * dir;
    return 0;
  });
};
