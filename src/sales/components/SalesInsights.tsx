'use client';

import { useMemo } from 'react';
import { EnrichedSale } from '@/types';
import {
  subDays,
  startOfDay,
  endOfDay,
  isWithinInterval,
  differenceInCalendarDays,
} from 'date-fns';

// FIXED: Helper to parse YYYY-MM-DD as UTC to avoid timezone shifts
const parseYMDUTC = (ymd: string): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

interface SalesInsightsProps {
  sales: EnrichedSale[];
  fromDate?: string;
  toDate?: string;
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export default function SalesInsights({
  sales,
  fromDate,
  toDate,
}: SalesInsightsProps) {
  // FIXED: Filter sales by fromDate/toDate first to get current period sales
  const currentSales = useMemo(() => {
    if (!fromDate && !toDate) return sales;
    return sales.filter(sale => {
      const saleDate = sale.sale_date;
      if (fromDate && saleDate < fromDate) return false;
      if (toDate && saleDate > toDate) return false;
      return true;
    });
  }, [sales, fromDate, toDate]);

  // 현재 기간 데이터
  const currentPeriod = useMemo(() => {
    const positiveSales = currentSales.filter(s => s.sale_price > 0);
    const revenue = positiveSales.reduce((sum, s) => sum + s.sale_price, 0);
    const refunds = currentSales
      .filter(s => s.sale_price < 0)
      .reduce((sum, s) => sum + Math.abs(s.sale_price), 0);
    const netRevenue = revenue - refunds;
    const orderCount = positiveSales.length;
    const uniqueClients = new Set(
      positiveSales.map(s => s.client_id).filter(Boolean)
    ).size;
    const avgTicket = orderCount > 0 ? revenue / orderCount : 0;
    const avgTicketPerClient = uniqueClients > 0 ? revenue / uniqueClients : 0;

    return {
      revenue,
      refunds,
      netRevenue,
      orderCount,
      uniqueClients,
      avgTicket,
      avgTicketPerClient,
    };
  }, [currentSales]);

  // 이전 기간 데이터 (비교용)
  const previousPeriod = useMemo(() => {
    if (!fromDate || !toDate) return null;

    try {
      // FIXED: Use UTC date parsing to avoid timezone issues
      const from = parseYMDUTC(fromDate);
      const to = parseYMDUTC(toDate);

      // FIXED: Use calendar-day math instead of millisecond math to avoid DST/off-by-one issues
      const days = differenceInCalendarDays(to, from) + 1; // inclusive
      const prevTo = subDays(from, 1);
      const prevFrom = subDays(prevTo, days - 1);

      // Build interval using UTC dates
      const previousInterval = {
        start: startOfDay(prevFrom),
        end: endOfDay(prevTo),
      };

      const prevSales = sales.filter(sale => {
        try {
          // FIXED: Use parseYMDUTC instead of parseISO
          const saleDate = parseYMDUTC(sale.sale_date);
          return isWithinInterval(saleDate, previousInterval);
        } catch {
          return false;
        }
      });

      const positiveSales = prevSales.filter(s => s.sale_price > 0);
      const revenue = positiveSales.reduce((sum, s) => sum + s.sale_price, 0);
      const refunds = prevSales
        .filter(s => s.sale_price < 0)
        .reduce((sum, s) => sum + Math.abs(s.sale_price), 0);
      const netRevenue = revenue - refunds;
      const orderCount = positiveSales.length;
      const uniqueClients = new Set(
        positiveSales.map(s => s.client_id).filter(Boolean)
      ).size;
      const avgTicket = orderCount > 0 ? revenue / orderCount : 0;
      const avgTicketPerClient =
        uniqueClients > 0 ? revenue / uniqueClients : 0;

      return {
        revenue,
        refunds,
        netRevenue,
        orderCount,
        uniqueClients,
        avgTicket,
        avgTicketPerClient,
      };
    } catch {
      return null;
    }
  }, [sales, fromDate, toDate]);

  // FIXED: Renamed from "MoM" to "Period-over-Period" since it compares selected period vs previous equal-length period
  const momGrowth = useMemo(() => {
    if (!previousPeriod || previousPeriod.revenue === 0) return null;

    const revenueGrowth =
      ((currentPeriod.revenue - previousPeriod.revenue) /
        previousPeriod.revenue) *
      100;
    const orderGrowth =
      previousPeriod.orderCount > 0
        ? ((currentPeriod.orderCount - previousPeriod.orderCount) /
            previousPeriod.orderCount) *
          100
        : null;
    const clientGrowth =
      previousPeriod.uniqueClients > 0
        ? ((currentPeriod.uniqueClients - previousPeriod.uniqueClients) /
            previousPeriod.uniqueClients) *
          100
        : null;

    return {
      revenue: Math.round(revenueGrowth * 10) / 10,
      orders: orderGrowth !== null ? Math.round(orderGrowth * 10) / 10 : null,
      clients:
        clientGrowth !== null ? Math.round(clientGrowth * 10) / 10 : null,
    };
  }, [currentPeriod, previousPeriod]);

  // 추세 평가 (최근 7건 vs 그 이전 7건의 거래)
  // FIXED: Use currentSales (filtered by fromDate/toDate) instead of all sales
  const trend = useMemo(() => {
    if (currentSales.length < 14) return null;

    // 날짜 기준으로 정렬 (UTC date parsing으로 정확한 비교)
    const sortedSales = [...currentSales].sort((a, b) => {
      try {
        // FIXED: Use parseYMDUTC instead of parseISO
        const dateA = parseYMDUTC(a.sale_date).getTime();
        const dateB = parseYMDUTC(b.sale_date).getTime();
        return dateA - dateB;
      } catch {
        return 0;
      }
    });

    const recent7Orders = sortedSales.slice(-7);
    const previous7Orders = sortedSales.slice(-14, -7);

    const recentRevenue = recent7Orders
      .filter(s => s.sale_price > 0)
      .reduce((sum, s) => sum + s.sale_price, 0);
    const previousRevenue = previous7Orders
      .filter(s => s.sale_price > 0)
      .reduce((sum, s) => sum + s.sale_price, 0);

    if (previousRevenue === 0) return null;

    const trendPercent =
      ((recentRevenue - previousRevenue) / previousRevenue) * 100;
    return {
      value: Math.round(trendPercent * 10) / 10,
      direction: trendPercent > 0 ? 'up' : trendPercent < 0 ? 'down' : 'stable',
    };
  }, [currentSales]);

  // 손님 수 vs 단가 분석
  const customerVsTicketAnalysis = useMemo(() => {
    if (!previousPeriod) return null;

    const clientChange =
      currentPeriod.uniqueClients - previousPeriod.uniqueClients;
    const ticketChange = currentPeriod.avgTicket - previousPeriod.avgTicket;
    const revenueChange = currentPeriod.revenue - previousPeriod.revenue;

    // 매출 변화의 원인 분석
    // 매출 변화 = (고객 수 변화) * 이전 단가 + (단가 변화) * 현재 고객 수 + (고객 수 변화) * (단가 변화)
    const clientContribution = clientChange * previousPeriod.avgTicket;
    const ticketContribution = ticketChange * currentPeriod.uniqueClients;
    const interaction = clientChange * ticketChange;

    return {
      clientChange,
      ticketChange,
      revenueChange,
      clientContribution,
      ticketContribution,
      interaction,
      primaryDriver:
        Math.abs(clientContribution) > Math.abs(ticketContribution)
          ? 'clients'
          : 'ticket',
    };
  }, [currentPeriod, previousPeriod]);

  if (sales.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* FIXED: Period-over-Period Growth (not MoM unless period is exactly one month) */}
      {momGrowth && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Period-over-Period Growth
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">Revenue</div>
              <div
                className={`text-lg font-semibold ${momGrowth.revenue >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {momGrowth.revenue >= 0 ? '+' : ''}
                {momGrowth.revenue}%
              </div>
            </div>
            {momGrowth.orders !== null && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Orders</div>
                <div
                  className={`text-lg font-semibold ${momGrowth.orders >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {momGrowth.orders >= 0 ? '+' : ''}
                  {momGrowth.orders}%
                </div>
              </div>
            )}
            {momGrowth.clients !== null && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Clients</div>
                <div
                  className={`text-lg font-semibold ${momGrowth.clients >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {momGrowth.clients >= 0 ? '+' : ''}
                  {momGrowth.clients}%
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FIXED: Updated label to clarify it uses selected range */}
      {trend && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Recent Trend (Last 7 Orders in Selected Range)
          </h3>
          <div className="flex items-center gap-3">
            <div
              className={`text-2xl font-bold ${
                trend.direction === 'up'
                  ? 'text-green-600'
                  : trend.direction === 'down'
                    ? 'text-red-600'
                    : 'text-gray-600'
              }`}
            >
              {trend.value >= 0 ? '+' : ''}
              {trend.value}%
            </div>
            <div className="flex-1">
              <div className="text-sm text-gray-600">
                {trend.direction === 'up' && '📈 Improving trend'}
                {trend.direction === 'down' && '📉 Declining trend'}
                {trend.direction === 'stable' && '➡️ Stable trend'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                vs previous 7 orders
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 손님 수 vs 단가 분석 */}
      {customerVsTicketAnalysis && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Revenue Change Analysis
          </h3>
          <div className="space-y-2">
            <div className="text-xs text-gray-600">
              Revenue change:{' '}
              <span
                className={`font-semibold ${customerVsTicketAnalysis.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {currency.format(customerVsTicketAnalysis.revenueChange)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-gray-500 mb-1">From Customer Count:</div>
                <div
                  className={`font-semibold ${customerVsTicketAnalysis.clientContribution >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {currency.format(customerVsTicketAnalysis.clientContribution)}
                </div>
                <div className="text-gray-400 text-xs mt-0.5">
                  ({customerVsTicketAnalysis.clientChange >= 0 ? '+' : ''}
                  {customerVsTicketAnalysis.clientChange} clients)
                </div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">From Avg. Ticket:</div>
                <div
                  className={`font-semibold ${customerVsTicketAnalysis.ticketContribution >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {currency.format(customerVsTicketAnalysis.ticketContribution)}
                </div>
                <div className="text-gray-400 text-xs mt-0.5">
                  ({customerVsTicketAnalysis.ticketChange >= 0 ? '+' : ''}
                  {currency.format(customerVsTicketAnalysis.ticketChange)})
                </div>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <div className="text-xs text-gray-600">
                Primary driver:{' '}
                <span className="font-semibold text-gray-900">
                  {customerVsTicketAnalysis.primaryDriver === 'clients'
                    ? 'Customer count change'
                    : 'Average ticket change'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
