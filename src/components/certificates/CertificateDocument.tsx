/* eslint-disable jsx-a11y/alt-text */
// Note: @react-pdf/renderer's Image component doesn't support alt prop (PDF generation, not HTML)
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer';
import { Instrument } from '@/types';

// Register Korean font (Noto Sans KR)
// React-PDF requires TTF/OTF font files for proper Korean character rendering
// Option 1: Use local font files (recommended - place fonts in public/fonts/)
// Option 2: Use CDN with direct font file URLs
try {
  Font.register({
    family: 'NotoSansKR',
    fonts: [
      {
        // Use local font file if available, otherwise fallback to CDN
        src: '/fonts/NotoSansKR-Regular.otf',
        fontWeight: 'normal',
      },
      {
        src: '/fonts/NotoSansKR-Bold.otf',
        fontWeight: 'bold',
      },
    ],
  });
} catch {
  // If local fonts fail, try CDN URLs
  try {
    Font.register({
      family: 'NotoSansKR',
      fonts: [
        {
          src: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/Variable/TTF/Subset/NotoSansKR-VF.ttf',
          fontWeight: 'normal',
        },
        {
          src: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/Variable/TTF/Subset/NotoSansKR-VF.ttf',
          fontWeight: 'bold',
        },
      ],
    });
  } catch {
    // Final fallback: Use Helvetica (may still render Korean on some systems)
    console.warn('Korean font registration failed. Using fallback font.');
  }
}

const COLORS = {
  navy: '#1F2A44',
  gold: '#C8A24A',
  ink: '#111827',
  muted: '#6B7280',
  line: '#E5E7EB',
  panel: '#F9FAFB',
  white: '#FFFFFF',
};

const STORE_INFO = {
  name: 'HC Violins and Bows',
  tagline: 'Premium String Instruments',
  address: '서울특별시 강남구',
  phone: '02-0000-0000',
  web: 'www.hcviolins.com',
  email: 'contact@hcviolins.com',
  // optional
  issuedByLabel: 'Issued By / 발급자',
  sealLabel: 'Store Seal / 직인',
};

