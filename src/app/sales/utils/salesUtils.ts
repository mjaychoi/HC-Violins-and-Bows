// FIXED: Removed unused imports - format, startOfMonth, endOfMonth, subDays, subMonths, differenceInDays no longer used
import { differenceInMonths, differenceInCalendarDays } from 'date-fns';
import { EnrichedSale, Client, Instrument, SalesHistory } from '@/types';
import { SalesTotals, DataQuality, DatePreset } from '../types';
import {
  parseYMDUTC,
  formatDisplayDate,
  formatCompactDate,
  formatMonth,
} from '@/utils/dateParsing';

/**
 * 클라이언트와 악기 맵을 생성합니다.
 */
export function createMaps(clients: Client[], instruments: Instrument[]) {
  const clientMap = new Map(clients.map(client => [client.id, client]));
  const instrumentMap = new Map(
    instruments.map(instrument => [instrument.id, instrument])
  );
  return { clientMap, instrumentMap };
}

/**
 * 판매 데이터를 클라이언트와 악기 정보로 보강합니다.
 */
export function enrichSales(
  sales: SalesHistory[],
  clientMap: Map<string, Client>,
  instrumentMap: Map<string, Instrument>
): EnrichedSale[] {
  return sales.map(sale => ({
    ...sale,
    client: sale.client_id ? clientMap.get(sale.client_id) : undefined,
    instrument: sale.instrument_id
      ? instrumentMap.get(sale.instrument_id)
      : undefined,
  })) as EnrichedSale[];
}

/**
 * 검색어로 판매 데이터를 필터링합니다.
 */
export function filterSalesBySearch(
  sales: EnrichedSale[],
  search: string
): EnrichedSale[] {
  if (!search) return sales;

  const searchLower = search.toLowerCase();
  return sales.filter(sale => {
    const clientName = sale.client
      ? `${sale.client.first_name || ''} ${sale.client.last_name || ''}`.toLowerCase()
      : '';
    const clientEmail = sale.client?.email?.toLowerCase() || '';
    const instrumentInfo = sale.instrument
      ? `${sale.instrument.maker || ''} ${sale.instrument.type || ''} ${sale.instrument.subtype || ''} ${sale.instrument.serial_number || ''}`.toLowerCase()
      : '';

    return (
      clientName.includes(searchLower) ||
      clientEmail.includes(searchLower) ||
      instrumentInfo.includes(searchLower)
    );
  });
}

/**
 * 클라이언트 이름으로 정렬합니다.
 */
