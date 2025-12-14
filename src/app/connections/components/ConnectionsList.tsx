import { memo, useMemo, useState } from 'react';
import { ClientInstrument, RelationshipType } from '@/types';
import {
  GroupedConnections,
  sortConnectionsForAllTab,
} from '../utils/connectionGrouping';
import { RelationshipSectionHeader } from './RelationshipSectionHeader';
import { SortableConnectionCard } from './SortableConnectionCard';
import { Pagination } from '@/components/common';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  useDndMonitor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface ConnectionsListProps {
  groupedConnections: GroupedConnections;
  selectedFilter: RelationshipType | null;
  onDeleteConnection: (connection: ClientInstrument) => void;
  onEditConnection: (connection: ClientInstrument) => void;
  onConnectionReorder?: (connections: ClientInstrument[]) => void;
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
  onConnectionReorder,
  currentPage = 1,
  pageSize = 20,
  onPageChange,
  loading = false,
}: ConnectionsListProps) {
  // Track drag over state for visual feedback
  const [overId, setOverId] = useState<string | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag over for visual feedback
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverId(over?.id as string | null || null);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setOverId(null); // Clear over state

    if (!over || active.id === over.id) {
      return;
    }

    if (onConnectionReorder) {
      // Get current connections array
      const currentConnections = isAll ? flatConnections : filteredTypeConnections;
      
      // Find indices
      const oldIndex = currentConnections.findIndex(c => c.id === active.id);
      const newIndex = currentConnections.findIndex(c => c.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // Reorder connections
        const newConnections = arrayMove(currentConnections, oldIndex, newIndex);
        onConnectionReorder(newConnections);
      }
    }
  };
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

  return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragCancel={() => setOverId(null)}
      >
      <div className="space-y-4">
        {isAll ? (
          // All 탭: 섹션 없이 flat list로 표시 (각 카드에 배지로 type 표시)
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
                  isOver={overId === connection.id}
                />
              ))}
            </div>
          </SortableContext>
        ) : (
          // 필터 선택 시: 섹션 헤더 유지 (해당 타입의 연결만 페이지네이션)
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
                        isOver={overId === connection.id}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            );
          })
        )}

      {/* Pagination */}
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
    </DndContext>
  );
});
