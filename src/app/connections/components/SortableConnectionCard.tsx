import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ConnectionCard } from './ConnectionCard';
import { ClientInstrument } from '@/types';

interface SortableConnectionCardProps {
  connection: ClientInstrument;
  onDelete: (connection: ClientInstrument) => void;
  onEdit: (connection: ClientInstrument) => void;
  showCreatedAt?: boolean;
}

export function SortableConnectionCard({
  connection,
  onDelete,
  onEdit,
  showCreatedAt,
}: SortableConnectionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: connection.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <ConnectionCard
          connection={connection}
          onDelete={onDelete}
          onEdit={onEdit}
          showCreatedAt={showCreatedAt}
        />
      </div>
    </div>
  );
}
