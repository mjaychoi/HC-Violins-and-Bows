import React from 'react';
import { getCertificateColor } from '@/utils/colorTokens';

interface CertificateBadgeProps {
  hasCertificate: boolean;
  certificateName?: string | null;
}

function CertificateBadge({
  hasCertificate,
  certificateName,
}: CertificateBadgeProps) {
  const text = hasCertificate
    ? certificateName?.trim() || 'Certificate'
    : 'No certificate';
  const icon = hasCertificate ? '✓' : '✗';
  const className = getCertificateColor(hasCertificate);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium ${className}`}
      aria-label={`Certificate: ${text}`}
      title={`Certificate: ${text}`}
    >
      <span aria-hidden="true">{icon}</span>
      {text}
    </span>
  );
}

export default React.memo(CertificateBadge);
