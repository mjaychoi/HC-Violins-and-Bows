// src/app/clients/utils/clientUtils.ts
import { Client } from '@/types';
import { FilterState } from '../types';
import { HAS_INSTRUMENTS_FILTER_OPTIONS } from '../constants';

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
const ensureArray = <T>(value?: T[] | null): T[] =>
  Array.isArray(value) ? value : [];

export const filterClients = (
  clients: Client[],
  searchTerm: string,
  filters: FilterState,
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
        client.note?.toLowerCase().includes(searchLower) ||
        client.client_number?.toLowerCase().includes(searchLower) ||
        client.tags?.some(tag => tag.toLowerCase().includes(searchLower));

      if (!matchesSearch) return false;
    }

    // Filter by specific fields
    const lastNameFilters = ensureArray(filters.last_name);
    if (
      lastNameFilters.length > 0 &&
      !lastNameFilters.includes(client.last_name || '')
    ) {
      return false;
    }
    const firstNameFilters = ensureArray(filters.first_name);
    if (
      firstNameFilters.length > 0 &&
      !firstNameFilters.includes(client.first_name || '')
    ) {
      return false;
    }
    const contactNumberFilters = ensureArray(filters.contact_number);
    if (
      contactNumberFilters.length > 0 &&
      !contactNumberFilters.includes(client.contact_number || '')
    ) {
      return false;
    }
    const emailFilters = ensureArray(filters.email);
    if (emailFilters.length > 0 && !emailFilters.includes(client.email || '')) {
      return false;
    }
    const tagFilters = ensureArray(filters.tags);
    if (
      tagFilters.length > 0 &&
      !tagFilters.some(tag => client.tags?.includes(tag))
    ) {
      return false;
    }
    const interestFilters = ensureArray(filters.interest);
    if (
      interestFilters.length > 0 &&
      !interestFilters.includes(client.interest || '')
    ) {
      return false;
    }

    // hasInstruments filter
    // UI에서 최대 1개만 선택되도록 보장됨 (0개 또는 2개는 필터 미적용)
    // 선택된 옵션이 정확히 1개일 때만 필터 적용
    const hasInstrumentsFilters = ensureArray(filters.hasInstruments);
    if (hasInstrumentsFilters.length === 1) {
      const has = withInst.has(client.id);
      if (
        hasInstrumentsFilters[0] === HAS_INSTRUMENTS_FILTER_OPTIONS.HAS &&
        !has
      )
        return false;
      if (hasInstrumentsFilters[0] === HAS_INSTRUMENTS_FILTER_OPTIONS.NO && has)
        return false;
    }

    return true;
  });
};

// Overloads: Client 전용(기본 키 제공) + 제네릭 버전
export function sortClients(
  clients: Client[],
  field?: keyof Client,
  order?: 'asc' | 'desc'
): Client[];
export function sortClients<T extends object>(
  clients: T[],
  field: keyof T,
  order?: 'asc' | 'desc'
): T[];
export function sortClients<T extends object>(
  clients: T[],
  field?: keyof T,
  order: 'asc' | 'desc' = 'asc'
): T[] {
  const copy = [...clients];
  const dir = order === 'asc' ? 1 : -1;

  return copy.sort((a, b) => {
    const sortField = field ?? ('first_name' as unknown as keyof T);
    const av = (a as unknown as Record<string, unknown>)?.[
      sortField as unknown as string
    ];
    const bv = (b as unknown as Record<string, unknown>)?.[
      sortField as unknown as string
    ];

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
}