type CertificateDocumentProps = {
  instrument: Instrument;
  // optional: store logo / watermark (png/jpg data url or path supported by your setup)
  logoSrc?: string;
  watermarkSrc?: string;
  // optional: verification url (for QR later)
  verifyUrl?: string;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 44,
    paddingHorizontal: 46,
    backgroundColor: COLORS.white,
    fontFamily: 'NotoSansKR',
    color: COLORS.ink,
  },

  // Frame
  frame: {
    position: 'absolute',
    top: 28,
    left: 28,
    right: 28,
    bottom: 28,
    border: `2 solid ${COLORS.navy}`,
    borderRadius: 6,
  },
  goldRuleTop: {
    position: 'absolute',
    top: 30,
    left: 30,
    right: 30,
    height: 3,
    backgroundColor: COLORS.gold,
  },

  // Watermark (optional)
  watermark: {
    position: 'absolute',
    top: 210,
    left: 120,
    width: 350,
    height: 350,
    opacity: 0.06,
  },

  header: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 42, height: 42 },
  brandName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.ink,
    letterSpacing: 0.3,
  },
  brandTagline: { fontSize: 8, color: COLORS.muted, marginTop: 2 },

  certTitleWrap: { alignItems: 'flex-end' },
  certTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.ink,
    letterSpacing: 1.2,
  },
  certSubtitle: { fontSize: 11, color: COLORS.muted, marginTop: 4 },

  metaLine: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: `1 solid ${COLORS.line}`,
    fontSize: 9,
    color: COLORS.muted,
    lineHeight: 1.4,
  },

  // Certificate Number - 공식 문서 느낌
  certBadge: {
    marginTop: 30,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#f7f7f7',
    borderLeft: `4 solid ${COLORS.ink}`,
    borderRight: `0 solid ${COLORS.line}`,
    borderTop: `0 solid ${COLORS.line}`,
    borderBottom: `0 solid ${COLORS.line}`,
  },
  certBadgeLabel: { fontSize: 9, color: COLORS.muted, marginBottom: 6 },
  certBadgeValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.ink,
    letterSpacing: 1.2,
    fontFamily: 'Courier', // Keep Courier for certificate number (monospace)
  },

  // Sections - 라인 기반
  section: { marginTop: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.ink,
    letterSpacing: 0.5,
  },
  sectionRule: {
    flexGrow: 1,
    height: 1,
    backgroundColor: COLORS.line,
  },

  card: {
    border: `1 solid ${COLORS.line}`,
    borderRadius: 10,
    padding: 12,
    backgroundColor: COLORS.white,
  },

  // 2-column grid for fields
  grid: { flexDirection: 'row', gap: 16 },
  col: { width: '50%' },
  field: { marginBottom: 10, flexDirection: 'row' },
  fieldLabel: {
    fontSize: 11,
    width: 120,
    color: '#555555',
    marginRight: 12,
  },
  fieldValue: {
    fontSize: 12,
    flex: 1,
    fontWeight: 'bold',
    color: COLORS.ink,
  },

  noteBox: {
    borderTop: `1 solid ${COLORS.line}`,
    paddingTop: 12,
    marginTop: 12,
  },
  noteText: {
    fontSize: 10,
    color: COLORS.ink,
    lineHeight: 1.5,
  },

  // Signature - 공식 문서 느낌
  attest: {
    marginTop: 24,
    paddingTop: 16,
    borderTop: `1 solid ${COLORS.line}`,
  },
  attestText: {
    fontSize: 10,
    color: COLORS.ink,
    lineHeight: 1.6,
    marginBottom: 8,
  },
  attestStoreName: {
    fontWeight: 'bold',
    color: COLORS.ink,
  },

  signRow: {
    marginTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 20,
  },
  signCol: { width: '45%' },
  signLabel: {
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  signLine: {
    height: 40,
    borderTop: `1 solid ${COLORS.ink}`,
    backgroundColor: COLORS.white,
    paddingTop: 8,
  },
  sealBox: {
    height: 40,
    borderTop: `1 solid ${COLORS.ink}`,
    backgroundColor: COLORS.white,
    paddingTop: 8,
  },
  signHint: {
    marginTop: 4,
    fontSize: 8,
    color: COLORS.muted,
    fontStyle: 'italic',
  },

  // Footer - 신뢰 요소 집합
  footer: {
    position: 'absolute',
    bottom: 38,
    left: 46,
    right: 46,
    borderTop: `1 solid ${COLORS.line}`,
    paddingTop: 12,
    fontSize: 9,
    color: COLORS.muted,
    flexDirection: 'column',
    gap: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerLeft: { flexDirection: 'column', gap: 2 },
  footerRight: { textAlign: 'right' },
});

function field(label: string, value?: React.ReactNode) {
  return (
    <View
      style={[styles.field, { flexDirection: 'row', alignItems: 'flex-start' }]}
    >
      <Text style={styles.fieldLabel}>{label}:</Text>
      <Text style={styles.fieldValue}>{value ?? 'N/A'}</Text>
    </View>
  );
}

