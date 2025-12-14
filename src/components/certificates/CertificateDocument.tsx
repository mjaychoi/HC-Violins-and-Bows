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

// FIXED: Font registration moved to function to avoid module load-time execution
// This prevents unnecessary CDN fetches on cold starts and bundle loading
let fontRegistered = false;

function ensureFonts() {
  if (fontRegistered) return;
  fontRegistered = true;

  try {
    // ✅ FIXED: fontWeight를 숫자로 변경 (react-pdf 안정성)
    Font.register({
      family: 'NotoSansKR',
      fonts: [
        {
          // Variable font supports normal weight (400)
          src: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/Variable/TTF/Subset/NotoSansKR-VF.ttf',
          fontWeight: 400,
          fontStyle: 'normal',
        },
        {
          // Variable font supports bold weight (700)
          src: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/Variable/TTF/Subset/NotoSansKR-VF.ttf',
          fontWeight: 700,
          fontStyle: 'normal',
        },
        // Note: Italic variants are not registered - if italic is needed, add font files
        // For now, italic will fallback to regular font
      ],
    });
  } catch (error) {
    // Log error but continue - react-pdf will use fallback font
    if (typeof window === 'undefined') {
      // Server-side only
      console.warn(
        'Korean font registration failed. Using fallback font.',
        error instanceof Error ? error.message : String(error)
      );
    }
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
  // optional: owner name (client name for ownership display)
  ownerName?: string | null;
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
    borderWidth: 2,
    borderColor: COLORS.navy,
    borderStyle: 'solid',
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
  // ✅ FIXED: 헤더를 세로 레이아웃으로 재구성하여 로고와 제목 겹침 방지
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  // ✅ FIXED: gap을 marginRight로 변경 (react-pdf 호환성)
  brandLeft: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 42, height: 42, marginRight: 10 },
  brandName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.ink,
    letterSpacing: 0.3,
  },
  brandTagline: { fontSize: 8, color: COLORS.muted, marginTop: 2 },

  certTitleWrap: { alignItems: 'flex-end' },
  certSubtitle: { fontSize: 10, color: '#9CA3AF' },
  
  // ✅ FIXED: 제목을 별도 행으로 분리하여 겹침 방지
  headerTitleRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  certTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.ink,
    letterSpacing: 2.2,
    textAlign: 'center',
  },

  metaLine: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
    fontSize: 9,
    color: COLORS.muted,
    lineHeight: 1.4,
  },

  // Certificate Number - 공식 문서 느낌 (고급스러운 스타일)
  certBadge: {
    marginTop: 26,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.gold,
    borderRadius: 4,
    overflow: 'hidden',
  },
  certBadgeLabel: { fontSize: 9, color: COLORS.muted, marginBottom: 6 },
  certBadgeValue: {
    fontSize: 13,
    letterSpacing: 1.6,
    fontFamily: 'Courier',
    fontWeight: 700,
    color: COLORS.ink,
  },

  // Sections - 라인 기반
  section: { marginTop: 24 },
  // ✅ FIXED: gap을 marginRight로 변경 (react-pdf 호환성)
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.ink,
    letterSpacing: 0.5,
    marginRight: 10,
  },
  sectionRule: {
    flexGrow: 1,
    height: 1,
    backgroundColor: COLORS.line,
  },

  card: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderStyle: 'solid',
    borderRadius: 10,
    padding: 12,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },

  // 2-column grid for fields
  // ✅ FIXED: padding 방식으로 변경하여 오른쪽 컬럼 오버플로우 방지
  grid: { flexDirection: 'row' },
  colLeft: { flexBasis: '50%', paddingRight: 10, minWidth: 0 },
  colRight: { flexBasis: '50%', paddingLeft: 10, minWidth: 0 },
  field: { marginBottom: 10, flexDirection: 'row' },
  // ✅ FIXED: label 폭 조정 (값이 긴 경우 대비)
  fieldLabel: {
    fontSize: 10,
    width: 86,
    color: '#555555',
    marginRight: 10,
  },
  // ✅ FIXED: fieldValue에 flexShrink 명시하여 긴 값 줄바꿈 개선
  fieldValue: {
    fontSize: 12,
    flexGrow: 1,
    flexShrink: 1,
    fontWeight: 'bold',
    color: COLORS.ink,
    lineHeight: 1.4,
  },

  noteBox: {
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
    paddingTop: 12,
    marginTop: 12,
  },
  noteText: {
    fontSize: 10,
    color: COLORS.ink,
    lineHeight: 1.5,
    maxWidth: '100%',
  },

  // Signature - 공식 문서 느낌
  attest: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
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
  },
  // ✅ FIXED: gap을 marginRight로 변경 (react-pdf 호환성)
  signCol: { width: '45%', marginRight: 20 },
  signLabel: {
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  signLine: {
    height: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.ink,
    borderTopStyle: 'solid',
    backgroundColor: COLORS.white,
    paddingTop: 8,
  },
  sealBox: {
    height: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.ink,
    borderTopStyle: 'solid',
    backgroundColor: COLORS.white,
    paddingTop: 8,
  },
  signHint: {
    marginTop: 4,
    fontSize: 8,
    color: COLORS.muted,
    // Note: fontStyle: 'italic' removed - NotoSansKR italic variant not registered
    // Using normal style instead
  },

  // Footer - 신뢰 요소 집합
  footer: {
    position: 'absolute',
    bottom: 38,
    left: 46,
    right: 46,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
    paddingTop: 12,
    fontSize: 9,
    color: COLORS.muted,
    flexDirection: 'column',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  // ✅ FIXED: gap을 marginBottom으로 변경 (react-pdf 호환성)
  footerLeft: { flexDirection: 'column' },
  footerLeftItem: { marginBottom: 2, maxWidth: '100%' },
  footerRight: { textAlign: 'right' },
});

