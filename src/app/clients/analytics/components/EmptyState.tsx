// ✅ FIXED: Renamed to avoid conflict with common/EmptyState
// This component is a simple inline empty state for analytics
export function InlineEmptyState({ message }: { message: string }) {
  return (
    <div className="border rounded-lg p-6 text-center text-gray-500 bg-white shadow-sm">
      {message}
    </div>
  );
}
