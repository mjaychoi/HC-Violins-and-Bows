import { RelationshipType } from '@/types';
import { RelationshipTypeCount } from '../utils/connectionGrouping';
import { getRelationshipTypeStyle } from '../utils/relationshipStyles';
import { useDroppable } from '@dnd-kit/core';

interface FilterBarProps {
  selectedFilter: RelationshipType | null;
  onFilterChange: (filter: RelationshipType | null) => void;
  relationshipTypeCounts: RelationshipTypeCount[];
  totalConnections: number;
  overTabType?: RelationshipType | 'all' | null;
}

function DroppableTabButton({
  id,
  type,
  label,
  count,
  isActive,
  onClick,
  isOver,
  style,
}: {
  id: string;
  type: RelationshipType | 'all';
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  isOver: boolean;
  style?: ReturnType<typeof getRelationshipTypeStyle>;
}) {
  const { setNodeRef } = useDroppable({
    id,
  });

  const baseClasses = `pb-3 px-1 text-sm font-medium transition-all duration-200 border-b-2`;
  const activeClasses =
    type === 'all'
      ? 'border-blue-600 text-blue-600'
      : style
        ? `${style.activeBorder} ${style.textColor}`
        : 'border-blue-600 text-blue-600';
  const inactiveClasses =
    'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300';
  const overClasses = isOver ? 'bg-blue-50 rounded-t-lg' : '';

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses} ${overClasses}`}
      title={`Filter by ${label}`}
    >
      {style?.icon && type !== 'all' && `${style.icon} `}
      {label} <span className="text-gray-400">({count})</span>
    </button>
  );
}

export const FilterBar = ({
  selectedFilter,
  onFilterChange,
  relationshipTypeCounts,
  totalConnections,
  overTabType,
}: FilterBarProps) => {
  return (
    <div className="border-b border-gray-200 mb-6">
      <div className="flex gap-2">
        <DroppableTabButton
          id="tab-all"
          type="all"
          label="All"
          count={totalConnections}
          isActive={selectedFilter === null}
          onClick={() => onFilterChange(null)}
          isOver={overTabType === 'all'}
        />
        {relationshipTypeCounts.map(({ type, count }) => {
          const style = getRelationshipTypeStyle(type);
          const active = selectedFilter === type;
          return (
            <DroppableTabButton
              key={type}
              id={`tab-${type}`}
              type={type}
              label={type}
              count={count}
              isActive={active}
              onClick={() => onFilterChange(type)}
              isOver={overTabType === type}
              style={style}
            />
          );
        })}
      </div>
    </div>
  );
};
