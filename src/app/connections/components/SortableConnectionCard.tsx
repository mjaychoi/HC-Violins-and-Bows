import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ConnectionCard } from './ConnectionCard';
import { ClientInstrument } from '@/types';
import {
  formatClientName,
  formatInstrumentName,
} from '../utils/connectionUtils';

interface SortableConnectionCardProps {
  connection: ClientInstrument;
  onDelete: (connection: ClientInstrument) => void;
  onEdit: (connection: ClientInstrument) => void;
  showCreatedAt?: boolean;
  isOver?: boolean; // Visual feedback for drag over
  canDrag?: boolean;
}

export function SortableConnectionCard({
  connection,
  onDelete,
  onEdit,
  showCreatedAt,
  isOver,
  canDrag = true,
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
    disabled: !canDrag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : isOver ? 0.8 : 1,
    zIndex: isDragging ? 1000 : isOver ? 100 : 'auto',
  };

  // formatClientName/formatInstrumentName always return a non-empty string
  // (falling back to "Unavailable client/instrument"), so the group's
  // accessible name can never collapse to empty even when enrichment failed.
  const accessibleName = `Connection: ${formatClientName(connection.client)} - ${formatInstrumentName(connection.instrument)} (${connection.relationship_type})`;

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
      // A composite card (name + role tags + instrument details + separate
      // edit/drag/delete actions) is a group of related controls, not a
      // single button - using role="button" here would nest interactive
      // elements (the edit/delete buttons) inside another interactive
      // element, which assistive tech cannot expose correctly.
      role="group"
      aria-label={accessibleName}
      aria-describedby={`connection-${connection.id}-description`}
    >
      {/* Drag handle - only this area is draggable. A real <button> so it
          is reachable/operable the same way as any other control, with
          dnd-kit's keyboard sensor wired through attributes/listeners. */}
      {canDrag && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-8 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none z-10 bg-gray-50 hover:bg-gray-100 border-r border-gray-200 rounded-l-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          aria-label={`Drag to reorder ${accessibleName}`}
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
        </button>
      )}

      {/* Card content with left padding for drag handle */}
      <div className={canDrag ? 'pl-8' : ''}>
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
      </div>
    </div>
  );
}
