import SearchInput from '@/components/common/SearchInput';

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
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Tags:</span>
          <button
            onClick={() => onTagFilterChange(null)}
            className={`px-3 py-1 rounded-full text-sm ${
              tagFilter === null
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            All
          </button>
          {availableTags.map(tag => (
            <button
              key={tag}
              onClick={() =>
                onTagFilterChange(tagFilter === tag ? null : tag)
              }
              className={`px-3 py-1 rounded-full text-sm ${
                tagFilter === tag
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort:</span>
          <select
            value={sortBy}
            onChange={e =>
              onSortChange(e.target.value as 'name' | 'spend' | 'recent')
            }
            className="text-sm border border-gray-200 rounded-md px-2 py-1"
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
