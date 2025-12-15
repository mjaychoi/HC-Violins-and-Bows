import { ClientInstrument, RelationshipType } from '@/types';

// Relationship type constants - single source of truth
export const RELATIONSHIP_TYPES: RelationshipType[] = [
  'Interested',
  'Booked',
  'Sold',
  'Owned',
];

// Fixed order for relationship types: Interested → Booked → Sold → Owned
export const RELATIONSHIP_TYPE_ORDER: Record<RelationshipType, number> = {
  Interested: 0,
  Booked: 1,
  Sold: 2,
  Owned: 3,
};

// FIXED: Use RelationshipType instead of string for type safety
export interface RelationshipTypeCount {
  type: RelationshipType;
  count: number;
}

// FIXED: Use Partial because not all relationship types may be present
export type GroupedConnections = Partial<
  Record<RelationshipType, ClientInstrument[]>
>;

export const groupConnectionsByType = (
  connections: ClientInstrument[]
): GroupedConnections => {
  // Sort connections by display_order before grouping
  const sortedConnections = sortConnectionsByOrder(connections);

  return sortedConnections.reduce((acc, connection) => {
    const type = connection.relationship_type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type]?.push(connection);
    return acc;
  }, {} as GroupedConnections);
};

// Sort connections by display_order, then by created_at
export const sortConnectionsByOrder = (
  connections: ClientInstrument[]
): ClientInstrument[] => {
  return [...connections].sort((a, b) => {
    // First sort by display_order (if available)
    const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    // Fallback to created_at if display_order is the same
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
};

export const getRelationshipTypeCounts = (
  groupedConnections: GroupedConnections
): RelationshipTypeCount[] => {
  return (
    Object.entries(groupedConnections) as [
      RelationshipType,
      ClientInstrument[],
    ][]
  )
    .map(([type, connections]) => ({
      type,
      count: connections.length,
    }))
    .sort((a, b) => {
      const orderA = RELATIONSHIP_TYPE_ORDER[a.type] ?? 999;
      const orderB = RELATIONSHIP_TYPE_ORDER[b.type] ?? 999;
      return orderA - orderB;
    });
};

/**
 * Sort connections for All tab display
 * Priority: relationship_type → client name → instrument maker/type
 */
export const sortConnectionsForAllTab = (
  connections: ClientInstrument[]
): ClientInstrument[] => {
  return [...connections].sort((a, b) => {
    // 1. Relationship type order
    const typeOrderA = RELATIONSHIP_TYPE_ORDER[a.relationship_type] ?? 999;
    const typeOrderB = RELATIONSHIP_TYPE_ORDER[b.relationship_type] ?? 999;
    if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;

    // 2. Display order (within same relationship type)
    const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;

    // 3. Client last name
    const lastNameA = a.client?.last_name ?? '';
    const lastNameB = b.client?.last_name ?? '';
    const lastNameCompare = lastNameA.localeCompare(lastNameB);
    if (lastNameCompare !== 0) return lastNameCompare;

    // 4. Client first name
    const firstNameA = a.client?.first_name ?? '';
    const firstNameB = b.client?.first_name ?? '';
    const firstNameCompare = firstNameA.localeCompare(firstNameB);
    if (firstNameCompare !== 0) return firstNameCompare;

    // 5. Instrument maker
    const makerA = a.instrument?.maker ?? '';
    const makerB = b.instrument?.maker ?? '';
    const makerCompare = makerA.localeCompare(makerB);
    if (makerCompare !== 0) return makerCompare;

    // 6. Instrument type
    const typeA = a.instrument?.type ?? '';
    const typeB = b.instrument?.type ?? '';
    return typeA.localeCompare(typeB);
  });
};

/**
 * Group connections by client (for Client-unit card display)
 * Returns a map of client_id -> connections array
 */
export interface ClientGroupedConnections {
  [clientId: string]: ClientInstrument[];
}

export const groupConnectionsByClient = (
  connections: ClientInstrument[]
): ClientGroupedConnections => {
  return connections.reduce((acc, connection) => {
    const clientId = connection.client_id;
    if (!acc[clientId]) {
      acc[clientId] = [];
    }
    acc[clientId].push(connection);
    return acc;
  }, {} as ClientGroupedConnections);
};
