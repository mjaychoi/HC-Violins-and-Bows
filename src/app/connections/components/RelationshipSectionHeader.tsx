import { RelationshipType } from '@/types';
import { getRelationshipTypeStyle } from '../utils/relationshipStyles';

interface RelationshipSectionHeaderProps {
  type: RelationshipType;
  count: number;
}

export const RelationshipSectionHeader = ({
  type,
  count,
}: RelationshipSectionHeaderProps) => {
  const style = getRelationshipTypeStyle(type);

  return (
    <div className="mt-3 mb-4 flex items-center gap-2">
      <div
        className={`w-6 h-6 rounded-lg flex items-center justify-center ${style.bgColor}`}
      >
        <span className="text-sm">{style.icon}</span>
      </div>
      <h3 className="font-semibold text-gray-900">
        {type} ({count})
      </h3>
      <div className="flex-1 h-px bg-gray-200"></div>
    </div>
  );
};