function field(label: string, value?: React.ReactNode) {
  // FIXED: Filter out false/undefined from style array (react-pdf compatibility)
  const fieldStyle = [
    styles.field,
    { flexDirection: 'row' as const, alignItems: 'flex-start' as const },
  ].filter(Boolean);

  // Convert value to string for proper text wrapping
  const valueStr = value !== null && value !== undefined ? String(value) : 'N/A';

  return (
    <View style={fieldStyle}>
      <Text style={styles.fieldLabel}>{label}:</Text>
      <Text style={styles.fieldValue} wrap>{valueStr}</Text>
    </View>
  );
}

const CertificateDocument: React.FC<CertificateDocumentProps> = ({
  instrument,
  logoSrc,
  watermarkSrc,
  verifyUrl,
  ownerName,
}) => {
  // FIXED: Ensure fonts are registered when component is rendered (not at module load)
  ensureFonts();

  // ✅ FIXED: issueDate 포맷팅 개선 (locale 문제 방지, Intl 의존 제거)
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const issueDate = `${year}-${month}-${day}`;

  // ✅ FIXED: certKey 정규화 (문서-safe하게)
  const rawKey =
    instrument.serial_number?.trim() ||
    instrument.id?.slice(0, 8)?.toUpperCase() ||
    'UNKNOWN';

  const certKey = rawKey
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '');

  const certificateNumber = `CERT-${certKey}-${year}`;

  const priceKRW =
    typeof instrument.price === 'number'
      ? `₩ ${instrument.price.toLocaleString('ko-KR')} KRW`
      : undefined;

  // ✅ FIXED: Image src 안전성 체크 (빈 문자열도 처리)
  const safeSrc = (s?: string | null) =>
    typeof s === 'string' && s.trim() ? s : null;

  const finalLogoSrc = safeSrc(logoSrc);
  const finalWatermarkSrc = safeSrc(watermarkSrc);

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
        {finalWatermarkSrc ? (
          <Image src={finalWatermarkSrc} style={styles.watermark} />
        ) : null}

        {/* Header */}
        <View style={styles.header}>
          {/* Top row: Logo + Brand (left), Korean subtitle (right) */}
          <View style={styles.headerTop}>
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
              <Text style={styles.certSubtitle}>악기 인증서</Text>
            </View>
          </View>

          {/* Main title: Centered, separate row to avoid overlap */}
          <View style={styles.headerTitleRow}>
            <Text style={styles.certTitle}>CERTIFICATE OF AUTHENTICITY</Text>
          </View>

          <Text style={styles.metaLine}>
            {STORE_INFO.address} · {STORE_INFO.phone} · {STORE_INFO.web} ·{' '}
            {STORE_INFO.email}
          </Text>

          <View style={styles.certBadge}>
            <Text style={styles.certBadgeLabel}>
              Certificate Number / 인증서 번호
            </Text>
            <Text style={styles.certBadgeValue} wrap>{certificateNumber}</Text>
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
              <View style={styles.colLeft}>
                {field('Maker / 제작자', instrument.maker)}
                {field('Type / 종류', instrument.type)}
                {field('Subtype / 세부 종류', instrument.subtype)}
                {field(
                  'Year / 연도',
                  instrument.year ? String(instrument.year) : undefined
                )}
              </View>

              <View style={styles.colRight}>
                {field('Serial Number / 시리얼 번호', instrument.serial_number)}
                {field('Size / 크기', instrument.size)}
                {field('Weight / 무게', instrument.weight)}
                {field('Ownership / 소유권', ownerName)}
              </View>
            </View>

            {priceKRW || instrument.note ? (
              <View style={{ marginTop: 8 }}>
                {priceKRW ? field('Price / 가격', priceKRW) : null}
                {instrument.note ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.fieldLabel}>Notes / 비고</Text>
                    <Text style={styles.noteText} wrap>{instrument.note}</Text>
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
            <Text style={styles.footerLeftItem}>
              Issued Date / 발급일: {issueDate}
            </Text>
            {finalVerifyUrl ? (
              <>
                <Text style={styles.footerLeftItem}>
                  Verification / 검증:
                </Text>
                <Text style={styles.footerLeftItem} wrap>
                  {finalVerifyUrl}
                </Text>
              </>
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
