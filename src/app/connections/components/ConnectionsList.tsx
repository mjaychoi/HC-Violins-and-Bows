import { memo, useMemo } from 'react';
import { ClientInstrument, RelationshipType } from '@/types';
import {
  GroupedConnections,
  sortConnectionsForAllTab,
} from '../utils/connectionGrouping';
import { RelationshipSectionHeader } from './RelationshipSectionHeader';
import { SortableConnectionCard } from './SortableConnectionCard';
import { Pagination } from '@/components/common';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface ConnectionsListProps {
  groupedConnections: GroupedConnections;
  selectedFilter: RelationshipType | null;
  onDeleteConnection: (connection: ClientInstrument) => void;
  onEditConnection: (connection: ClientInstrument) => void;
  // Note: onConnectionTypeChange is handled at page level via FilterBar tabs
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
  // Note: Drag over state is now handled at the page level (FilterBar tabs)
  // Section headers in All tab still use droppable but visual feedback is handled by parent
  // FIXED: A안 - All 탭은 flat list, 필터 선택 시 섹션 유지
  const isAll = selectedFilter === null;

  // 필터링된 entries (All이면 모든 타입, 필터 선택 시 해당 타입만)
  const filteredEntries = useMemo(
    () =>
      (
        Object.entries(groupedConnections) as [
          RelationshipType,
          ClientInstrument[],
        ][]
      ).filter(([type]) => isAll || type === selectedFilter),
    [groupedConnections, isAll, selectedFilter]
  );

  // All 탭: 모든 연결을 평탄화하고 정렬 (페이지네이션 기준)
  const flatConnections = useMemo(() => {
    if (!isAll) return [];
    const all = filteredEntries.flatMap(([, connections]) => connections);
    return sortConnectionsForAllTab(all);
  }, [filteredEntries, isAll]);

  // 필터 선택 시: 해당 타입의 연결만
  const filteredTypeConnections = useMemo(() => {
    if (isAll) return [];
    const entry = filteredEntries.find(([type]) => type === selectedFilter);
    return entry ? entry[1] : [];
  }, [filteredEntries, isAll, selectedFilter]);

  // 공통 pagination 계산 - 하나의 배열만 사용
  const connectionsToPaginate = useMemo(() => {
    if (isAll) return flatConnections;
    return filteredTypeConnections;
  }, [isAll, flatConnections, filteredTypeConnections]);

  const totalCount = connectionsToPaginate.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return connectionsToPaginate.slice(start, start + pageSize);
  }, [connectionsToPaginate, currentPage, pageSize]);

  // All 탭에서 페이지네이션된 연결을 타입별로 그룹화
  const paginatedConnectionsByType = useMemo(() => {
    if (!isAll) return {};

    const grouped: Record<RelationshipType, ClientInstrument[]> = {
      Interested: [],
      Sold: [],
      Booked: [],
      Owned: [],
    };

    pageItems.forEach(connection => {
      const type = connection.relationship_type;
      if (type in grouped) {
        grouped[type].push(connection);
      }
    });

    return grouped;
  }, [isAll, pageItems]);

  return (
    <div className="space-y-4">
      {isAll
        ? // All 탭: 모든 relationship 타입별 섹션 표시, 드래그로 타입 변경 가능 (페이지네이션 적용)
          (
            Object.entries(paginatedConnectionsByType) as [
              RelationshipType,
              ClientInstrument[],
            ][]
          ).map(([type, connections]) => {
            if (connections.length === 0) return null;

            return (
              <div key={type}>
                <RelationshipSectionHeader
                  type={type}
                  count={groupedConnections[type]?.length || 0}
                  isOver={false}
                />
                <SortableContext
                  items={connections.map(c => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 lg:gap-x-4 gap-y-4">
                    {connections.map(connection => (
                      <SortableConnectionCard
                        key={connection.id}
                        connection={connection}
                        onDelete={onDeleteConnection}
                        onEdit={onEditConnection}
                        isOver={false}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            );
          })
        : // 필터 선택 시: 섹션 헤더 유지 (해당 타입의 연결만 페이지네이션)
          filteredEntries.map(([type]) => {
            // 현재 필터와 일치하는 타입만 표시
            if (type !== selectedFilter) return null;

            return (
              <div key={type}>
                <RelationshipSectionHeader type={type} count={totalCount} />
                <SortableContext
                  items={pageItems.map(c => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 lg:gap-x-4 gap-y-4">
                    {pageItems.map(connection => (
                      <SortableConnectionCard
                        key={connection.id}
                        connection={connection}
                        onDelete={onDeleteConnection}
                        onEdit={onEditConnection}
                        isOver={false}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            );
          })}

      {/* Pagination - show for both All tab and filtered view when there are multiple pages */}
      {onPageChange && totalPages > 1 && (
        <div className="border-t border-gray-200 pt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            loading={loading}
            totalCount={totalCount}
            pageSize={pageSize}
          />
        </div>
      )}
    </div>
  );
});
