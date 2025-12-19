// Note: @react-pdf/renderer's Image component doesn't support alt prop (PDF generation, not HTML)
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';

type InvoiceItem = {
  description: string; // "{type}, {maker}, {year}, {certificate}, {note}" 같은 문장
  qty: number;
  rate: number; // unit price
  amount?: number; // 없으면 qty*rate로 계산
};

export type InvoiceDocumentProps = {
  logoSrc?: string; // 좌상단 로고 이미지(권장: PNG)
  company: {
    name: string; // "HC Violins"
    addressLines: string[]; // ["202, 67 Banpodaero, Seocho-gu, Seoul,", "Republic of Korea 06670"]
    phone?: string;
    email?: string;
  };

  billTo: {
    name: string;
    addressLines?: string[];
    phone?: string;
  };

  shipTo?: {
    note?: string; // 스샷처럼 {note} 한 줄이면 충분
  };

  invoice: {
    invoiceNumber: string;
    itemNumber?: string;
    date: string; // "YYYY-MM-DD" or "YYYY.MM.DD"
    dueDate?: string;
    status?: string;
    exchangeRate?: string;
    note?: string; // 오른쪽 블록의 {note}
    currency?: string; // "USD", "KRW" 등
  };

  items: InvoiceItem[];

  banking: {
    accountHolder?: string;
    bankName?: string;
    swiftCode?: string;
    accountNumber?: string;
  };

  totals: {
    subtotal: number;
    tax?: number;
    total: number;
  };

  conditions?: string;
  footerNotice?: string; // 맨 아래 이탤릭 경고문
};

const COLORS = {
  ink: '#111111',
  muted: '#555555',
  line: '#D6D6D6',
  headerFill: '#D9E3E6', // 테이블 헤더 연한 그레이/블루
  white: '#FFFFFF',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 42,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    color: COLORS.ink,
    fontSize: 10,
  },

  // Header
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  logoWrap: {
    width: 260,
  },
  logoImage: {
    width: 230,
    height: 42,
    objectFit: 'contain',
  },
  brandText: {
    fontFamily: 'Times-Bold',
    fontSize: 34,
    letterSpacing: 1,
  },

  contactWrap: {
    width: 220,
    alignItems: 'flex-end',
  },
  contactTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
  },
  contactLine: {
    fontSize: 9,
    lineHeight: 1.45,
    color: COLORS.ink,
  },

  invoiceTitle: {
    marginTop: 22,
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.0,
  },

  // Info blocks
  infoRow: {
    marginTop: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoCol: {
    width: '32%',
  },
  infoLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 9,
    lineHeight: 1.5,
    color: COLORS.ink,
  },
  infoRightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoRightKey: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    width: 86,
  },
  infoRightVal: {
    fontSize: 9,
    textAlign: 'right',
    flex: 1,
  },

  // Table
  table: {
    marginTop: 42,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
  },
  tableHeader: {
    backgroundColor: COLORS.headerFill,
    paddingVertical: 6,
    paddingHorizontal: 6,
    flexDirection: 'row',
  },
  th: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    borderBottomStyle: 'solid',
  },
  td: {
    fontSize: 9,
    lineHeight: 1.4,
  },
  colDesc: { width: '58%', lineHeight: 1.6 },
  colQty: { width: '10%', textAlign: 'right' as const },
  colRate: { width: '16%', textAlign: 'right' as const },
  colAmt: { width: '16%', textAlign: 'right' as const },

  dashedDivider: {
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    borderBottomStyle: 'dashed',
  },

  // Bottom blocks
  bottomRow: {
    marginTop: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bankingCol: {
    width: '55%',
  },
  totalsCol: {
    width: '40%',
    alignItems: 'flex-end',
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    width: '100%',
  },
  kvKey: {
    fontSize: 9,
    color: COLORS.ink,
  },
  kvVal: {
    fontSize: 9,
    color: COLORS.ink,
    textAlign: 'right',
  },

  statusRow: {
    marginTop: 16,
    width: '100%',
  },

  exchangeRate: {
    marginTop: 12,
    fontSize: 9,
    color: COLORS.ink,
    textAlign: 'right',
  },

  conditionsRow: {
    marginTop: 42,
    flexDirection: 'row',
  },
  conditionsKey: {
    width: 90,
    fontSize: 9,
    color: COLORS.ink,
  },
  conditionsVal: {
    fontSize: 9,
    color: COLORS.ink,
    flex: 1,
  },

  footerNotice: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 9,
    color: COLORS.ink,
    fontStyle: 'italic',
    lineHeight: 1.35,
    opacity: 0.7,
  },
});

const money = (n: number, currency?: string) => {
  const v = Number.isFinite(n) ? n : 0;
  // 심플하게: 1,234.56 형태
  const s = v.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return currency ? `${s} ${currency}` : s;
};

