import { RelationshipType } from '@/types';
import { getRelationshipTypeStyle } from '../utils/relationshipStyles';
import { useDroppable } from '@dnd-kit/core';

interface RelationshipSectionHeaderProps {
  type: RelationshipType;
  count: number;
  isOver?: boolean;
}

export const RelationshipSectionHeader = ({
  type,
  count,
  isOver = false,
}: RelationshipSectionHeaderProps) => {
  const style = getRelationshipTypeStyle(type);
  const { setNodeRef } = useDroppable({
    id: `section-${type}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`mt-3 mb-4 flex items-center gap-2 transition-all duration-200 ${
        isOver ? 'bg-blue-50 rounded-lg p-2 -mx-2' : ''
      }`}
    >
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
