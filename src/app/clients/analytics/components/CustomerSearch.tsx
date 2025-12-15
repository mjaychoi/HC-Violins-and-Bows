import { useState, useRef, useEffect } from 'react';
import { SearchInput } from '@/components/common/inputs';
import { EmptyState } from '@/components/common';

interface CustomerSearchProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  tagFilter: string | null;
  onTagFilterChange: (tag: string | null) => void;
  sortBy: 'name' | 'spend' | 'recent';
  onSortChange: (sort: 'name' | 'spend' | 'recent') => void;
  availableTags: string[];
}

export function CustomerSearch({
  searchTerm,
  onSearchChange,
  tagFilter,
  onTagFilterChange,
  sortBy,
  onSortChange,
  availableTags,
}: CustomerSearchProps) {
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [tagSearchTerm, setTagSearchTerm] = useState('');
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(event.target as Node)
      ) {
        setIsTagDropdownOpen(false);
        setTagSearchTerm('');
      }
    };

    if (isTagDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isTagDropdownOpen]);

  // Filter tags based on search term
  const filteredTags = availableTags.filter(tag =>
    tag.toLowerCase().includes(tagSearchTerm.toLowerCase())
  );

  // Show top 5 tags as chips, rest in dropdown
  const topTags = availableTags.slice(0, 5);
  const remainingTags = availableTags.slice(5);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="w-full lg:max-w-lg">
        <SearchInput
          value={searchTerm}
          onChange={onSearchChange}
          placeholder="Search customers by name, email, or tag..."
        />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {/* Tag Filter - Improved UI */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Tags:</span>
          {/* Top tags as chips */}
          {topTags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => onTagFilterChange(null)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  tagFilter === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {topTags.map(tag => (
                <button
                  key={tag}
                  onClick={() =>
                    onTagFilterChange(tagFilter === tag ? null : tag)
                  }
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    tagFilter === tag
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
          {/* Dropdown for remaining tags or all tags if many */}
          {availableTags.length > 5 && (
            <div className="relative" ref={tagDropdownRef}>
              <button
                onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  tagFilter && !topTags.includes(tagFilter)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                aria-expanded={isTagDropdownOpen}
                aria-haspopup="listbox"
              >
                {tagFilter && !topTags.includes(tagFilter)
                  ? tagFilter
                  : `+${remainingTags.length} more`}
                <svg
                  className={`ml-1 h-3 w-3 inline transition-transform ${
                    isTagDropdownOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {isTagDropdownOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-64 overflow-hidden flex flex-col">
                  {/* Search input for tags */}
                  <div className="p-2 border-b border-gray-200">
                    <input
                      type="text"
                      value={tagSearchTerm}
                      onChange={e => setTagSearchTerm(e.target.value)}
                      placeholder="Search tags..."
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  {/* Tag list */}
                  <div
                    className="overflow-y-auto"
                    role="listbox"
                    aria-label="Tag filter options"
                  >
                    {filteredTags.length > 0 ? (
                      filteredTags.map(tag => (
                        <button
                          key={tag}
                          role="option"
                          aria-selected={tagFilter === tag}
                          onClick={() => {
                            onTagFilterChange(tagFilter === tag ? null : tag);
                            setIsTagDropdownOpen(false);
                            setTagSearchTerm('');
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                            tagFilter === tag
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-gray-700'
                          }`}
                        >
                          {tag}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2">
                        <EmptyState
                          title="No tags found"
                          description="Try a different keyword or clear the tag filter."
                          className="shadow-none border-none text-left"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort:</span>
          <select
            value={sortBy}
            onChange={e =>
              onSortChange(e.target.value as 'name' | 'spend' | 'recent')
            }
            className="text-sm border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="name">Name</option>
            <option value="spend">Total spend</option>
            <option value="recent">Recent activity</option>
          </select>
        </div>
      </div>
    </div>
  );
}
