'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';
import { ApiResponseError } from '@/utils/handleApiResponse';
import { logError } from '@/utils/logger';
import {
  createNote,
  deleteNote,
  fetchNotes,
  legacyNoteMigrationIdempotencyKey,
  updateNote,
} from '../notesApi';
import {
  CONFLICT_TEXT,
  LOAD_ERROR_TEXT,
  SAVE_ERROR_TEXT,
  SAVE_SUCCESS_TEXT,
} from '../notesCopy';
import {
  getNotesStorageKeys,
  isNotesMigratedFlagSet,
  parseStoredNotes,
  writePendingLegacyNotes,
  type Note,
} from '../notesStorage';
import { reconcileNotesCollection } from '../utils/reconcileNotesCollection';

function isAlreadyDeletedNoteError(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === 404;
}

/** Prefer just-migrated rows, then drop server rows that replayed the same id. */
function mergeMigratedNotes(migrated: Note[], serverNotes: Note[]): Note[] {
  const seen = new Set<string>();
  const merged: Note[] = [];
  for (const note of [...migrated, ...serverNotes]) {
    if (seen.has(note.id)) continue;
    seen.add(note.id);
    merged.push(note);
  }
  return merged;
}

export function useNotesPage() {
  const { canCreateNote, createNoteDisabledReason } = usePermissions();
  const { tenantIdentityKey, userId, orgId, isTenantTransitioning } =
    useTenantIdentity();
  const storageKeys = useMemo(
    () =>
      isTenantTransitioning
        ? null
        : getNotesStorageKeys({ userId, orgId, tenantIdentityKey }),
    [isTenantTransitioning, orgId, tenantIdentityKey, userId]
  );

  const [notes, setNotes] = useState<Note[]>([]);
  const [loadedListKey, setLoadedListKey] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmNote, setDeleteConfirmNote] = useState<Note | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');
  const [isDesktop, setIsDesktop] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const saveStatusClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeListKeyRef = useRef<string | null>(null);
  const tenantGenerationRef = useRef(0);
  const searchChangedLocallyRef = useRef(false);
  const notesRef = useRef<Note[]>(notes);
  notesRef.current = notes;
  const dirtyNoteIdsRef = useRef<Set<string>>(new Set());
  const noteSaveGenerationRef = useRef<Map<string, number>>(new Map());
  const isCreatingNoteRef = useRef(false);
  const isMountedRef = useRef(true);
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const flushPendingNotesRef = useRef<
    (
      listKey: string | null,
      generation: number,
      options?: { keepalive?: boolean }
    ) => Promise<void>
  >(async () => undefined);

  const canMutateNotes =
    canCreateNote &&
    !isTenantTransitioning &&
    storageKeys !== null &&
    loadedListKey === storageKeys.list &&
    !isLoading &&
    !loadError;

  const mutateDisabledReason = !canMutateNotes
    ? (createNoteDisabledReason ??
      (loadError
        ? LOAD_ERROR_TEXT
        : isLoading
          ? 'Loading notes'
          : 'Organization context required'))
    : undefined;

  useEffect(() => {
    const updateViewport = () => setIsDesktop(window.innerWidth >= 768);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearSaveStatusTimer = useCallback(() => {
    if (saveStatusClearRef.current) {
      clearTimeout(saveStatusClearRef.current);
      saveStatusClearRef.current = null;
    }
  }, []);

  const markSaved = useCallback(() => {
    if (!isMountedRef.current) return;
    clearSaveStatusTimer();
    setSaveError(null);
    setSaveStatus('saved');
    saveStatusClearRef.current = setTimeout(() => {
      setSaveStatus(null);
      saveStatusClearRef.current = null;
    }, 2000);
  }, [clearSaveStatusTimer]);

  const markSaveError = useCallback(
    (message: string) => {
      if (!isMountedRef.current) return;
      clearSaveStatusTimer();
      setSaveStatus(null);
      setSaveError(message);
    },
    [clearSaveStatusTimer]
  );

  const bumpNoteSaveGeneration = useCallback((id: string) => {
    noteSaveGenerationRef.current.set(
      id,
      (noteSaveGenerationRef.current.get(id) ?? 0) + 1
    );
  }, []);

  const flushPendingNotes = useCallback(
    async (
      listKey: string | null,
      generation: number,
      options?: { keepalive?: boolean }
    ) => {
      const previousFlush = flushInFlightRef.current;
      const run = (async () => {
        if (previousFlush) {
          await previousFlush.catch(() => undefined);
        }

        // Still send after unmount/pagehide so newer dirty text is not dropped
        // while waiting on an in-flight save. Skip only when the tenant
        // generation has moved on.
        if (
          !listKey ||
          dirtyNoteIdsRef.current.size === 0 ||
          activeListKeyRef.current !== listKey ||
          tenantGenerationRef.current !== generation
        ) {
          return;
        }

        const dirtyIds = Array.from(dirtyNoteIdsRef.current);
        const snapshot = notesRef.current;
        const pending = dirtyIds
          .map(id => snapshot.find(note => note.id === id))
          .filter((note): note is Note =>
            Boolean(note && note.syncedUpdatedAt)
          );

        if (pending.length === 0) {
          for (const id of dirtyIds) {
            const note = snapshot.find(item => item.id === id);
            if (!note?.syncedUpdatedAt) {
              dirtyNoteIdsRef.current.delete(id);
            }
          }
          return;
        }

        const sentGenerations = new Map(
          pending.map(note => [
            note.id,
            noteSaveGenerationRef.current.get(note.id) ?? 0,
          ])
        );

        const results = await Promise.allSettled(
          pending.map(note =>
            updateNote(
              {
                id: note.id,
                title: note.title,
                content: note.content,
                updated_at: note.syncedUpdatedAt!,
              },
              { keepalive: options?.keepalive }
            )
          )
        );

        const sameTenant = tenantGenerationRef.current === generation;
        const shouldApplyUi =
          isMountedRef.current &&
          sameTenant &&
          activeListKeyRef.current === listKey;

        if (!sameTenant) {
          return;
        }

        let hadError = false;
        const conflictedIds = new Set<string>();
        const succeeded = new Map<string, Note>();

        results.forEach((result, index) => {
          const original = pending[index];
          if (result.status === 'fulfilled') {
            succeeded.set(original.id, result.value);
            const sentGeneration = sentGenerations.get(original.id) ?? 0;
            const currentGeneration =
              noteSaveGenerationRef.current.get(original.id) ?? 0;
            if (sentGeneration === currentGeneration) {
              dirtyNoteIdsRef.current.delete(original.id);
            }
          } else {
            hadError = true;
            const reason = result.reason;
            if (
              reason instanceof ApiResponseError &&
              reason.error_code === 'NOTES_CONFLICT'
            ) {
              conflictedIds.add(original.id);
            }
            logError(
              'Failed to save note to server:',
              reason instanceof Error ? reason.message : String(reason)
            );
          }
        });

        if (succeeded.size > 0) {
          const next = notesRef.current.map(note => {
            const saved = succeeded.get(note.id);
            if (!saved) return note;

            const sentGeneration = sentGenerations.get(note.id) ?? 0;
            const currentGeneration =
              noteSaveGenerationRef.current.get(note.id) ?? 0;
            if (sentGeneration === currentGeneration) {
              return saved;
            }

            return {
              ...note,
              syncedUpdatedAt: saved.syncedUpdatedAt,
            };
          });
          notesRef.current = next;
          if (shouldApplyUi) {
            setNotes(next);
          }
        }

        if (conflictedIds.size > 0) {
          try {
            const latest = await fetchNotes();
            if (
              isMountedRef.current &&
              activeListKeyRef.current === listKey &&
              tenantGenerationRef.current === generation
            ) {
              for (const id of conflictedIds) {
                dirtyNoteIdsRef.current.delete(id);
              }
              const merged = reconcileNotesCollection({
                localNotes: notesRef.current,
                serverNotes: latest,
                dirtyIds: dirtyNoteIdsRef.current,
                conflictedIds,
              });
              notesRef.current = merged;
              setNotes(merged);
              markSaveError(CONFLICT_TEXT);
            }
          } catch (error) {
            logError(
              'Failed to reload notes after conflict:',
              error instanceof Error ? error.message : String(error)
            );
            markSaveError(SAVE_ERROR_TEXT);
          }
          return;
        }

        if (hadError) {
          markSaveError(SAVE_ERROR_TEXT);
          return;
        }

        if (dirtyNoteIdsRef.current.size === 0) {
          markSaved();
        }
      })();

      flushInFlightRef.current = run;
      try {
        await run;
      } finally {
        if (flushInFlightRef.current === run) {
          flushInFlightRef.current = null;
        }
      }
    },
    [markSaveError, markSaved]
  );
  flushPendingNotesRef.current = flushPendingNotes;

  useEffect(() => {
    const listKeyForThisTenant = storageKeys?.list ?? null;
    const generation = ++tenantGenerationRef.current;
    activeListKeyRef.current = listKeyForThisTenant;
    dirtyNoteIdsRef.current = new Set();
    noteSaveGenerationRef.current = new Map();
    isCreatingNoteRef.current = false;
    searchChangedLocallyRef.current = false;
    setNotes([]);
    setLoadedListKey(null);
    setSelectedNoteId(null);
    setSearchQuery('');
    setSaveStatus(null);
    setSaveError(null);
    setLoadError(null);
    setDeleteConfirmNote(null);
    setViewMode('list');
    setIsCreatingNote(false);
    setIsLoading(Boolean(storageKeys));

    if (!storageKeys) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const isLoadStale = () =>
      cancelled ||
      controller.signal.aborted ||
      tenantGenerationRef.current !== generation;

    const load = async () => {
      try {
        const savedSearch = localStorage.getItem(storageKeys.search) ?? '';
        if (isLoadStale()) return;
        setSearchQuery(savedSearch);

        let serverNotes = await fetchNotes(controller.signal);
        if (isLoadStale()) return;

        const alreadyMigrated = isNotesMigratedFlagSet(
          localStorage.getItem(storageKeys.migrated)
        );
        if (!alreadyMigrated) {
          let pendingLocal = parseStoredNotes(
            localStorage.getItem(storageKeys.list)
          );
          if (pendingLocal.length > 0) {
            const migrated: Note[] = [];
            for (const local of pendingLocal.slice()) {
              if (isLoadStale()) return;
              try {
                const created = await createNote(
                  {
                    title: local.title || 'Untitled',
                    content: local.content,
                  },
                  {
                    signal: controller.signal,
                    idempotencyKey: legacyNoteMigrationIdempotencyKey(local.id),
                  }
                );
                if (isLoadStale()) return;
                pendingLocal = pendingLocal.filter(
                  note => note.id !== local.id
                );
                try {
                  writePendingLegacyNotes(storageKeys.list, pendingLocal);
                } catch (error) {
                  logError(
                    'Failed to persist remaining local notes after migration:',
                    error instanceof Error ? error.message : String(error)
                  );
                }
                if (isLoadStale()) return;
                migrated.push(created);
              } catch (error) {
                if (isLoadStale()) return;
                logError(
                  'Failed to migrate local note:',
                  error instanceof Error ? error.message : String(error)
                );
              }
            }
            if (isLoadStale()) return;
            serverNotes = mergeMigratedNotes(migrated, serverNotes);
          }

          if (pendingLocal.length === 0) {
            try {
              localStorage.setItem(storageKeys.migrated, '1');
              localStorage.removeItem(storageKeys.list);
            } catch (error) {
              logError(
                'Failed to mark notes migration complete:',
                error instanceof Error ? error.message : String(error)
              );
            }
          }
        }

        if (isLoadStale()) return;

        setNotes(serverNotes);
        setLoadedListKey(storageKeys.list);
        setLoadError(null);
        if (serverNotes.length > 0 && window.innerWidth >= 768) {
          setSelectedNoteId(serverNotes[0].id);
        }
      } catch (error) {
        if (isLoadStale()) return;
        logError(
          'Failed to load notes from server:',
          error instanceof Error ? error.message : String(error)
        );
        setLoadError(LOAD_ERROR_TEXT);
        setLoadedListKey(storageKeys.list);
      } finally {
        if (!isLoadStale()) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
      void flushPendingNotesRef.current(listKeyForThisTenant, generation, {
        keepalive: true,
      });
    };
  }, [storageKeys]);

  useEffect(() => {
    const handlePageHide = () => {
      void flushPendingNotesRef.current(
        activeListKeyRef.current,
        tenantGenerationRef.current,
        { keepalive: true }
      );
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, []);

  useEffect(() => {
    if (!storageKeys || loadedListKey !== storageKeys.list) return;

    const refreshIfClean = () => {
      if (document.visibilityState === 'hidden') return;
      if (dirtyNoteIdsRef.current.size > 0) return;
      if (flushInFlightRef.current) return;

      const generation = tenantGenerationRef.current;
      const listKey = storageKeys.list;
      void fetchNotes()
        .then(latest => {
          if (
            !isMountedRef.current ||
            activeListKeyRef.current !== listKey ||
            tenantGenerationRef.current !== generation ||
            dirtyNoteIdsRef.current.size > 0
          ) {
            return;
          }
          setNotes(latest);
          setSelectedNoteId(current =>
            current && latest.some(note => note.id === current)
              ? current
              : window.innerWidth >= 768
                ? (latest[0]?.id ?? null)
                : null
          );
        })
        .catch(error => {
          logError(
            'Failed to refresh notes on focus:',
            error instanceof Error ? error.message : String(error)
          );
        });
    };

    window.addEventListener('focus', refreshIfClean);
    document.addEventListener('visibilitychange', refreshIfClean);
    return () => {
      window.removeEventListener('focus', refreshIfClean);
      document.removeEventListener('visibilitychange', refreshIfClean);
    };
  }, [loadedListKey, storageKeys]);

  useEffect(() => {
    if (!storageKeys || loadedListKey !== storageKeys.list) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      if (event.key === storageKeys.search) {
        searchChangedLocallyRef.current = false;
        setSearchQuery(event.newValue ?? '');
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [loadedListKey, storageKeys]);

  const currentNote = useMemo(() => {
    if (!storageKeys || loadedListKey !== storageKeys.list) return null;
    return notes.find(note => note.id === selectedNoteId) || null;
  }, [loadedListKey, notes, selectedNoteId, storageKeys]);

  const visibleNotes = useMemo(
    () =>
      storageKeys &&
      loadedListKey === storageKeys.list &&
      !isTenantTransitioning &&
      !isLoading
        ? notes
        : [],
    [isLoading, isTenantTransitioning, loadedListKey, notes, storageKeys]
  );

  const visibleSearchQuery =
    storageKeys &&
    loadedListKey === storageKeys.list &&
    !isTenantTransitioning &&
    !isLoading
      ? searchQuery
      : '';

  useEffect(() => {
    if (
      !storageKeys ||
      loadedListKey !== storageKeys.list ||
      activeListKeyRef.current !== storageKeys.list ||
      dirtyNoteIdsRef.current.size === 0
    ) {
      return;
    }

    const scheduledListKey = storageKeys.list;
    const generation = tenantGenerationRef.current;
    setSaveStatus('saving');

    const timeout = setTimeout(() => {
      void flushPendingNotesRef.current(scheduledListKey, generation);
    }, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, [loadedListKey, notes, storageKeys]);

  useEffect(() => {
    if (
      !storageKeys ||
      loadedListKey !== storageKeys.list ||
      activeListKeyRef.current !== storageKeys.list ||
      !searchChangedLocallyRef.current
    ) {
      return;
    }

    try {
      if (searchQuery !== '') {
        localStorage.setItem(storageKeys.search, searchQuery);
      } else {
        localStorage.removeItem(storageKeys.search);
      }
      searchChangedLocallyRef.current = false;
    } catch (error) {
      logError(
        'Failed to save search query:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }, [loadedListKey, searchQuery, storageKeys]);

  const handleCreateNote = useCallback(async () => {
    if (!canMutateNotes || isCreatingNoteRef.current) return;

    isCreatingNoteRef.current = true;
    setIsCreatingNote(true);
    setSaveStatus('saving');
    try {
      const newNote = await createNote({
        title: 'Untitled',
        content: '',
      });
      if (!isMountedRef.current) return;
      setNotes(prev => [newNote, ...prev]);
      setSelectedNoteId(newNote.id);
      if (!isDesktop) {
        setViewMode('edit');
      }
      markSaved();
      setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }, 0);
    } catch (error) {
      logError(
        'Failed to create note:',
        error instanceof Error ? error.message : String(error)
      );
      markSaveError(SAVE_ERROR_TEXT);
    } finally {
      isCreatingNoteRef.current = false;
      if (isMountedRef.current) {
        setIsCreatingNote(false);
      }
    }
  }, [canMutateNotes, isDesktop, markSaveError, markSaved]);

  const handleDeleteNote = useCallback(
    (note: Note) => {
      if (!canMutateNotes) return;
      setDeleteConfirmNote(note);
    },
    [canMutateNotes]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmNote || !canMutateNotes) return;
    const id = deleteConfirmNote.id;
    const noteToDelete = deleteConfirmNote;
    setDeleteConfirmNote(null);

    dirtyNoteIdsRef.current.delete(id);
    noteSaveGenerationRef.current.delete(id);
    setNotes(prev => {
      const remainingNotes = prev.filter(note => note.id !== id);
      if (selectedNoteId === id) {
        if (remainingNotes.length > 0) {
          setSelectedNoteId(remainingNotes[0].id);
        } else {
          setSelectedNoteId(null);
          if (!isDesktop) {
            setViewMode('list');
          }
        }
      }
      return remainingNotes;
    });

    try {
      await deleteNote(id);
      if (isMountedRef.current) {
        markSaved();
      }
    } catch (error) {
      if (isAlreadyDeletedNoteError(error)) {
        if (isMountedRef.current) {
          markSaved();
        }
        return;
      }
      logError(
        'Failed to delete note:',
        error instanceof Error ? error.message : String(error)
      );
      if (!isMountedRef.current) return;
      setNotes(prev => {
        if (prev.some(note => note.id === id)) return prev;
        return [noteToDelete, ...prev];
      });
      markSaveError(SAVE_ERROR_TEXT);
    }
  }, [
    canMutateNotes,
    deleteConfirmNote,
    selectedNoteId,
    isDesktop,
    markSaveError,
    markSaved,
  ]);

  const handleTitleChange = useCallback(
    (id: string, title: string) => {
      if (!canMutateNotes) return;
      dirtyNoteIdsRef.current.add(id);
      bumpNoteSaveGeneration(id);
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
    },
    [bumpNoteSaveGeneration, canMutateNotes]
  );

  const handleContentChange = useCallback(
    (id: string, content: string) => {
      if (!canMutateNotes) return;
      dirtyNoteIdsRef.current.add(id);
      bumpNoteSaveGeneration(id);
      setNotes(prev =>
        prev.map(note =>
          note.id === id
            ? { ...note, content, updatedAt: new Date().toISOString() }
            : note
        )
      );
    },
    [bumpNoteSaveGeneration, canMutateNotes]
  );

  const handleSelectNote = useCallback(
    (id: string) => {
      setSelectedNoteId(id);
      if (!isDesktop) {
        setViewMode('edit');
      }
    },
    [isDesktop]
  );

  const debouncedSearch = useDebounce(visibleSearchQuery, 300);

  const filteredNotes = useMemo(() => {
    if (!debouncedSearch) return visibleNotes;
    const query = debouncedSearch.toLowerCase();
    return visibleNotes.filter(
      note =>
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query)
    );
  }, [debouncedSearch, visibleNotes]);

  const matchCount = useMemo(() => {
    if (!debouncedSearch) return 0;
    return filteredNotes.length;
  }, [debouncedSearch, filteredNotes]);

  const selectedNoteMatchesSearch = useMemo(() => {
    if (!debouncedSearch || !currentNote) return true;
    const query = debouncedSearch.toLowerCase();
    return (
      currentNote.title.toLowerCase().includes(query) ||
      currentNote.content.toLowerCase().includes(query)
    );
  }, [currentNote, debouncedSearch]);

  const stats = useMemo(() => {
    const content = currentNote?.content || '';
    const lines = content.split('\n').length;
    const characters = content.length;
    const words =
      content.trim() === '' ? 0 : content.trim().split(/\s+/).length;
    return { lines, characters, words };
  }, [currentNote?.content]);

  const handleSearchChange = useCallback(
    (value: string) => {
      if (!storageKeys || loadedListKey !== storageKeys.list) return;
      searchChangedLocallyRef.current = true;
      setSearchQuery(value);
    },
    [loadedListKey, storageKeys]
  );

  const handleClearSearch = useCallback(() => {
    if (!storageKeys || loadedListKey !== storageKeys.list) return;
    searchChangedLocallyRef.current = true;
    setSearchQuery('');
  }, [loadedListKey, storageKeys]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      if (e.shiftKey) {
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
        const newValue =
          value.substring(0, start) + '  ' + value.substring(end);
        if (currentNote) {
          handleContentChange(currentNote.id, newValue);
        }
        setTimeout(() => {
          textarea.setSelectionRange(start + 2, start + 2);
        }, 0);
      }
    },
    [currentNote, handleContentChange]
  );

  const handleBackToList = useCallback(() => {
    setViewMode('list');
  }, []);

  const statusMessage = loadError
    ? loadError
    : (saveError ?? SAVE_SUCCESS_TEXT);

  return {
    canMutateNotes,
    isCreatingNote,
    mutateDisabledReason,
    notes,
    currentNote,
    filteredNotes,
    selectedNoteId,
    viewMode,
    isDesktop,
    isLoading,
    loadError,
    saveStatus,
    saveError,
    statusMessage,
    visibleSearchQuery,
    debouncedSearch,
    matchCount,
    selectedNoteMatchesSearch,
    stats,
    deleteConfirmNote,
    titleInputRef: titleInputRef as RefObject<HTMLInputElement>,
    contentTextareaRef: contentTextareaRef as RefObject<HTMLTextAreaElement>,
    handleCreateNote,
    handleDeleteNote,
    handleConfirmDelete,
    handleCancelDelete: () => setDeleteConfirmNote(null),
    handleTitleChange,
    handleContentChange,
    handleSelectNote,
    handleSearchChange,
    handleClearSearch,
    handleKeyDown,
    handleBackToList,
  };
}

export type UseNotesPageReturn = ReturnType<typeof useNotesPage>;
