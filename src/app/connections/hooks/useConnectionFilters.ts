import { useState, useMemo } from 'react';
import { ClientInstrument } from '@/types';
import {
  groupConnectionsByType,
  getRelationshipTypeCounts,
} from '../utils/connectionGrouping';

export const useConnectionFilters = (connections: ClientInstrument[]) => {
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  const groupedConnections = useMemo(
    () => groupConnectionsByType(connections),
    [connections]
  );

  const relationshipTypeCounts = useMemo(
    () => getRelationshipTypeCounts(groupedConnections),
    [groupedConnections]
  );

  return {
    selectedFilter,
    setSelectedFilter,
    groupedConnections,
    relationshipTypeCounts,
  };
};
