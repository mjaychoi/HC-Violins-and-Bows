import { memo, useMemo } from 'react';
import { ClientInstrument } from '@/types';
import { GroupedConnections } from '../utils/connectionGrouping';
import { RelationshipSectionHeader } from './RelationshipSectionHeader';
import { ConnectionCard } from './ConnectionCard';

interface ConnectionsListProps {
  groupedConnections: GroupedConnections;
  selectedFilter: string | null;
  onDeleteConnection: (connectionId: string) => void;
  onEditConnection: (connection: ClientInstrument) => void;
}

export const ConnectionsList = memo(function ConnectionsList({
  groupedConnections,
  selectedFilter,
  onDeleteConnection,
  onEditConnection,
}: ConnectionsListProps) {
  // memoized filtered connections
  const filteredConnections = useMemo(() => {
    return Object.entries(groupedConnections).filter(
      ([type]) => selectedFilter === null || selectedFilter === type
    );
  }, [groupedConnections, selectedFilter]);

  return (
    <div className="space-y-6">
      {filteredConnections.map(([type, connections]) => (
        <div key={type}>
          <RelationshipSectionHeader type={type} count={connections.length} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 lg:gap-x-6 gap-y-4">
            {connections.map(connection => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                onDelete={onDeleteConnection}
                onEdit={onEditConnection}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});
