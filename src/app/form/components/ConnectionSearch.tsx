'use client';

interface ConnectionSearchProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  placeholder?: string;
}

export default function ConnectionSearch({
  searchTerm,
  onSearchChange,
  placeholder = 'Search by client, instrument, or relationship type...',
}: ConnectionSearchProps) {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg
          className="h-5 w-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={searchTerm}
        onChange={e => onSearchChange(e.target.value)}
        className="w-full pl-10 pr-4 py-3 lg:py-2.5 border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:border-gray-300 transition-all duration-200"
      />
    </div>
  );
}
