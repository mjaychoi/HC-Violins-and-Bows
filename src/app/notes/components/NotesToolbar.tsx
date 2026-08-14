'use client';

import { Input, Button } from '@/components/common/inputs';
import { cn } from '@/utils/classNames';

interface NotesToolbarProps {
  viewMode: 'list' | 'edit';
  isDesktop: boolean;
  statusMessage: string;
  hasError: boolean;
  saveStatus: 'saved' | 'saving' | null;
  canMutateNotes: boolean;
  isCreatingNote?: boolean;
  mutateDisabledReason?: string;
  searchQuery: string;
  debouncedSearch: string;
  matchCount: number;
  onBackToList: () => void;
  onCreate: () => void;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
}

export function NotesToolbar({
  viewMode,
  isDesktop,
  statusMessage,
  hasError,
  saveStatus,
  canMutateNotes,
  isCreatingNote = false,
  mutateDisabledReason,
  searchQuery,
  debouncedSearch,
  matchCount,
  onBackToList,
  onCreate,
  onSearchChange,
  onClearSearch,
}: NotesToolbarProps) {
  return (
    <div className="shrink-0 p-4 md:p-6 pb-4 border-b border-gray-200 bg-white">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            {viewMode === 'edit' && (
              <button
                onClick={onBackToList}
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
          <p
            className={cn(
              'text-xs md:text-sm',
              hasError ? 'text-red-600 font-medium' : 'text-gray-500'
            )}
            role={hasError ? 'alert' : undefined}
          >
            {statusMessage}
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-4 shrink-0 ml-2">
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
            onClick={onCreate}
            disabled={!canMutateNotes || isCreatingNote}
            title={isCreatingNote ? 'Creating note' : mutateDisabledReason}
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

      {(viewMode === 'list' || isDesktop) && (
        <div className="relative">
          <Input
            id="search"
            label="Search"
            name="search"
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
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
                onClick={onClearSearch}
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
  );
}
