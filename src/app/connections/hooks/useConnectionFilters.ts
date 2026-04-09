import { useState, useMemo, useEffect } from 'react';
import { ClientInstrument, RelationshipType } from '@/types';
import {
  groupConnectionsByType,
  getRelationshipTypeCounts,
} from '../utils/connectionGrouping';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

export const useConnectionFilters = (connections: ClientInstrument[]) => {
  // FIXED: Use RelationshipType instead of string
  const [selectedFilter, setSelectedFilter] = useState<RelationshipType | null>(
    null
  );
  const { tenantIdentityKey } = useTenantIdentity();

  const groupedConnections = useMemo(
    () => groupConnectionsByType(connections),
    [connections]
  );

  const relationshipTypeCounts = useMemo(
    () => getRelationshipTypeCounts(groupedConnections),
    [groupedConnections]
  );

  useEffect(() => {
    setSelectedFilter(null);
  }, [tenantIdentityKey]);

  return {
    selectedFilter,
    setSelectedFilter,
    groupedConnections,
    relationshipTypeCounts,
  };
};
