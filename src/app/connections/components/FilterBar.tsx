import { RelationshipType } from '@/types';
import { RelationshipTypeCount } from '../utils/connectionGrouping';
import { getRelationshipTypeStyle } from '../utils/relationshipStyles';

interface FilterBarProps {
  selectedFilter: RelationshipType | null;
  onFilterChange: (filter: RelationshipType | null) => void;
  relationshipTypeCounts: RelationshipTypeCount[];
  totalConnections: number;
}

export const FilterBar = ({
  selectedFilter,
  onFilterChange,
  relationshipTypeCounts,
  totalConnections,
}: FilterBarProps) => {
  return (
    <div className="border-b border-gray-200 mb-6">
      <div className="flex gap-2">
        <button
          onClick={() => onFilterChange(null)}
          className={`pb-3 px-1 text-sm font-medium transition-all duration-200 border-b-2 ${
            selectedFilter === null
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
          }`}
        >
          All <span className="text-gray-400">({totalConnections})</span>
        </button>
        {relationshipTypeCounts.map(({ type, count }) => {
          const style = getRelationshipTypeStyle(type);
          const active = selectedFilter === type;
          return (
            <button
              key={type}
              onClick={() => onFilterChange(type)}
              className={`pb-3 px-1 text-sm font-medium transition-all duration-200 border-b-2 ${
                active
                  ? `${style.activeBorder} ${style.textColor}`
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
              title={`Filter by ${type}`}
            >
              {style.icon} {type}{' '}
              <span className="text-gray-400">({count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