const CertificateDocument: React.FC<CertificateDocumentProps> = ({
  instrument,
  logoSrc,
  watermarkSrc,
  verifyUrl,
}) => {
  const issueDate = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const certKey =
    instrument.serial_number?.trim() ||
    instrument.id?.slice(0, 8)?.toUpperCase() ||
    'UNKNOWN';

  const certificateNumber = `CERT-${certKey}-${new Date().getFullYear()}`;

  const priceKRW =
    typeof instrument.price === 'number'
      ? `₩ ${instrument.price.toLocaleString('ko-KR')} KRW`
      : undefined;

  // Use provided logoSrc or default to /logo.png
  const finalLogoSrc = logoSrc || '/logo.png';

  // Use provided verifyUrl or generate default
  const finalVerifyUrl =
    verifyUrl || `https://www.hcviolins.com/verify/${certificateNumber}`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Frame */}
        <View style={styles.frame} />
        <View style={styles.goldRuleTop} />

        {/* Watermark (optional) */}
        {watermarkSrc ? (
          <Image src={watermarkSrc} style={styles.watermark} />
        ) : null}

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.brandLeft}>
              {finalLogoSrc ? (
                <Image src={finalLogoSrc} style={styles.logo} />
              ) : null}
              <View>
                <Text style={styles.brandName}>{STORE_INFO.name}</Text>
                <Text style={styles.brandTagline}>{STORE_INFO.tagline}</Text>
              </View>
            </View>

            <View style={styles.certTitleWrap}>
              <Text style={styles.certTitle}>CERTIFICATE OF AUTHENTICITY</Text>
              <Text style={styles.certSubtitle}>악기 인증서</Text>
            </View>
          </View>

          <Text style={styles.metaLine}>
            {STORE_INFO.address} · {STORE_INFO.phone} · {STORE_INFO.web} ·{' '}
            {STORE_INFO.email}
          </Text>

          <View style={styles.certBadge}>
            <Text style={styles.certBadgeLabel}>
              Certificate Number / 인증서 번호
            </Text>
            <Text style={styles.certBadgeValue}>{certificateNumber}</Text>
          </View>
        </View>

        {/* Instrument Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Instrument Information / 악기 정보
            </Text>
            <View style={styles.sectionRule} />
          </View>

          <View style={styles.card}>
            <View style={styles.grid}>
              <View style={styles.col}>
                {field('Maker / 제작자', instrument.maker)}
                {field('Type / 종류', instrument.type)}
                {field('Subtype / 세부 종류', instrument.subtype)}
                {field(
                  'Year / 연도',
                  instrument.year ? String(instrument.year) : undefined
                )}
              </View>

              <View style={styles.col}>
                {field('Serial Number / 시리얼 번호', instrument.serial_number)}
                {field('Size / 크기', instrument.size)}
                {field('Weight / 무게', instrument.weight)}
                {field('Ownership / 소유권', instrument.ownership)}
              </View>
            </View>

            {priceKRW || instrument.note ? (
              <View style={{ marginTop: 8 }}>
                {priceKRW ? field('Price / 가격', priceKRW) : null}
                {instrument.note ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.fieldLabel}>Notes / 비고</Text>
                    <Text style={styles.noteText}>{instrument.note}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* Attestation + Signature */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Attestation / 확인</Text>
            <View style={styles.sectionRule} />
          </View>

          <View style={styles.attest}>
            <Text style={styles.attestText}>
              This certificate confirms the authenticity of the above-described
              instrument and is issued by{' '}
              <Text style={styles.attestStoreName}>{STORE_INFO.name}</Text>.
            </Text>
            <Text style={styles.attestText}>
              본 인증서는 위에 명시된 악기의 진품(정품) 여부를 확인하며{' '}
              <Text style={styles.attestStoreName}>{STORE_INFO.name}</Text>에서
              발급합니다.
            </Text>

            <View style={styles.signRow}>
              <View style={styles.signCol}>
                <Text style={styles.signLabel}>
                  Authorized Signature / 권한 서명
                </Text>
                <View style={styles.signLine} />
                <Text style={styles.signHint}>Name / Title</Text>
              </View>

              <View style={styles.signCol}>
                <Text style={styles.signLabel}>{STORE_INFO.sealLabel}</Text>
                <View style={styles.sealBox} />
                <Text style={styles.signHint}>Stamp / 직인</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text>Issued Date / 발급일: {issueDate}</Text>
            {finalVerifyUrl ? (
              <Text>Verification / 검증: {finalVerifyUrl}</Text>
            ) : null}
          </View>
          <Text style={styles.footerRight}>
            {STORE_INFO.name} · {STORE_INFO.web}
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export default CertificateDocument;
