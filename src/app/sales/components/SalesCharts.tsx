'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { EnrichedSale } from '@/types';
import { currency } from '../utils/salesFormatters';
import {
  toDateOnly,
  parseYMDLocal,
  formatCompactDate,
  formatMonth,
} from '@/utils/dateParsing';

interface SalesChartsProps {
  sales: EnrichedSale[];
  fromDate?: string;
  toDate?: string;
  onDateFilter?: (from: string, to: string) => void;
  onClientFilter?: (clientId: string) => void;
  onInstrumentFilter?: (instrumentId: string) => void;
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SalesCharts({
  sales,
  fromDate,
  toDate,
  onDateFilter,
  onClientFilter,
  onInstrumentFilter,
}: SalesChartsProps) {
  // 날짜 필터 적용된 데이터
  // FIXED: Normalize date strings to date-only format (YYYY-MM-DD) to handle ISO timestamps
  // This prevents issues when sale_date comes as ISO timestamp (e.g., 2025-12-13T00:00:00Z)
  const filteredSales = useMemo(() => {
    const from = toDateOnly(fromDate);
    const to = toDateOnly(toDate);

    if (!from && !to) return sales;

    return sales.filter(sale => {
      const saleDate = toDateOnly(sale.sale_date);
      if (!saleDate) return false;
      if (from && saleDate < from) return false;
      if (to && saleDate > to) return false;
      return true;
    });
  }, [sales, fromDate, toDate]);

  // 일별 매출 데이터 준비 (변동 감지용)
  const dailyData = useMemo(() => {
    const dailyMap = new Map<
      string,
      { revenue: number; refunds: number; count: number }
    >();

    filteredSales.forEach(sale => {
      // FIXED: Normalize to date-only to prevent grouping issues with timestamps
      const date = toDateOnly(sale.sale_date); // YYYY-MM-DD 형식
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { revenue: 0, refunds: 0, count: 0 });
      }

      const dayData = dailyMap.get(date)!;
      if (sale.sale_price > 0) {
        dayData.revenue += sale.sale_price;
        dayData.count += 1;
      } else {
        dayData.refunds += Math.abs(sale.sale_price);
      }
    });

    return Array.from(dailyMap.entries())
      .map(([dateStr, data]) => {
        // FIXED: Use unified date formatter for consistency
        const formattedDate = formatCompactDate(dateStr);

        return {
          date: formattedDate,
          fullDate: dateStr,
          revenue: data.revenue,
          refunds: data.refunds,
          net: data.revenue - data.refunds,
          count: data.count,
        };
      })
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [filteredSales]);

  // 요일별 매출 데이터 준비 (패턴 분석용)
  const weekdayData = useMemo(() => {
    const weekdayMap = new Map<
      number,
      { revenue: number; refunds: number; count: number }
    >();

    filteredSales.forEach(sale => {
      // FIXED: Use parseYMDLocal for day-of-week calculations (local timezone)
      const saleDay = parseYMDLocal(sale.sale_date);
      if (!saleDay) return;
      const dayOfWeek = saleDay.getDay(); // Local day of week (0 = Sunday, 6 = Saturday)

      if (!weekdayMap.has(dayOfWeek)) {
        weekdayMap.set(dayOfWeek, { revenue: 0, refunds: 0, count: 0 });
      }

      const dayData = weekdayMap.get(dayOfWeek)!;
      if (sale.sale_price > 0) {
        dayData.revenue += sale.sale_price;
        dayData.count += 1;
      } else {
        dayData.refunds += Math.abs(sale.sale_price);
      }
    });

    return Array.from({ length: 7 }, (_, i) => {
      const data = weekdayMap.get(i) || { revenue: 0, refunds: 0, count: 0 };
      return {
        day: dayNames[i],
        dayIndex: i,
        revenue: data.revenue,
        refunds: data.refunds,
        net: data.revenue - data.refunds,
        count: data.count,
      };
    });
  }, [filteredSales]);

