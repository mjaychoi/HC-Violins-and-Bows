import { useState, useMemo } from 'react';
import { ClientInstrument, RelationshipType } from '@/types';
import {
  groupConnectionsByType,
  getRelationshipTypeCounts,
} from '../utils/connectionGrouping';

export const useConnectionFilters = (connections: ClientInstrument[]) => {
  // FIXED: Use RelationshipType instead of string
  const [selectedFilter, setSelectedFilter] = useState<RelationshipType | null>(
    null
  );

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
