export function EmptyState({ message }: { message: string }) {
  return (
    <div className="border rounded-lg p-6 text-center text-gray-500 bg-white shadow-sm">
      {message}
    </div>
  );
}