  // 월별 매출 데이터 준비 (성장률/추세 분석용, 최근 12개월)
  const monthlyData = useMemo(() => {
    const monthlyMap = new Map<
      string,
      { revenue: number; refunds: number; count: number }
    >();

    filteredSales.forEach(sale => {
      // FIXED: Normalize to date-only first to handle timestamps
      // YYYY-MM-DD 형식에서 월 키 추출 (타임존 이슈 방지)
      const dateOnly = toDateOnly(sale.sale_date);
      const [year, month] = dateOnly.split('-');
      const monthKey = `${year}-${month}`;

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { revenue: 0, refunds: 0, count: 0 });
      }

      const monthData = monthlyMap.get(monthKey)!;
      if (sale.sale_price > 0) {
        monthData.revenue += sale.sale_price;
        monthData.count += 1;
      } else {
        monthData.refunds += Math.abs(sale.sale_price);
      }
    });

    return Array.from(monthlyMap.entries())
      .map(([key, data]) => {
        // FIXED: Use unified date formatter for consistency
        const monthLabel = formatMonth(`${key}-01`);

        // FIXED: Refund rate should be refunds relative to revenue (not total flow)
        const refundRate =
          data.revenue > 0 ? (data.refunds / data.revenue) * 100 : 0;

        return {
          month: monthLabel,
          monthKey: key,
          revenue: data.revenue,
          refunds: data.refunds,
          net: data.revenue - data.refunds,
          count: data.count,
          refundRate: Math.round(refundRate * 10) / 10, // 소수점 1자리
        };
      })
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .slice(-12); // 최근 12개월만
  }, [filteredSales]);

  // 악기 타입별 매출 데이터 (Top 10, Count와 Margin 정보 포함)
  const instrumentTypeData = useMemo(() => {
    const typeMap = new Map<
      string,
      { revenue: number; count: number; refunds: number }
    >();

    filteredSales.forEach(sale => {
      if (sale.instrument) {
        const type = sale.instrument.type || 'Missing instrument info';
        if (!typeMap.has(type)) {
          typeMap.set(type, { revenue: 0, count: 0, refunds: 0 });
        }
        const typeData = typeMap.get(type)!;
        if (sale.sale_price > 0) {
          typeData.revenue += sale.sale_price;
          typeData.count += 1;
        } else {
          typeData.refunds += Math.abs(sale.sale_price);
        }
      }
    });

    return Array.from(typeMap.entries())
      .map(([type, data]) => ({
        type,
        revenue: data.revenue,
        count: data.count,
        refunds: data.refunds,
        net: data.revenue - data.refunds,
        // FIXED: Refund rate should be refunds relative to revenue (not total flow)
        refundRate:
          data.revenue > 0
            ? Math.round((data.refunds / data.revenue) * 100 * 10) / 10
            : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filteredSales]);

  // Maker별 매출 데이터 (Top 10, Count와 Margin 정보 포함)
  const makerData = useMemo(() => {
    const makerMap = new Map<
      string,
      { revenue: number; count: number; refunds: number }
    >();

    filteredSales.forEach(sale => {
      if (sale.instrument?.maker) {
        const maker = sale.instrument.maker;
        if (!makerMap.has(maker)) {
          makerMap.set(maker, { revenue: 0, count: 0, refunds: 0 });
        }
        const makerData = makerMap.get(maker)!;
        if (sale.sale_price > 0) {
          makerData.revenue += sale.sale_price;
          makerData.count += 1;
        } else {
          makerData.refunds += Math.abs(sale.sale_price);
        }
      }
    });

    return Array.from(makerMap.entries())
      .map(([maker, data]) => ({
        maker,
        revenue: data.revenue,
        count: data.count,
        refunds: data.refunds,
        net: data.revenue - data.refunds,
        // FIXED: Refund rate should be refunds relative to revenue (not total flow)
        refundRate:
          data.revenue > 0
            ? Math.round((data.refunds / data.revenue) * 100 * 10) / 10
            : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filteredSales]);

  // Custom formatters
  // YAxis용 compact formatter (차트 축 라벨) - $28M 형식
  // FIXED: For small amounts, use integer format to avoid clutter
  const formatCurrencyCompact = (value: number) => {
    if (value === 0) return '$0';
    // For small amounts (< $1000), show as integer to reduce clutter
    if (Math.abs(value) < 1000) {
      return `$${Math.round(value)}`;
    }
    const absValue = Math.abs(value);

    // For amounts >= 1M, use M notation
    if (absValue >= 1000000) {
      const millions = value / 1000000;
      return `$${millions.toFixed(1)}M`;
    }
    // For amounts >= 1K, use K notation
    if (absValue >= 1000) {
      const thousands = value / 1000;
      return `$${thousands.toFixed(1)}K`;
    }
    // Otherwise use regular formatting
    return currency.format(value);
  };

  // Tooltip용 정확한 formatter (툴팁에서 정확한 금액 표시)
  const formatCurrency = (value: number) => {
    if (value === 0) return '$0';
    return currency.format(value);
  };

  const formatNumber = (value: number) => {
    // Orders 같은 정수는 쉼표 없이 표시할 수도 있지만, 일관성을 위해 currency formatter 사용
    return value.toLocaleString('en-US');
  };

  // 전체 환불율 계산 (성능 최적화: 한 번의 reduce로 계산)
  // FIXED: Refund rate should be refunds relative to revenue (not total flow)
  const overallRefundRate = useMemo(() => {
    const { revenue, refunds } = filteredSales.reduce(
      (acc, sale) => {
        if (sale.sale_price > 0) {
          acc.revenue += sale.sale_price;
        } else {
          acc.refunds += Math.abs(sale.sale_price);
        }
        return acc;
      },
      { revenue: 0, refunds: 0 }
    );
    return revenue > 0 ? Math.round((refunds / revenue) * 100 * 10) / 10 : 0;
  }, [filteredSales]);

  // Refund 원인 분석: 고객별 환불 데이터
  const refundByClient = useMemo(() => {
    const clientMap = new Map<
      string,
      { refunds: number; count: number; clientName: string }
    >();

    filteredSales
      .filter(sale => sale.sale_price < 0)
      .forEach(sale => {
        const clientId = sale.client_id || 'unknown';
        const clientName = sale.client
          ? `${sale.client.first_name || ''} ${sale.client.last_name || ''}`.trim() ||
            sale.client.email ||
            'Unknown'
          : 'Unknown';

        if (!clientMap.has(clientId)) {
          clientMap.set(clientId, { refunds: 0, count: 0, clientName });
        }
        const data = clientMap.get(clientId)!;
        data.refunds += Math.abs(sale.sale_price);
        data.count += 1;
      });

    return Array.from(clientMap.entries())
      .map(([clientId, data]) => ({
        clientId,
        clientName: data.clientName,
        refunds: data.refunds,
        count: data.count,
      }))
      .sort((a, b) => {
        // FIXED: Sort Unknown to bottom for better UX
        if (a.clientId === 'unknown') return 1;
        if (b.clientId === 'unknown') return -1;
        return b.refunds - a.refunds;
      })
      .slice(0, 10);
  }, [filteredSales]);

  // Refund 원인 분석: 악기별 환불 데이터
  const refundByInstrument = useMemo(() => {
    const instrumentMap = new Map<
      string,
      { refunds: number; count: number; instrumentInfo: string }
    >();

    filteredSales
      .filter(sale => sale.sale_price < 0 && sale.instrument)
      .forEach(sale => {
        const instrumentId = sale.instrument_id || 'unknown';
        const instrumentInfo = sale.instrument
          ? `${sale.instrument.maker || ''} ${sale.instrument.type || ''} ${sale.instrument.subtype || ''}`.trim() ||
            'Missing instrument info'
          : 'Missing instrument info';

        if (!instrumentMap.has(instrumentId)) {
          instrumentMap.set(instrumentId, {
            refunds: 0,
            count: 0,
            instrumentInfo,
          });
        }
        const data = instrumentMap.get(instrumentId)!;
        data.refunds += Math.abs(sale.sale_price);
        data.count += 1;
      });

    return Array.from(instrumentMap.entries())
      .map(([instrumentId, data]) => ({
        instrumentId,
        instrumentInfo: data.instrumentInfo,
        refunds: data.refunds,
        count: data.count,
      }))
      .sort((a, b) => {
        // FIXED: Sort Unknown to bottom for better UX
        if (a.instrumentId === 'unknown') return 1;
        if (b.instrumentId === 'unknown') return -1;
        return b.refunds - a.refunds;
      })
      .slice(0, 10);
  }, [filteredSales]);

  // FIXED: Helper to safely extract payload from Recharts click event
  function getFirstPayload<T extends { fullDate?: string; monthKey?: string }>(
    e: unknown
  ): T | null {
    const payload = (
      e as {
        activePayload?: Array<{
          payload?: T;
        }>;
        activeLabel?: string;
      }
    )?.activePayload;
    if (!payload || payload.length === 0 || !payload[0]?.payload) return null;
    return payload[0].payload as T;
  }

  // 차트 클릭 핸들러 (Drill-down)
  // FIXED: Improved click handler - guard against empty/stale activePayload
  const handleChartClick = (data: unknown, chartType: 'daily' | 'monthly') => {
    const payload = getFirstPayload<{ fullDate?: string; monthKey?: string }>(
      data
    );
    if (!payload || !onDateFilter) return;

    if (chartType === 'daily' && payload.fullDate) {
      // 일별 차트 클릭 시 해당 날짜로 필터링
      // FIXED: toDate is inclusive (matches filteredSales comparison logic)
      const fullDate = payload.fullDate;
      onDateFilter(fullDate, fullDate);
    } else if (chartType === 'monthly' && payload.monthKey) {
      // 월별 차트 클릭 시 해당 월로 필터링
      // FIXED: toDate is inclusive (matches filteredSales comparison logic)
      const monthKey = payload.monthKey;
      const [year, month] = monthKey.split('-');
      const from = `${year}-${month}-01`;
      // FIXED: Use UTC for lastDay calculation to avoid timezone issues (consistent with rest of file)
      const lastDay = new Date(
        Date.UTC(Number(year), Number(month), 0)
      ).getUTCDate();
      const to = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
      onDateFilter(from, to);
    }
  };

  // 데이터 품질 경고는 주석 처리됨 (Limited Data Available 경고 비활성화)

  if (filteredSales.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
        <p className="text-sm text-gray-500 text-center">
          No sales data available for charts
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 데이터 품질 경고 - 주석 처리 (Limited Data Available 경고 비활성화) */}
      {/* {dataQuality.isLowQuality && (
        <DataQualityWarning dataQuality={dataQuality} />
      )} */}
      {/* 일별 매출 추이 (라인 차트) - 변동 감지용 */}
      {dailyData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Daily Sales Trend
            </h3>
            <span className="text-xs text-gray-500">
              Click to filter by date
            </span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={dailyData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              onClick={data => handleChartClick(data, 'daily')}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                yAxisId="left"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={formatCurrencyCompact}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'Orders') return value;
                  return formatCurrency(value);
                }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '8px',
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                strokeWidth={2}
                name="Revenue"
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="refunds"
                stroke="#ef4444"
                strokeWidth={2}
                name="Refunds"
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="net"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Net Sales"
                strokeDasharray="5 5"
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="count"
                stroke="#6b7280"
                strokeWidth={2}
                name="Orders"
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 요일별 매출 패턴 - 패턴 분석용 */}
      {weekdayData.some(d => d.count > 0) && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Sales by Day of Week
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={weekdayData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="day"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                yAxisId="left"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={formatCurrencyCompact}
                label={{
                  value: 'Amount ($)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle', fontSize: '12px' },
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={formatNumber}
                label={{
                  value: 'Orders',
                  angle: -90,
                  position: 'insideRight',
                  style: { textAnchor: 'middle', fontSize: '12px' },
                }}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'Orders') return value;
                  return formatCurrency(value);
                }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '8px',
                }}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="revenue"
                fill="#10b981"
                name="Revenue"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="left"
                dataKey="net"
                fill="#3b82f6"
                name="Net Sales"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="count"
                stroke="#6b7280"
                strokeWidth={2}
                name="Orders"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 월별 매출 비교 (바 차트 + 주문 수 + 환불율) - 성장률/추세 분석용 */}
      {monthlyData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Monthly Sales Comparison
              </h3>
            </div>
            {overallRefundRate > 0 && (
              <div className="text-sm text-gray-600">
                Overall Refund Rate:{' '}
                <span className="font-semibold text-red-600">
                  {overallRefundRate}%
                </span>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart
              data={monthlyData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              onClick={data => handleChartClick(data, 'monthly')}
              style={{ cursor: 'pointer' }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="month"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                yAxisId="left"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={formatCurrencyCompact}
                label={{
                  value: 'Amount ($)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle', fontSize: '12px' },
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={formatNumber}
                label={{
                  value: 'Orders',
                  angle: -90,
                  position: 'insideRight',
                  style: { textAnchor: 'middle', fontSize: '12px' },
                }}
              />
              {/* FIXED: Add 3rd Y-axis for refund rate to avoid confusing same-axis mixing */}
              <YAxis
                yAxisId="rate"
                orientation="right"
                stroke="#f59e0b"
                style={{ fontSize: '12px' }}
                tickFormatter={(value: number) => `${value}%`}
                domain={[0, 'auto']}
                label={{
                  value: 'Refund Rate (%)',
                  angle: -90,
                  position: 'insideRight',
                  offset: 50,
                  style: { textAnchor: 'middle', fontSize: '11px' },
                }}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'Orders') return value;
                  if (name === 'Refund Rate (%)') return `${value}%`;
                  return formatCurrency(value);
                }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '8px',
                }}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="revenue"
                fill="#10b981"
                name="Revenue"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="left"
                dataKey="refunds"
                fill="#ef4444"
                name="Refunds"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="left"
                dataKey="net"
                fill="#3b82f6"
                name="Net Sales"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="count"
                stroke="#6b7280"
                strokeWidth={2}
                name="Orders"
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              {/* FIXED: Use separate yAxisId="rate" for refund rate */}
              <Line
                yAxisId="rate"
                type="monotone"
                dataKey="refundRate"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="3 3"
                name="Refund Rate (%)"
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Refund 원인 분석: 고객별 */}
      {refundByClient.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Refunds by Client (Top 10)
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={refundByClient}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 110, bottom: 70 }}
              barCategoryGap="0%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={formatCurrencyCompact}
                label={{
                  value: 'Refund Amount ($)',
                  position: 'insideBottom',
                  offset: -55,
                  style: { textAnchor: 'middle', fontSize: '12px' },
                }}
              />
              <YAxis
                dataKey="clientName"
                type="category"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                width={100}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'Refund Count') return value;
                  return formatCurrency(value);
                }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '8px',
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: '40px', marginBottom: '10px' }}
              />
              <Bar
                dataKey="refunds"
                fill="#ef4444"
                name="Refund Amount"
                radius={[0, 4, 4, 0]}
                onClick={(data: { payload?: { clientId?: string } }) => {
                  const payload = data?.payload;
                  if (onClientFilter && payload?.clientId) {
                    onClientFilter(payload.clientId);
                  }
                }}
              />
              {/* FIXED: Add onClick to count bar for consistency */}
              <Bar
                dataKey="count"
                fill="#f59e0b"
                name="Refund Count"
                radius={[0, 4, 4, 0]}
                onClick={(data: { payload?: { clientId?: string } }) => {
                  const payload = data?.payload;
                  if (onClientFilter && payload?.clientId) {
                    onClientFilter(payload.clientId);
                  }
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Refund 원인 분석: 악기별 */}
      {refundByInstrument.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Refunds by Instrument (Top 10)
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={refundByInstrument}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 110, bottom: 70 }}
              barCategoryGap="0%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={formatCurrencyCompact}
                label={{
                  value: 'Refund Amount ($)',
                  position: 'insideBottom',
                  offset: -55,
                  style: { textAnchor: 'middle', fontSize: '12px' },
                }}
              />
              <YAxis
                dataKey="instrumentInfo"
                type="category"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                width={100}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'Refund Count') return value;
                  return formatCurrency(value);
                }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '8px',
                }}
              />
              <Legend
                wrapperStyle={{ paddingTop: '40px', marginBottom: '10px' }}
              />
              <Bar
                dataKey="refunds"
                fill="#ef4444"
                name="Refund Amount"
                radius={[0, 4, 4, 0]}
                onClick={(data: { payload?: { instrumentId?: string } }) => {
                  const payload = data?.payload;
                  if (onInstrumentFilter && payload?.instrumentId) {
                    onInstrumentFilter(payload.instrumentId);
                  }
                }}
              />
              {/* FIXED: Add onClick to count bar for consistency */}
              <Bar
                dataKey="count"
                fill="#f59e0b"
                name="Refund Count"
                radius={[0, 4, 4, 0]}
                onClick={(data: { payload?: { instrumentId?: string } }) => {
                  const payload = data?.payload;
                  if (onInstrumentFilter && payload?.instrumentId) {
                    onInstrumentFilter(payload.instrumentId);
                  }
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 악기 타입별 매출 (Top 10) */}
      {instrumentTypeData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">
                Top Instruments by Revenue
              </h3>
              <div className="group relative">
                <svg
                  className="w-4 h-4 text-gray-400 cursor-help"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="Net Sales definition"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {/* FIXED: Add title attribute for accessibility (mobile/touch devices) */}
                <div
                  className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-10"
                  title="Net Sales = Revenue – Refunds (absolute $)"
                >
                  Net Sales = Revenue – Refunds (absolute $)
                </div>
              </div>
            </div>
            <span className="text-xs text-gray-500">
              Sorted by revenue (hover for details)
            </span>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={instrumentTypeData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 70, bottom: 70 }}
              barCategoryGap="10%"
              barSize={40}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={formatCurrencyCompact}
                label={{
                  value: 'Revenue ($)',
                  position: 'insideBottom',
                  offset: -55,
                  style: { textAnchor: 'middle', fontSize: '12px' },
                }}
              />
              <YAxis
                dataKey="type"
                type="category"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                width={60}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                      <p className="font-semibold text-gray-900 mb-2">
                        {label}
                      </p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Revenue:</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(data.revenue)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Net Revenue:</span>
                          <span className="font-medium text-blue-600">
                            {formatCurrency(data.net)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Orders:</span>
                          <span className="font-medium text-gray-700">
                            {formatNumber(data.count)}
                          </span>
                        </div>
                        {data.refundRate > 0 && (
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-600">Refund Rate:</span>
                            <span className="font-medium text-orange-600">
                              {data.refundRate}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="revenue"
                fill="#10b981"
                name="Revenue"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Maker별 매출 (Top 10) */}
      {makerData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">
                Top Makers by Revenue
              </h3>
              <div className="group relative">
                <svg
                  className="w-4 h-4 text-gray-400 cursor-help"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="Net Sales definition"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {/* FIXED: Add title attribute for accessibility (mobile/touch devices) */}
                <div
                  className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 bg-gray-900 text-white text-xs rounded-lg p-2 z-10"
                  title="Net Sales = Revenue – Refunds (absolute $)"
                >
                  Net Sales = Revenue – Refunds (absolute $)
                </div>
              </div>
            </div>
            <span className="text-xs text-gray-500">
              Sorted by revenue (hover for details)
            </span>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={makerData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 90, bottom: 70 }}
              barCategoryGap="10%"
              barSize={40}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={formatCurrencyCompact}
                label={{
                  value: 'Revenue ($)',
                  position: 'insideBottom',
                  offset: -55,
                  style: { textAnchor: 'middle', fontSize: '12px' },
                }}
              />
              <YAxis
                dataKey="maker"
                type="category"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                width={90}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                      <p className="font-semibold text-gray-900 mb-2">
                        {label}
                      </p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Revenue:</span>
                          <span className="font-medium text-green-600">
                            {formatCurrency(data.revenue)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Net Revenue:</span>
                          <span className="font-medium text-blue-600">
                            {formatCurrency(data.net)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-600">Orders:</span>
                          <span className="font-medium text-gray-700">
                            {formatNumber(data.count)}
                          </span>
                        </div>
                        {data.refundRate > 0 && (
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-600">Refund Rate:</span>
                            <span className="font-medium text-orange-600">
                              {data.refundRate}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="revenue"
                fill="#10b981"
                name="Revenue"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
