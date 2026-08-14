'use client';

import { EmptyState } from '@/components/common';
import { cn } from '@/utils/classNames';
import type { Note } from '../notesStorage';
import { formatNoteDate } from '../utils/formatNoteDate';

interface NotesListProps {
  notes: Note[];
  selectedNoteId: string | null;
  isLoading: boolean;
  loadError: string | null;
  searchQuery: string;
  canMutateNotes: boolean;
  mutateDisabledReason?: string;
  onSelect: (id: string) => void;
  onDelete: (note: Note) => void;
  onCreate: () => void;
  onClearSearch: () => void;
  hiddenOnMobileEdit: boolean;
}

export function NotesList({
  notes,
  selectedNoteId,
  isLoading,
  loadError,
  searchQuery,
  canMutateNotes,
  mutateDisabledReason,
  onSelect,
  onDelete,
  onCreate,
  onClearSearch,
  hiddenOnMobileEdit,
}: NotesListProps) {
  return (
    <div
      className={cn(
        'w-full md:w-80 border-r border-gray-200 flex flex-col overflow-hidden bg-white transition-transform duration-200',
        hiddenOnMobileEdit ? 'hidden md:flex' : 'flex'
      )}
    >
      <div className="flex-1 overflow-y-auto p-2 md:p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full p-4 text-sm text-gray-500">
            Loading notes...
          </div>
        ) : notes.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <EmptyState
              title={
                loadError
                  ? 'Unable to load notes'
                  : searchQuery
                    ? 'No notes found'
                    : 'No notes yet'
              }
              description={
                loadError
                  ? 'Check your connection and try again'
                  : searchQuery
                    ? 'Try adjusting your search terms'
                    : 'Create your first note to get started'
              }
              actionButton={
                searchQuery
                  ? {
                      label: 'Clear search',
                      onClick: onClearSearch,
                    }
                  : canMutateNotes
                    ? {
                        label: 'Create your first note',
                        onClick: onCreate,
                      }
                    : undefined
              }
            />
          </div>
        ) : (
          <div className="space-y-1.5 md:space-y-2">
            {notes.map(note => (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(note.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    onSelect(note.id);
                  } else if (event.key === ' ') {
                    event.preventDefault();
                    onSelect(note.id);
                  }
                }}
                className={cn(
                  'p-3 md:p-4 rounded-lg cursor-pointer transition-colors border',
                  selectedNoteId === note.id
                    ? 'bg-blue-50 border-blue-200 shadow-sm'
                    : 'bg-white hover:bg-gray-50 border-gray-200'
                )}
              >
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <h3 className="font-medium text-gray-900 truncate flex-1 text-sm md:text-base">
                    {note.title || 'Untitled'}
                  </h3>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onDelete(note);
                    }}
                    disabled={!canMutateNotes}
                    title={
                      !canMutateNotes
                        ? (mutateDisabledReason ?? 'Cannot delete note')
                        : 'Delete note'
                    }
                    className="text-gray-400 hover:text-red-600 transition-colors shrink-0 p-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-gray-400"
                    aria-label="Delete note"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
                <p className="text-xs md:text-sm text-gray-500 line-clamp-2 mb-2">
                  {note.content || 'No content'}
                </p>
                <p className="text-xs text-gray-400">
                  {formatNoteDate(note.updatedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
