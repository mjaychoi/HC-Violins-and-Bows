import type { Instrument } from '@/types';
import { todayLocalYMD } from '@/utils/dateParsing';
import { formatCSV } from '@/utils/formatUtils';

export const ITEM_CSV_HEADERS = [
  'Item Number',
  'Maker',
  'Type',
  'Year',
  'Retail Price',
  'Certificate',
  'Note',
  'Status',
] as const;

function certificateValue(item: Instrument): string {
  if (!item.certificate) return 'No';

  const certificateName = item.certificate_name?.trim();
  return certificateName || 'Yes';
}

export function generateItemCSV(items: Instrument[]): string {
  const rows = items.map(item => ({
    'Item Number': item.serial_number,
    Maker: item.maker,
    Type: item.type,
    Year: item.year,
    'Retail Price': item.price,
    Certificate: certificateValue(item),
    Note: item.note,
    Status: item.status,
  }));

  return formatCSV(rows, [...ITEM_CSV_HEADERS]);
}

export function downloadItemCSV(items: Instrument[]): string {
  const csv = generateItemCSV(items);
  const filename = `items-${todayLocalYMD()}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  let appended = false;

  try {
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    appended = true;
    link.click();
  } finally {
    if (appended) link.remove();
    URL.revokeObjectURL(url);
  }

  return filename;
}
