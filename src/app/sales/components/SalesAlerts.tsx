'use client';

import { useMemo } from 'react';
import { EnrichedSale } from '@/types';
import { subDays, isBefore, isWithinInterval } from 'date-fns';
import { parseYMDLocal, startOfDay } from '@/utils/dateParsing';

import { currency } from '../utils/salesFormatters';

interface SalesAlertsProps {
  sales: EnrichedSale[];
}

interface Alert {
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export default function SalesAlerts({ sales }: SalesAlertsProps) {
  const alerts = useMemo<Alert[]>(() => {
    const result: Alert[] = [];

    if (sales.length === 0) return result;

    // 최근 7일 데이터
    const today = startOfDay(new Date());
    const sevenDaysAgo = startOfDay(subDays(today, 7));

    // FIXED: Use parseYMDLocal to handle timezone issues (local day-of-week)
    const recentSales = sales
      .filter(s => {
        const saleDay = parseYMDLocal(s.sale_date);
        if (!saleDay) return false;
        // sevenDaysAgo 이후 또는 같은 날 (경계값 포함)
        return !isBefore(saleDay, sevenDaysAgo);
      })
      .filter(s => s.sale_price > 0);

    const recentRefunds = sales
      .filter(s => {
        const saleDay = parseYMDLocal(s.sale_date);
        if (!saleDay) return false;
        // sevenDaysAgo 이후 또는 같은 날 (경계값 포함)
        return !isBefore(saleDay, sevenDaysAgo);
      })
      .filter(s => s.sale_price < 0);

    // 이전 7일 데이터 (비교용)
    // FIXED: interval boundary bug - make previous end = day before sevenDaysAgo to avoid double-counting
    const fourteenDaysAgo = startOfDay(subDays(today, 14));
    const previousInterval = {
      start: fourteenDaysAgo,
      end: startOfDay(subDays(sevenDaysAgo, 1)), // Exclusive of sevenDaysAgo to prevent double-counting
    };

    const previousSales = sales.filter(s => {
      const saleDay = parseYMDLocal(s.sale_date);
      if (!saleDay) return false;
      return isWithinInterval(saleDay, previousInterval) && s.sale_price > 0;
    });

    const previousRefunds = sales.filter(s => {
      const saleDay = parseYMDLocal(s.sale_date);
      if (!saleDay) return false;
      return isWithinInterval(saleDay, previousInterval) && s.sale_price < 0;
    });

    // 1. 매출 급감 알림
    const recentRevenue = recentSales.reduce((sum, s) => sum + s.sale_price, 0);
    const previousRevenue = previousSales.reduce(
      (sum, s) => sum + s.sale_price,
      0
    );
    if (previousRevenue > 0) {
      const revenueDrop =
        ((previousRevenue - recentRevenue) / previousRevenue) * 100;
      if (revenueDrop > 30) {
        result.push({
          type: 'error',
          title: '최근 매출 변화 (참고용)',
          message: `최근 7일 매출이 이전 7일 대비 ${Math.round(revenueDrop)}% 감소했습니다. (${currency.format(recentRevenue)} vs ${currency.format(previousRevenue)})`,
          severity: revenueDrop > 50 ? 'high' : 'medium',
        });
      } else if (revenueDrop > 15) {
        result.push({
          type: 'warning',
          title: '매출 하락 경고',
          message: `최근 7일 매출이 이전 7일 대비 ${Math.round(revenueDrop)}% 감소했습니다.`,
          severity: 'low',
        });
      }
    }

    // 2. 환불 급증 알림
    const recentRefundAmount = recentRefunds.reduce(
      (sum, s) => sum + Math.abs(s.sale_price),
      0
    );
    const previousRefundAmount = previousRefunds.reduce(
      (sum, s) => sum + Math.abs(s.sale_price),
      0
    );
    if (previousRefundAmount > 0) {
      const refundIncrease =
        ((recentRefundAmount - previousRefundAmount) / previousRefundAmount) *
        100;
      if (refundIncrease > 50) {
        result.push({
          type: 'error',
          title: '최근 환불 변화 (참고용)',
          message: `최근 7일 환불이 이전 7일 대비 ${Math.round(refundIncrease)}% 증가했습니다. (${currency.format(recentRefundAmount)} vs ${currency.format(previousRefundAmount)})`,
          severity: refundIncrease > 100 ? 'high' : 'medium',
        });
      }
    } else if (recentRefundAmount > 0 && previousRefundAmount === 0) {
      result.push({
        type: 'warning',
        title: '환불 발생',
        message: `최근 7일 동안 ${currency.format(recentRefundAmount)}의 환불이 발생했습니다.`,
        severity: 'low',
      });
    }

    // 3. 특정 Maker 환불 급증
    const makerRefundMap = new Map<
      string,
      { recent: number; previous: number }
    >();
    recentRefunds.forEach(sale => {
      if (sale.instrument?.maker) {
        const maker = sale.instrument.maker;
        if (!makerRefundMap.has(maker)) {
          makerRefundMap.set(maker, { recent: 0, previous: 0 });
        }
        makerRefundMap.get(maker)!.recent += Math.abs(sale.sale_price);
      }
    });
    previousRefunds.forEach(sale => {
      if (sale.instrument?.maker) {
        const maker = sale.instrument.maker;
        if (!makerRefundMap.has(maker)) {
          makerRefundMap.set(maker, { recent: 0, previous: 0 });
        }
        makerRefundMap.get(maker)!.previous += Math.abs(sale.sale_price);
      }
    });

    // FIXED: maker refund spike logic - require minimum baseline and absolute delta to reduce noise
    makerRefundMap.forEach((data, maker) => {
      if (data.previous > 0) {
        const increase = ((data.recent - data.previous) / data.previous) * 100;
        // Require minimum baseline ($200) and absolute delta ($200) to reduce false positives from tiny baseline swings
        if (
          data.previous >= 200 &&
          increase > 100 &&
          data.recent - data.previous >= 200
        ) {
          result.push({
            type: 'error',
            title: `${maker} 환불 급증`,
            message: `${maker} 제품의 환불이 이전 7일 대비 ${Math.round(increase)}% 증가했습니다.`,
            severity: 'high',
          });
        }
      } else if (data.recent > 0) {
        result.push({
          type: 'warning',
          title: `${maker} 환불 발생`,
          message: `${maker} 제품에서 ${currency.format(data.recent)}의 환불이 발생했습니다.`,
          severity: 'medium',
        });
      }
    });

    // 4. 특정 요일 Orders 급락
    const weekdayMap = new Map<number, { recent: number; previous: number }>();
    recentSales.forEach(sale => {
      // FIXED: Use parseYMDLocal and getDay() for local day-of-week
      const saleDay = parseYMDLocal(sale.sale_date);
      if (!saleDay) return;
      const dayOfWeek = saleDay.getDay(); // Local day of week (0 = Sunday, 6 = Saturday)
      if (!weekdayMap.has(dayOfWeek)) {
        weekdayMap.set(dayOfWeek, { recent: 0, previous: 0 });
      }
      weekdayMap.get(dayOfWeek)!.recent += 1;
    });
    previousSales.forEach(sale => {
      // FIXED: Use parseYMDLocal and getDay() for local day-of-week
      const saleDay = parseYMDLocal(sale.sale_date);
      if (!saleDay) return;
      const dayOfWeek = saleDay.getDay(); // Local day of week
      if (!weekdayMap.has(dayOfWeek)) {
        weekdayMap.set(dayOfWeek, { recent: 0, previous: 0 });
      }
      weekdayMap.get(dayOfWeek)!.previous += 1;
    });

    const dayNames = [
      '일요일',
      '월요일',
      '화요일',
      '수요일',
      '목요일',
      '금요일',
      '토요일',
    ];
    weekdayMap.forEach((data, dayOfWeek) => {
      if (data.previous > 0) {
        const drop = ((data.previous - data.recent) / data.previous) * 100;
        // Only show if significant drop AND absolute numbers matter (not just noise)
        if (drop > 50 && data.previous >= 2) {
          result.push({
            type: 'warning',
            title: `${dayNames[dayOfWeek]} orders dropped`,
            message: `${data.recent} vs ${data.previous} last week`,
            severity: 'low', // Tone down severity
          });
        }
      }
    });

    return result;
  }, [sales]);

  // Filter and limit alerts to reduce noise
  // Hide severity 'low' alerts by default, limit to top 3
  const visibleAlerts = alerts
    .filter(alert => alert.severity !== 'low')
    .slice(0, 3);

  if (visibleAlerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* FIXED: Use stable key instead of index to prevent incorrect DOM reuse */}
      {visibleAlerts.map(alert => (
        <div
          key={`${alert.type}:${alert.title}:${alert.message}`}
          className={`border rounded-lg p-3 ${
            alert.type === 'error'
              ? 'bg-red-50 border-red-200'
              : alert.type === 'warning'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-blue-50 border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`shrink-0 ${
                alert.type === 'error'
                  ? 'text-red-600'
                  : alert.type === 'warning'
                    ? 'text-amber-600'
                    : 'text-blue-600'
              }`}
            >
              {alert.type === 'error' && (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              )}
              {alert.type === 'warning' && (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              )}
              {alert.type === 'info' && (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm ${
                  alert.type === 'error'
                    ? 'text-red-700'
                    : alert.type === 'warning'
                      ? 'text-amber-700'
                      : 'text-blue-700'
                }`}
              >
                <span className="font-medium">{alert.title}</span>
                {alert.message && (
                  <span className="ml-1 text-gray-600">{alert.message}</span>
                )}
              </p>
            </div>
            {alert.severity === 'high' && (
              <span className="shrink-0 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded">
                Low sample
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