const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({
  logoSrc,
  company,
  billTo,
  shipTo,
  invoice,
  items,
  banking,
  totals,
  conditions,
  footerNotice,
}) => {
  const computedItems = items.map(it => ({
    ...it,
    amount: typeof it.amount === 'number' ? it.amount : it.qty * it.rate,
  }));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.topRow}>
          <View style={styles.logoWrap}>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoSrc} style={styles.logoImage} />
            ) : (
              <Text style={styles.brandText}>{company.name}</Text>
            )}
          </View>

          <View style={styles.contactWrap}>
            <Text style={styles.contactTitle}>{company.name}</Text>
            {company.addressLines?.map((l, idx) => (
              <Text key={idx} style={styles.contactLine}>
                {l}
              </Text>
            ))}
            {company.phone ? (
              <Text style={styles.contactLine}>{company.phone}</Text>
            ) : null}
            {company.email ? (
              <Text style={styles.contactLine}>{company.email}</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.invoiceTitle}>INVOICE</Text>

        {/* Bill/Ship/Invoice info */}
        <View style={styles.infoRow}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>BILL TO</Text>
            <Text style={styles.infoText}>{billTo.name}</Text>
            {billTo.addressLines?.map((l, idx) => (
              <Text key={idx} style={styles.infoText}>
                {l}
              </Text>
            ))}
            {billTo.phone ? (
              <Text style={styles.infoText}>{billTo.phone}</Text>
            ) : null}
          </View>

          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>SHIP TO</Text>
            <Text style={styles.infoText}>{shipTo?.note || ''}</Text>
          </View>

          <View style={styles.infoCol}>
            <View style={styles.infoRightRow}>
              <Text style={styles.infoRightKey}>INVOICE #</Text>
              <Text
                style={[styles.infoRightVal, { fontFamily: 'Helvetica-Bold' }]}
              >
                {invoice.invoiceNumber}
              </Text>
            </View>
            <View style={styles.infoRightRow}>
              <Text style={styles.infoRightKey}>ITEM #</Text>
              <Text style={styles.infoRightVal}>
                {invoice.itemNumber || ''}
              </Text>
            </View>
            <View style={styles.infoRightRow}>
              <Text style={styles.infoRightKey}>DATE</Text>
              <Text style={styles.infoRightVal}>{invoice.date}</Text>
            </View>
            <View style={styles.infoRightRow}>
              <Text style={styles.infoRightKey}>DUE DATE</Text>
              <Text style={styles.infoRightVal}>{invoice.dueDate || ''}</Text>
            </View>
            {invoice.note ? (
              <View style={{ marginTop: 6 }}>
                <Text style={[styles.infoText, { textAlign: 'right' }]}>
                  {invoice.note}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colDesc]}>DESCRIPTION</Text>
            <Text style={[styles.th, styles.colQty]}>QTY</Text>
            <Text style={[styles.th, styles.colRate]}>RATE</Text>
            <Text style={[styles.th, styles.colAmt]}>AMOUNT</Text>
          </View>

          {computedItems.map((it, idx) => (
            <View key={idx} style={styles.tr}>
              <Text style={[styles.td, styles.colDesc]}>{it.description}</Text>
              <Text style={[styles.td, styles.colQty]}>{it.qty}</Text>
              <Text style={[styles.td, styles.colRate]}>
                {money(it.rate, invoice.currency)}
              </Text>
              <Text style={[styles.td, styles.colAmt]}>
                {money(it.amount!, invoice.currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.dashedDivider} />

        {/* Banking + Totals */}
        <View style={styles.bottomRow}>
          <View style={styles.bankingCol}>
            <Text style={styles.sectionTitle}>BANKING INFORMATION</Text>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Account Holder</Text>
              <Text style={styles.kvVal}>{banking.accountHolder || ''}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Bank Name</Text>
              <Text style={styles.kvVal}>{banking.bankName || ''}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>SWIFT Code</Text>
              <Text style={styles.kvVal}>{banking.swiftCode || ''}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>Account Number</Text>
              <Text style={styles.kvVal}>{banking.accountNumber || ''}</Text>
            </View>
          </View>

          <View style={styles.totalsCol}>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>SUBTOTAL</Text>
              <Text style={styles.kvVal}>
                {money(totals.subtotal, invoice.currency)}
              </Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvKey}>TAX</Text>
              <Text style={styles.kvVal}>
                {money(totals.tax || 0, invoice.currency)}
              </Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={[styles.kvKey, { fontFamily: 'Helvetica-Bold' }]}>
                TOTAL
              </Text>
              <Text style={[styles.kvVal, { fontFamily: 'Helvetica-Bold' }]}>
                {money(totals.total, invoice.currency)}
              </Text>
            </View>

            <View style={[styles.statusRow, styles.dashedDivider]} />

            <View style={[styles.kvRow, { marginTop: 12 }]}>
              <Text style={styles.kvKey}>STATUS</Text>
              <Text style={styles.kvVal}>{invoice.status || ''}</Text>
            </View>

            {invoice.exchangeRate ? (
              <Text style={styles.exchangeRate}>{invoice.exchangeRate}</Text>
            ) : null}
          </View>
        </View>

        {/* Conditions */}
        {(conditions || '').trim() ? (
          <View style={styles.conditionsRow}>
            <Text style={styles.conditionsKey}>Conditions</Text>
            <Text style={styles.conditionsVal}>{conditions}</Text>
          </View>
        ) : null}

        {/* Footer notice */}
        <Text style={styles.footerNotice}>
          {footerNotice ||
            'It is important to transfer the total amount and the currency as stated on your invoice. Please ensure that your bank does not deduct their own charges from the total amount as this could delay shipping.'}
        </Text>
      </Page>
    </Document>
  );
};

export default InvoiceDocument;
