'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppLayout } from '@/components/layout';
import { Input, Button } from '@/components/common/inputs';
import { EmptyState } from '@/components/common';
import { ConfirmDialog } from '@/components/common/modals';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/utils/classNames';
import { logError } from '@/utils/logger';
const NOTES_STORAGE_KEY = 'notes_list';
const NOTES_SEARCH_KEY = 'notes_search';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | null>(null);
  const [deleteConfirmNote, setDeleteConfirmNote] = useState<Note | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list'); // Mobile view mode
  const [isDesktop, setIsDesktop] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const saveStatusClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const updateViewport = () => setIsDesktop(window.innerWidth >= 768);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Load notes from localStorage on mount
  useEffect(() => {
    try {
      const savedNotes = localStorage.getItem(NOTES_STORAGE_KEY);
      const savedSearch = localStorage.getItem(NOTES_SEARCH_KEY);
      if (savedNotes) {
        const parsedNotes = JSON.parse(savedNotes) as Note[];
        setNotes(parsedNotes);
        // Select first note if available (desktop only)
        if (parsedNotes.length > 0 && window.innerWidth >= 768) {
          setSelectedNoteId(parsedNotes[0].id);
        }
      }
      if (savedSearch) {
        setSearchQuery(savedSearch);
      }
    } catch (error) {
      logError(
        'Failed to load notes from localStorage:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }, []);

  // Get current note
  const currentNote = useMemo(() => {
    return notes.find(note => note.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  // Debounced auto-save to localStorage
  useEffect(() => {
    if (notes.length === 0) {
      try {
        if (saveStatusClearRef.current) {
          clearTimeout(saveStatusClearRef.current);
          saveStatusClearRef.current = null;
        }
        localStorage.removeItem(NOTES_STORAGE_KEY);
        setSaveStatus(null);
      } catch (error) {
        logError(
          'Failed to remove notes from localStorage:',
          error instanceof Error ? error.message : String(error)
        );
      }
      return;
    }

    setSaveStatus('saving');

    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
        setSaveStatus('saved');
        if (saveStatusClearRef.current) {
          clearTimeout(saveStatusClearRef.current);
        }
        saveStatusClearRef.current = setTimeout(() => {
          setSaveStatus(null);
          saveStatusClearRef.current = null;
        }, 2000);
      } catch (error) {
        logError(
          'Failed to save notes to localStorage:',
          error instanceof Error ? error.message : String(error)
        );
        setSaveStatus(null);
      }
    }, 500);

    return () => {
      clearTimeout(timeout);
      if (saveStatusClearRef.current) {
        clearTimeout(saveStatusClearRef.current);
        saveStatusClearRef.current = null;
      }
    };
  }, [notes]);

  // Save search query to localStorage
  useEffect(() => {
    try {
      if (searchQuery !== '') {
        localStorage.setItem(NOTES_SEARCH_KEY, searchQuery);
      } else {
        localStorage.removeItem(NOTES_SEARCH_KEY);
      }
    } catch (error) {
      logError(
        'Failed to save search query:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }, [searchQuery]);

  // Create new note
  const handleCreateNote = useCallback(() => {
    const newNote: Note = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      title: 'Untitled',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setNotes(prev => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);
    // Mobile: switch to edit view
    if (!isDesktop) {
      setViewMode('edit');
    }
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  }, [isDesktop]);

  // Delete note
  const handleDeleteNote = useCallback((note: Note) => {
    setDeleteConfirmNote(note);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirmNote) return;
    const id = deleteConfirmNote.id;
    setNotes(prev => {
      const remainingNotes = prev.filter(note => note.id !== id);
      if (selectedNoteId === id) {
        if (remainingNotes.length > 0) {
          setSelectedNoteId(remainingNotes[0].id);
        } else {
          setSelectedNoteId(null);
          // Mobile: switch back to list view
          if (!isDesktop) {
            setViewMode('list');
          }
        }
      }
      return remainingNotes;
    });
    setDeleteConfirmNote(null);
  }, [deleteConfirmNote, selectedNoteId, isDesktop]);

  // Update note title
  const handleTitleChange = useCallback((id: string, title: string) => {
    setNotes(prev =>
      prev.map(note =>
        note.id === id
          ? {
              ...note,
              title: title || 'Untitled',
              updatedAt: new Date().toISOString(),
            }
          : note
      )
    );
  }, []);

  // Update note content
  const handleContentChange = useCallback((id: string, content: string) => {
    setNotes(prev =>
      prev.map(note =>
        note.id === id
          ? { ...note, content, updatedAt: new Date().toISOString() }
          : note
      )
    );
  }, []);

  // Select note
  const handleSelectNote = useCallback(
    (id: string) => {
      setSelectedNoteId(id);
      // Mobile: switch to edit view
      if (!isDesktop) {
        setViewMode('edit');
      }
    },
    [isDesktop]
  );

  // Debounced search
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Filter notes by search query
  const filteredNotes = useMemo(() => {
    if (!debouncedSearch) return notes;
    const query = debouncedSearch.toLowerCase();
    return notes.filter(
      note =>
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query)
    );
  }, [notes, debouncedSearch]);

  // Search match count
  const matchCount = useMemo(() => {
    if (!debouncedSearch) return 0;
    return filteredNotes.length;
  }, [debouncedSearch, filteredNotes]);

  // Text statistics for current note
  const stats = useMemo(() => {
    const content = currentNote?.content || '';
    const lines = content.split('\n').length;
    const characters = content.length;
    const words =
      content.trim() === '' ? 0 : content.trim().split(/\s+/).length;
    return { lines, characters, words };
  }, [currentNote?.content]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // Handle Tab key for indentation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        if (e.shiftKey) {
          // Shift+Tab: remove indentation
          const beforeCursor = value.substring(0, start);
          const lineStart = beforeCursor.lastIndexOf('\n') + 1;
          const currentLine = value.substring(lineStart, end);

          if (currentLine.startsWith('  ')) {
            const newValue =
              value.substring(0, lineStart) +
              currentLine.substring(2) +
              value.substring(end);
            const newCursor = Math.max(lineStart, start - 2);
            if (currentNote) {
              handleContentChange(currentNote.id, newValue);
            }
            setTimeout(() => {
              textarea.setSelectionRange(newCursor, newCursor);
            }, 0);
          }
        } else {
          // Tab: add indentation
          const newValue =
            value.substring(0, start) + '  ' + value.substring(end);
          if (currentNote) {
            handleContentChange(currentNote.id, newValue);
          }
          setTimeout(() => {
            textarea.setSelectionRange(start + 2, start + 2);
          }, 0);
        }
      }
    },
    [currentNote, handleContentChange]
  );

  // Format date for display
  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }, []);

  // Mobile: handle back button
  const handleBackToList = useCallback(() => {
    setViewMode('list');
  }, []);

  return (
    <AppLayout title="Notes">
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Header - Always visible */}
        <div className="shrink-0 p-4 md:p-6 pb-4 border-b border-gray-200 bg-white">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                {/* Mobile: Back button when in edit view */}
                {viewMode === 'edit' && (
                  <button
                    onClick={handleBackToList}
                    className="md:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label="Back to list"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                )}
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                  Notes
                </h1>
              </div>
              <p className="text-xs md:text-sm text-gray-500">
                Auto-saved. Press Tab for indentation.
              </p>
            </div>
            <div className="flex items-center gap-2 md:gap-4 shrink-0 ml-2">
              {/* Save status - hide on mobile when in list view */}
              {(viewMode === 'edit' || isDesktop) && (
                <>
                  {saveStatus === 'saving' && (
                    <span className="hidden sm:flex items-center gap-1 text-blue-600 text-xs md:text-sm">
                      <svg
                        className="w-3 h-3 md:w-4 md:h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span className="hidden md:inline">Saving...</span>
                    </span>
                  )}
                  {saveStatus === 'saved' && (
                    <span className="hidden sm:flex items-center gap-1 text-green-600 text-xs md:text-sm">
                      <svg
                        className="w-3 h-3 md:w-4 md:h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="hidden md:inline">Saved</span>
                    </span>
                  )}
                </>
              )}
              <Button
                onClick={handleCreateNote}
                className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm px-3 md:px-4 py-1.5 md:py-2"
              >
                <svg
                  className="w-3 h-3 md:w-4 md:h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="hidden sm:inline">New Note</span>
                <span className="sm:hidden">New</span>
              </Button>
            </div>
          </div>

          {/* Search Bar - Hide on mobile when in edit view */}
          {(viewMode === 'list' || isDesktop) && (
            <div className="relative">
              <Input
                id="search"
                label="Search"
                name="search"
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search notes..."
                className="pr-24 md:pr-32"
              />
              {searchQuery && (
                <div className="absolute right-3 top-9 flex items-center gap-2 md:gap-3">
                  {debouncedSearch && (
                    <span className="text-xs text-gray-600">
                      {matchCount > 0 ? (
                        <span className="text-blue-600 font-medium">
                          {matchCount} note{matchCount !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-gray-400 hidden sm:inline">
                          No matches
                        </span>
                      )}
                    </span>
                  )}
                  <button
                    onClick={handleClearSearch}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                    aria-label="Clear search"
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Notes List Sidebar - Hidden on mobile when in edit view */}
          <div
            className={cn(
              'w-full md:w-80 border-r border-gray-200 flex flex-col overflow-hidden bg-white transition-transform duration-200',
              viewMode === 'edit' ? 'hidden md:flex' : 'flex'
            )}
          >
            <div className="flex-1 overflow-y-auto p-2 md:p-3">
              {filteredNotes.length === 0 ? (
                <div className="flex items-center justify-center h-full p-4">
                  <EmptyState
                    title={searchQuery ? 'No notes found' : 'No notes yet'}
                    description={
                      searchQuery
                        ? 'Try adjusting your search terms'
                        : 'Create your first note to get started'
                    }
                    actionButton={
                      searchQuery
                        ? {
                            label: 'Clear search',
                            onClick: handleClearSearch,
                          }
                        : {
                            label: 'Create your first note',
                            onClick: handleCreateNote,
                          }
                    }
                  />
                </div>
              ) : (
                <div className="space-y-1.5 md:space-y-2">
                  {filteredNotes.map(note => (
                    <div
                      key={note.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectNote(note.id)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          handleSelectNote(note.id);
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
                            handleDeleteNote(note);
                          }}
                          className="text-gray-400 hover:text-red-600 transition-colors shrink-0 p-1"
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
                        {formatDate(note.updatedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Note Editor - Hidden on mobile when in list view */}
          <div
            className={cn(
              'flex-1 flex flex-col overflow-hidden bg-white transition-transform duration-200',
              viewMode === 'list' ? 'hidden md:flex' : 'flex'
            )}
          >
            {currentNote ? (
              <>
                {/* Editor Header */}
                <div className="shrink-0 p-4 md:p-6 border-b border-gray-200 bg-white">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={currentNote.title}
                    onChange={e =>
                      handleTitleChange(currentNote.id, e.target.value)
                    }
                    placeholder="Untitled"
                    className="w-full text-xl md:text-2xl font-bold text-gray-900 bg-transparent border-none outline-none focus:ring-0 p-0"
                  />
                  <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                    <span className="text-xs text-gray-500">
                      Updated {formatDate(currentNote.updatedAt)}
                    </span>
                    <div className="flex items-center gap-2 md:gap-3 text-xs text-gray-600">
                      <span>{stats.lines} lines</span>
                      <span className="hidden sm:inline">
                        {stats.words} words
                      </span>
                      <span>{stats.characters} chars</span>
                    </div>
                  </div>
                </div>

                {/* Editor Content */}
                <div className="flex-1 overflow-hidden relative">
                  {debouncedSearch &&
                    matchCount > 0 &&
                    currentNote.content
                      .toLowerCase()
                      .includes(debouncedSearch.toLowerCase()) && (
                      <div className="absolute top-3 right-3 z-10 bg-yellow-100 text-yellow-800 px-2 md:px-3 py-1 rounded-md text-xs font-medium shadow-sm">
                        Match found
                      </div>
                    )}
                  <textarea
                    ref={contentTextareaRef}
                    aria-label="Note content editor"
                    value={currentNote.content}
                    onChange={e =>
                      handleContentChange(currentNote.id, e.target.value)
                    }
                    onKeyDown={handleKeyDown}
                    className="w-full h-full p-4 md:p-6 border-none outline-none focus:ring-0 font-mono text-sm resize-none leading-relaxed"
                    placeholder="Start writing...&#10;&#10;Tip: Press Tab to indent, Shift+Tab to unindent"
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4">
                <EmptyState
                  title="No note selected"
                  description="Create a new note or select one from the list"
                  actionButton={{
                    label: 'Create New Note',
                    onClick: handleCreateNote,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirmNote}
        onCancel={() => setDeleteConfirmNote(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Note"
        message={
          deleteConfirmNote
            ? `Are you sure you want to delete "${deleteConfirmNote.title || 'Untitled'}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive={true}
      />
    </AppLayout>
  );
}
