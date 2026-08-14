'use client';

import { AppLayout } from '@/components/layout';
import { ConfirmDialog } from '@/components/common/modals';
import { NoteEditor } from './components/NoteEditor';
import { NotesList } from './components/NotesList';
import { NotesToolbar } from './components/NotesToolbar';
import { useNotesPage } from './hooks/useNotesPage';

export default function NotesPage() {
  const notes = useNotesPage();

  return (
    <AppLayout title="Notes">
      <div className="h-[calc(100vh-64px)] flex flex-col">
        <NotesToolbar
          viewMode={notes.viewMode}
          isDesktop={notes.isDesktop}
          statusMessage={notes.statusMessage}
          hasError={Boolean(notes.loadError || notes.saveError)}
          saveStatus={notes.saveStatus}
          canMutateNotes={notes.canMutateNotes}
          isCreatingNote={notes.isCreatingNote}
          mutateDisabledReason={notes.mutateDisabledReason}
          searchQuery={notes.visibleSearchQuery}
          debouncedSearch={notes.debouncedSearch}
          matchCount={notes.matchCount}
          onBackToList={notes.handleBackToList}
          onCreate={() => {
            void notes.handleCreateNote();
          }}
          onSearchChange={notes.handleSearchChange}
          onClearSearch={notes.handleClearSearch}
        />

        <div className="flex flex-1 overflow-hidden">
          <NotesList
            notes={notes.filteredNotes}
            selectedNoteId={notes.selectedNoteId}
            isLoading={notes.isLoading}
            loadError={notes.loadError}
            searchQuery={notes.visibleSearchQuery}
            canMutateNotes={notes.canMutateNotes}
            mutateDisabledReason={notes.mutateDisabledReason}
            onSelect={notes.handleSelectNote}
            onDelete={notes.handleDeleteNote}
            onCreate={() => {
              void notes.handleCreateNote();
            }}
            onClearSearch={notes.handleClearSearch}
            hiddenOnMobileEdit={notes.viewMode === 'edit'}
          />

          <NoteEditor
            note={notes.currentNote}
            isLoading={notes.isLoading}
            canMutateNotes={notes.canMutateNotes}
            viewMode={notes.viewMode}
            debouncedSearch={notes.debouncedSearch}
            matchCount={notes.matchCount}
            selectedNoteMatchesSearch={notes.selectedNoteMatchesSearch}
            stats={notes.stats}
            titleInputRef={notes.titleInputRef}
            contentTextareaRef={notes.contentTextareaRef}
            onTitleChange={notes.handleTitleChange}
            onContentChange={notes.handleContentChange}
            onKeyDown={notes.handleKeyDown}
            onCreate={() => {
              void notes.handleCreateNote();
            }}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!notes.deleteConfirmNote && notes.canMutateNotes}
        onCancel={notes.handleCancelDelete}
        onConfirm={() => {
          void notes.handleConfirmDelete();
        }}
        title="Delete Note"
        message={
          notes.deleteConfirmNote
            ? `Are you sure you want to delete "${notes.deleteConfirmNote.title || 'Untitled'}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive={true}
      />
    </AppLayout>
  );
}
