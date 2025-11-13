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

export const getRelationshipTypeCounts = (
  groupedConnections: GroupedConnections
): RelationshipTypeCount[] => {
  return Object.entries(groupedConnections).map(([type, connections]) => ({
    type,
    count: connections.length,
  }));
};