export function sortByClientName(
  sales: EnrichedSale[],
  direction: 'asc' | 'desc'
): EnrichedSale[] {
  return [...sales].sort((a, b) => {
    const aValue = a.client
      ? `${a.client.first_name || ''} ${a.client.last_name || ''}`.trim() ||
        a.client.email ||
        ''
      : '';
    const bValue = b.client
      ? `${b.client.first_name || ''} ${b.client.last_name || ''}`.trim() ||
        b.client.email ||
        ''
      : '';

    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * 판매 통계를 계산합니다.
 *
 * Note: count는 전체 트랜잭션 수(환불 포함)를 의미합니다.
 * avgTicket은 양수 거래(정상 결제)만으로 계산되므로, 양수 거래 개수(positiveSales.length)와 다른 의미입니다.
 */
export function calculateTotals(sales: EnrichedSale[]): SalesTotals {
  const positiveSales = sales.filter(sale => sale.sale_price > 0);
  const revenue = positiveSales.reduce((sum, sale) => sum + sale.sale_price, 0);
  const refund = sales.reduce(
    (sum, sale) =>
      sale.sale_price < 0 ? sum + Math.abs(sale.sale_price) : sum,
    0
  );
  const avgTicket = positiveSales.length ? revenue / positiveSales.length : 0;
  const totalSales = revenue + refund;
  const refundRate =
    totalSales > 0 ? Math.round((refund / totalSales) * 100 * 10) / 10 : 0;

  return { revenue, refund, avgTicket, count: sales.length, refundRate };
}

/**
 * 기간 정보를 포맷팅합니다.
 * FIXED: Use parseYMDUTC to avoid timezone issues
 */
export function formatPeriodInfo(from: string, to: string): string {
  if (from && to) {
    try {
      // FIXED: Use parseYMDUTC instead of parseISO to avoid timezone shifts
      const fromDate = parseYMDUTC(from);
      const toDate = parseYMDUTC(to);
      const days = differenceInCalendarDays(toDate, fromDate) + 1;
      const months = differenceInMonths(toDate, fromDate);

      // FIXED: Use unified date formatters for consistency
      if (days <= 1) {
        return formatDisplayDate(from);
      } else if (days <= 7) {
        return `${days} days`;
      } else if (months < 1) {
        return `${formatCompactDate(from)} - ${formatDisplayDate(to)}`;
      } else if (
        months === 1 &&
        fromDate.getUTCDate() === 1 &&
        toDate.getUTCDate() ===
          new Date(
            Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() + 1, 0)
          ).getUTCDate()
      ) {
        // Full month: use formatMonth for month name
        return formatMonth(from);
      } else {
        return `${formatDisplayDate(from)} - ${formatDisplayDate(to)}`;
      }
    } catch {
      return 'Selected period';
    }
  } else if (from) {
    try {
      // FIXED: Use unified date formatter for consistency
      return `Since ${formatDisplayDate(from)}`;
    } catch {
      return 'Since selected date';
    }
  } else if (to) {
    try {
      // FIXED: Use unified date formatter for consistency
      return `Until ${formatDisplayDate(to)}`;
    } catch {
      return 'Until selected date';
    }
  } else {
    return 'All time';
  }
}

/**
 * 데이터 품질을 체크합니다.
 *
 * Performance: O(n) - 평균값을 한 번만 계산하여 outlier 체크
 */
export function checkDataQuality(
  sales: EnrichedSale[],
  totalCount?: number
): DataQuality {
  const positiveSales = sales.filter(sale => sale.sale_price > 0);

  // totalCount가 제공되면 전체 데이터 수를 기준으로 판단 (페이지네이션된 경우)
  // totalCount가 없거나 sales.length가 totalCount와 같으면 전체 데이터로 간주
  const effectiveCount =
    totalCount !== undefined ? totalCount : positiveSales.length;
  const isFullDataset = totalCount === undefined || sales.length === totalCount;

  // 페이지네이션된 데이터는 샘플로 간주하여 기준을 더 관대하게 적용
  // 전체 데이터가 20개 이상이면 충분한 것으로 간주
  const hasInsufficientData = effectiveCount < 20;

  let hasOutliers = false;
  let hasSparseDates = false;

  if (positiveSales.length > 0) {
    // 평균을 한 번만 계산 (O(n))
    const avg =
      positiveSales.reduce((sum, s) => sum + s.sale_price, 0) /
      positiveSales.length;

    // 평균이 0이 아닐 때만 outlier 체크 (모든 가격이 0인 경우 스킵)
    // Outlier 체크: 전체 데이터가 많으면 outlier가 정상적일 수 있으므로 더 관대하게
    if (
      avg > 0 &&
      (isFullDataset ? positiveSales.length >= 10 : effectiveCount >= 20)
    ) {
      // 전체 데이터인 경우 10배, 샘플인 경우 20배 이상 차이일 때만 outlier로 간주
      const outlierThreshold = isFullDataset ? 10 : 20;
      hasOutliers = positiveSales.some(
        sale => Math.abs(sale.sale_price - avg) > avg * outlierThreshold
      );
    }

    // 날짜 분산 체크
    // FIXED: Use parseYMDUTC instead of parseISO to avoid timezone issues
    const dates = [...new Set(positiveSales.map(s => s.sale_date))].sort();
    if (dates.length < 2) {
      hasSparseDates = true;
    } else {
      const first = parseYMDUTC(dates[0]);
      const last = parseYMDUTC(dates[dates.length - 1]);
      const days = differenceInCalendarDays(last, first);

      // 전체 데이터가 많으면 (50개 이상) sparse로 간주하지 않음
      // 또는 날짜 비율이 3% 미만이고 거래 수가 적을 때만 sparse로 간주
      const sparseThreshold = isFullDataset ? 0.03 : 0.05;
      const minCountForSparse = isFullDataset ? 50 : 100;
      hasSparseDates =
        effectiveCount < minCountForSparse &&
        days > 0 &&
        dates.length / days < sparseThreshold;
    }
  }

  return {
    hasInsufficientData,
    hasOutliers,
    hasSparseDates,
    isLowQuality: hasInsufficientData || hasOutliers || hasSparseDates,
  };
}

/**
 * 날짜 프리셋에 따라 날짜 범위를 계산합니다.
 * FIXED: Use UTC for "today" to match server date interpretation
 */
export function getDateRangeFromPreset(preset: DatePreset): {
  from: string;
  to: string;
} {
  // FIXED: Get today in UTC to match server date interpretation (date-only strings are treated as UTC)
  const today = new Date();
  const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

  // FIXED: Use UTC date calculations for consistency with server date interpretation
  switch (preset) {
    case 'last7': {
      const last7Date = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate() - 6
        )
      );
      const from = `${last7Date.getUTCFullYear()}-${String(last7Date.getUTCMonth() + 1).padStart(2, '0')}-${String(last7Date.getUTCDate()).padStart(2, '0')}`;
      return { from, to: todayStr };
    }
    case 'thisMonth': {
      const monthStart = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
      );
      const from = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}-${String(monthStart.getUTCDate()).padStart(2, '0')}`;
      return { from, to: todayStr };
    }
    case 'lastMonth': {
      const lastMonth = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
      );
      const lastMonthEnd = new Date(
        Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 0)
      );
      const from = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(lastMonth.getUTCDate()).padStart(2, '0')}`;
      const to = `${lastMonthEnd.getUTCFullYear()}-${String(lastMonthEnd.getUTCMonth() + 1).padStart(2, '0')}-${String(lastMonthEnd.getUTCDate()).padStart(2, '0')}`;
      return { from, to };
    }
    case 'last3Months': {
      const threeMonthsAgo = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1)
      );
      const from = `${threeMonthsAgo.getUTCFullYear()}-${String(threeMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(threeMonthsAgo.getUTCDate()).padStart(2, '0')}`;
      return { from, to: todayStr };
    }
    case 'last12Months': {
      const twelveMonthsAgo = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1)
      );
      const from = `${twelveMonthsAgo.getUTCFullYear()}-${String(twelveMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(twelveMonthsAgo.getUTCDate()).padStart(2, '0')}`;
      return { from, to: todayStr };
    }
  }
}

