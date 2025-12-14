import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ConnectionCard } from './ConnectionCard';
import { ClientInstrument } from '@/types';

interface SortableConnectionCardProps {
  connection: ClientInstrument;
  onDelete: (connection: ClientInstrument) => void;
  onEdit: (connection: ClientInstrument) => void;
  showCreatedAt?: boolean;
  isOver?: boolean; // Visual feedback for drag over
}

export function SortableConnectionCard({
  connection,
  onDelete,
  onEdit,
  showCreatedAt,
  isOver,
}: SortableConnectionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: connection.id,
    disabled: false, // Allow dragging
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : isOver ? 0.8 : 1,
    zIndex: isDragging ? 1000 : isOver ? 100 : 'auto',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`
        relative
        ${isDragging ? 'shadow-2xl' : isOver ? 'shadow-lg' : ''}
        ${isOver ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
        transition-all duration-200
      `}
      role="button"
      tabIndex={0}
      aria-label={`Connection: ${connection.client?.first_name || ''} ${connection.client?.last_name || ''} - ${connection.instrument?.maker || ''} ${connection.instrument?.type || ''}`}
      aria-describedby={`connection-${connection.id}-description`}
      onKeyDown={(e) => {
        // Keyboard navigation support
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // Trigger edit on Enter/Space
          onEdit(connection);
        }
      }}
    >
      {/* Drag handle - only this area is draggable */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none z-10 bg-gray-50 hover:bg-gray-100 border-r border-gray-200 rounded-l-lg transition-colors"
        aria-label="Drag to reorder"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          // Prevent card's onKeyDown from firing when handle is focused
          e.stopPropagation();
        }}
      >
        <svg
          className="w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 8h16M4 16h16"
          />
        </svg>
      </div>
      
      {/* Card content with left padding for drag handle */}
      <div className="pl-8">
        <ConnectionCard
          connection={connection}
          onDelete={onDelete}
          onEdit={onEdit}
          showCreatedAt={showCreatedAt}
        />
      </div>
      
      {/* Screen reader description */}
      <div id={`connection-${connection.id}-description`} className="sr-only">
        {connection.relationship_type} relationship. 
        {connection.notes ? `Notes: ${connection.notes}` : 'No notes.'}
        Press Enter or Space to edit.
      </div>
    </div>
  );
}
