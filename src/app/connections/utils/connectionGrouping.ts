import { ClientInstrument } from '@/types';

export interface RelationshipTypeCount {
  type: string;
  count: number;
}

export interface GroupedConnections {
  [key: string]: ClientInstrument[];
}

export const groupConnectionsByType = (
  connections: ClientInstrument[]
): GroupedConnections => {
  return connections.reduce((acc, connection) => {
    const type = connection.relationship_type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(connection);
    return acc;
  }, {} as GroupedConnections);
};

// Fixed order for relationship types: Interested → Booked → Sold → Owned
const RELATIONSHIP_TYPE_ORDER: Record<string, number> = {
  Interested: 0,
  Booked: 1,
  Sold: 2,
  Owned: 3,
};

export const getRelationshipTypeCounts = (
  groupedConnections: GroupedConnections
): RelationshipTypeCount[] => {
  return Object.entries(groupedConnections)
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
