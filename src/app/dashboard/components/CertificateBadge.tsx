// FIXED: Accept boolean | null | undefined to handle DB nullable fields
interface CertificateBadgeProps {
  certificate?: boolean | null;
}

export default function CertificateBadge({
  certificate,
}: CertificateBadgeProps) {
  // FIXED: Handle null/undefined with explicit nullish coalescing
  const value = certificate ?? null;

  const className =
    value === true
      ? 'bg-green-50 text-green-700 ring-1 ring-green-100'
      : value === false
        ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
        : 'bg-gray-50 text-gray-700 ring-1 ring-gray-100';

  const icon = value === true ? '✓' : value === false ? '✗' : '?';
  const text = value === true ? 'Yes' : value === false ? 'No' : 'Unknown';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${className}`}
      aria-label={`Certificate: ${text}`}
      title={`Certificate: ${text}`}
    >
      {/* FIXED: Mark icon as aria-hidden for better accessibility */}
      <span aria-hidden="true">{icon}</span>
      {text}
    </span>
  );
}
