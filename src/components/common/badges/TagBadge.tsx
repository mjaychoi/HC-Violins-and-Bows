import { getTagColor } from '@/app/clients/utils';
import { getTagDisplayLabel } from '@/app/clients/utils';

export interface TagBadgeProps {
  tag: string;
  /** 테이블 기본: muted, 카드/모달: soft */
  context?: 'table' | 'card';
}

export default function TagBadge({ tag, context = 'table' }: TagBadgeProps) {
  const variant = context === 'table' ? 'muted' : 'soft';
  const className = getTagColor(tag, variant);

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}
      aria-label={`Tag: ${getTagDisplayLabel(tag)}`}
      title={getTagDisplayLabel(tag)}
    >
      {getTagDisplayLabel(tag)}
    </span>
  );
}
