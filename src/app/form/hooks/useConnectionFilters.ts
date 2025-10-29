import { useState } from 'react';
import { ClientInstrument } from '@/types';
import {
  groupConnectionsByType,
  getRelationshipTypeCounts,
} from '../utils/connectionGrouping';

export const useConnectionFilters = (connections: ClientInstrument[]) => {
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  const groupedConnections = groupConnectionsByType(connections);
  const relationshipTypeCounts = getRelationshipTypeCounts(groupedConnections);

  return {
    selectedFilter,
    setSelectedFilter,
    groupedConnections,
    relationshipTypeCounts,
  };
};
