import React from 'react';
// FIXED: Accept boolean | null | undefined to handle DB nullable fields
import { getCertificateColor } from '@/utils/colorTokens';

interface CertificateBadgeProps {
  certificate?: boolean | null;
}

// ✅ FIXED: 3상태 매핑을 object로 묶어서 가독성 및 실수 방지
const CERTIFICATE_META = {
  true: { icon: '✓', text: 'Yes' },
  false: { icon: '✗', text: 'No' },
  null: { icon: '?', text: 'Unknown' },
} as const;

function CertificateBadge({ certificate }: CertificateBadgeProps) {
  // ✅ FIXED: "이 값은 raw prop이 아니라 정규화된 값이다"가 바로 읽힘
  const normalizedCertificate = certificate ?? null;

  // ✅ FIXED: Use centralized color tokens to prevent conflicts with Status colors
  const className = getCertificateColor(normalizedCertificate);

  // ✅ FIXED: object lookup으로 더 명확하고 실수 방지
  const meta =
    CERTIFICATE_META[
      String(normalizedCertificate) as 'true' | 'false' | 'null'
    ];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium ${className}`}
      aria-label={`Certificate: ${meta.text}`}
      title={`Certificate: ${meta.text}`}
    >
      {/* FIXED: Mark icon as aria-hidden for better accessibility */}
      <span aria-hidden="true">{meta.icon}</span>
      {meta.text}
    </span>
  );
}

export default React.memo(CertificateBadge);
