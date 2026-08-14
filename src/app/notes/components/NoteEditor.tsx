'use client';

import type { RefObject } from 'react';
import { EmptyState } from '@/components/common';
import { cn } from '@/utils/classNames';
import type { Note } from '../notesStorage';
import { formatNoteDate } from '../utils/formatNoteDate';

interface NoteEditorProps {
  note: Note | null;
  isLoading: boolean;
  canMutateNotes: boolean;
  viewMode: 'list' | 'edit';
  debouncedSearch: string;
  matchCount: number;
  selectedNoteMatchesSearch: boolean;
  stats: { lines: number; words: number; characters: number };
  titleInputRef: RefObject<HTMLInputElement>;
  contentTextareaRef: RefObject<HTMLTextAreaElement>;
  onTitleChange: (id: string, title: string) => void;
  onContentChange: (id: string, content: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCreate: () => void;
}

export function NoteEditor({
  note,
  isLoading,
  canMutateNotes,
  viewMode,
  debouncedSearch,
  matchCount,
  selectedNoteMatchesSearch,
  stats,
  titleInputRef,
  contentTextareaRef,
  onTitleChange,
  onContentChange,
  onKeyDown,
  onCreate,
}: NoteEditorProps) {
  return (
    <div
      className={cn(
        'flex-1 flex flex-col overflow-hidden bg-white transition-transform duration-200',
        viewMode === 'list' ? 'hidden md:flex' : 'flex'
      )}
    >
      {note ? (
        <>
          <div className="shrink-0 p-4 md:p-6 border-b border-gray-200 bg-white">
            <input
              ref={titleInputRef}
              type="text"
              value={note.title}
              onChange={e => onTitleChange(note.id, e.target.value)}
              readOnly={!canMutateNotes}
              aria-readonly={!canMutateNotes}
              placeholder="Untitled"
              className={cn(
                'w-full text-xl md:text-2xl font-bold text-gray-900 bg-transparent border-none outline-none focus:ring-0 p-0',
                !canMutateNotes && 'opacity-70 cursor-default'
              )}
            />
            <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
              <span className="text-xs text-gray-500">
                Updated {formatNoteDate(note.updatedAt)}
              </span>
              <div className="flex items-center gap-2 md:gap-3 text-xs text-gray-600">
                <span>{stats.lines} lines</span>
                <span className="hidden sm:inline">{stats.words} words</span>
                <span>{stats.characters} chars</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative">
            {debouncedSearch && matchCount > 0 && selectedNoteMatchesSearch && (
              <div className="absolute top-3 right-3 z-10 bg-yellow-100 text-yellow-800 px-2 md:px-3 py-1 rounded-md text-xs font-medium shadow-sm">
                Match found
              </div>
            )}
            {debouncedSearch && note && !selectedNoteMatchesSearch && (
              <div className="absolute top-3 right-3 z-10 bg-gray-100 text-gray-700 px-2 md:px-3 py-1 rounded-md text-xs font-medium shadow-sm">
                Outside search results
              </div>
            )}
            <textarea
              ref={contentTextareaRef}
              aria-label="Note content editor"
              value={note.content}
              onChange={e => onContentChange(note.id, e.target.value)}
              onKeyDown={onKeyDown}
              readOnly={!canMutateNotes}
              aria-readonly={!canMutateNotes}
              className={cn(
                'w-full h-full p-4 md:p-6 border-none outline-none focus:ring-0 font-mono text-sm resize-none leading-relaxed',
                !canMutateNotes && 'opacity-70 cursor-default'
              )}
              placeholder="Start writing...&#10;&#10;Tip: Press Tab to indent, Shift+Tab to unindent"
            />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            title={isLoading ? 'Loading notes...' : 'No note selected'}
            description={
              isLoading
                ? 'Fetching notes from your account'
                : 'Create a new note or select one from the list'
            }
            actionButton={
              !isLoading && canMutateNotes
                ? {
                    label: 'Create New Note',
                    onClick: onCreate,
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