/**
 * CSV 데이터를 생성합니다.
 * FIXED: Use parseYMDUTC to avoid timezone issues
 */
export function generateCSV(
  sales: EnrichedSale[],
  dateFormat: Intl.DateTimeFormat,
  currency: Intl.NumberFormat
) {
  const headers = [
    'Date',
    'Sale ID',
    'Client Name',
    'Client Email',
    'Instrument',
    'Amount',
    'Status',
    'Notes',
  ];
  const csvData = sales.map(sale => ({
    // FIXED: Use parseYMDUTC instead of parseISO to avoid timezone shifts
    Date: dateFormat.format(parseYMDUTC(sale.sale_date)),
    'Sale ID': sale.id,
    'Client Name': sale.client
      ? `${sale.client.first_name || ''} ${sale.client.last_name || ''}`.trim() ||
        'N/A'
      : 'N/A',
    'Client Email': sale.client?.email || 'N/A',
    Instrument: sale.instrument
      ? `${sale.instrument.maker || ''} ${sale.instrument.type || ''} ${sale.instrument.subtype || ''}`.trim() ||
        'N/A'
      : 'N/A',
    Amount: currency.format(Math.abs(sale.sale_price)),
    Status: sale.sale_price < 0 ? 'Refunded' : 'Paid',
    Notes: sale.notes || '',
  }));

  const csvContent = [
    headers.join(','),
    ...csvData.map(row =>
      headers
        .map(header => {
          const value = row[header as keyof typeof row];
          if (
            typeof value === 'string' &&
            (value.includes(',') || value.includes('"') || value.includes('\n'))
          ) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value || '';
        })
        .join(',')
    ),
  ].join('\n');

  return csvContent;
}

/**
 * 영수증 이메일 본문을 생성합니다.
 * FIXED: Use parseYMDUTC to avoid timezone issues
 */
export function generateReceiptEmail(
  sale: EnrichedSale,
  dateFormat: Intl.DateTimeFormat,
  currency: Intl.NumberFormat
) {
  const clientName = sale.client
    ? `${sale.client.first_name || ''} ${sale.client.last_name || ''}`.trim() ||
      sale.client.email
    : 'Customer';

  const instrumentInfo = sale.instrument
    ? `${sale.instrument.maker || ''} ${sale.instrument.type || ''}`.trim()
    : sale.instrument_id || 'N/A';

  const subject = encodeURIComponent(
    `Receipt for Sale #${sale.id.slice(0, 8)}`
  );
  const body = encodeURIComponent(
    [
      `Dear ${clientName},`,
      '',
      'Thank you for your purchase!',
      '',
      '--- Sale Details ---',
      // FIXED: Use parseYMDUTC instead of parseISO to avoid timezone shifts
      `Date: ${dateFormat.format(parseYMDUTC(sale.sale_date))}`,
      `Amount: ${currency.format(Math.abs(sale.sale_price))}`,
      instrumentInfo !== 'N/A' ? `Instrument: ${instrumentInfo}` : '',
      sale.notes ? `Notes: ${sale.notes}` : '',
      '',
      'We appreciate your business!',
      '',
      'Best regards,',
      'HC Violins and Bows',
    ]
      .filter(Boolean)
      .join('\n')
  );

  return { subject, body };
}
