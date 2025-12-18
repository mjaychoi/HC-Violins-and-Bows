import { Client, SalesHistory, Instrument } from '@/types';

export type Purchase = {
  id: string;
  item: string; // instrument name or notes
  amount: number;
  date: string;
  status: 'Completed' | 'Refunded' | 'Unknown' | 'Pending';
};

export type CustomerWithPurchases = Client & {
  purchases: Purchase[];
  lastPurchaseAt: string | null; // ✅ Raw ISO date string for sorting (not formatted)
};

// Helper function to convert SalesHistory to Purchase
export function salesHistoryToPurchase(
  sale: SalesHistory,
  instrument?: Instrument | null
): Purchase {
  const itemName = instrument
    ? `${instrument.maker || ''} ${instrument.type || ''}`.trim() ||
      sale.notes ||
      'Unknown Item'
    : sale.notes || 'Unknown Item';

  // Determine status based on sale_price
  // Positive = Completed, Negative = Refunded, 0 = Unknown (shouldn't happen in normal flow)
  const status: 'Completed' | 'Refunded' | 'Unknown' =
    sale.sale_price > 0
      ? 'Completed'
      : sale.sale_price < 0
        ? 'Refunded'
        : 'Unknown';

  // Log unexpected sale_price === 0 for monitoring (dev only)
  if (sale.sale_price === 0 && process.env.NODE_ENV === 'development') {
    console.warn(
      '[salesHistoryToPurchase] Unexpected sale_price === 0:',
      sale.id
    );
  }

  return {
    id: sale.id,
    item: itemName,
    amount: Math.abs(sale.sale_price), // Always show positive amount
    date: sale.sale_date,
    status,
  };
}
