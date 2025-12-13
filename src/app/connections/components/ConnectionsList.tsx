import { memo, useMemo } from 'react';
import { ClientInstrument } from '@/types';
import { GroupedConnections } from '../utils/connectionGrouping';
import { RelationshipSectionHeader } from './RelationshipSectionHeader';
import { ConnectionCard } from './ConnectionCard';
import { Pagination } from '@/components/common';

interface ConnectionsListProps {
  groupedConnections: GroupedConnections;
  selectedFilter: string | null;
  onDeleteConnection: (connection: ClientInstrument) => void;
  onEditConnection: (connection: ClientInstrument) => void;
  // Pagination
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
}

export const ConnectionsList = memo(function ConnectionsList({
  groupedConnections,
  selectedFilter,
  onDeleteConnection,
  onEditConnection,
  currentPage = 1,
  pageSize = 20,
  onPageChange,
  loading = false,
}: ConnectionsListProps) {
  // memoized filtered connections
  const filteredConnections = useMemo(() => {
    return Object.entries(groupedConnections).filter(
      ([type]) => selectedFilter === null || selectedFilter === type
    );
  }, [groupedConnections, selectedFilter]);

  // 모든 연결을 평탄화하여 페이지네이션 적용
  const allConnections = useMemo(() => {
    return filteredConnections.flatMap(([, connections]) => connections);
  }, [filteredConnections]);

  // 페이지네이션 계산
  const totalConnections = allConnections.length;
  const totalPages = Math.ceil(totalConnections / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedConnections = allConnections.slice(startIndex, endIndex);

  // 페이지네이션된 연결을 다시 그룹화
  const paginatedGroupedConnections = useMemo(() => {
    const grouped: GroupedConnections = {};
    paginatedConnections.forEach(connection => {
      const type = connection.relationship_type;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(connection);
    });
    return grouped;
  }, [paginatedConnections]);

  return (
    <div className="space-y-6">
      {Object.entries(paginatedGroupedConnections).map(
        ([type, connections]) => (
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
        )
      )}

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div className="border-t border-gray-200 pt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            loading={loading}
            totalCount={totalConnections}
            pageSize={pageSize}
          />
        </div>
      )}
    </div>
  );
});
