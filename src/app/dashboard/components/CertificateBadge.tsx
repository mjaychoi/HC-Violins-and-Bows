import React from 'react';
// FIXED: Accept boolean | null | undefined to handle DB nullable fields
import { getCertificateColor } from '@/utils/colorTokens';

interface CertificateBadgeProps {
  certificate?: boolean | null;
}

function CertificateBadge({ certificate }: CertificateBadgeProps) {
  // FIXED: Handle null/undefined with explicit nullish coalescing
  const value = certificate ?? null;

  // ✅ FIXED: Use centralized color tokens to prevent conflicts with Status colors
  const className = getCertificateColor(value);

  const icon = value === true ? '✓' : value === false ? '✗' : '?';
  const text = value === true ? 'Yes' : value === false ? 'No' : 'Unknown';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium ${className}`}
      aria-label={`Certificate: ${text}`}
      title={`Certificate: ${text}`}
    >
      {/* FIXED: Mark icon as aria-hidden for better accessibility */}
      <span aria-hidden="true">{icon}</span>
      {text}
    </span>
  );
}

export default React.memo(CertificateBadge);
