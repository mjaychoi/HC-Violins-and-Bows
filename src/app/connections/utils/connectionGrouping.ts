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
  return connections.reduce((acc, connection) => {
    const type = connection.relationship_type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type]?.push(connection);
    return acc;
  }, {} as GroupedConnections);
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
    const orderA = RELATIONSHIP_TYPE_ORDER[a.relationship_type] ?? 999;
    const orderB = RELATIONSHIP_TYPE_ORDER[b.relationship_type] ?? 999;
    if (orderA !== orderB) return orderA - orderB;

    // 2. Client last name
    const lastNameA = a.client?.last_name ?? '';
    const lastNameB = b.client?.last_name ?? '';
    const lastNameCompare = lastNameA.localeCompare(lastNameB);
    if (lastNameCompare !== 0) return lastNameCompare;

    // 3. Client first name
    const firstNameA = a.client?.first_name ?? '';
    const firstNameB = b.client?.first_name ?? '';
    const firstNameCompare = firstNameA.localeCompare(firstNameB);
    if (firstNameCompare !== 0) return firstNameCompare;

    // 4. Instrument maker
    const makerA = a.instrument?.maker ?? '';
    const makerB = b.instrument?.maker ?? '';
    const makerCompare = makerA.localeCompare(makerB);
    if (makerCompare !== 0) return makerCompare;

    // 5. Instrument type
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
