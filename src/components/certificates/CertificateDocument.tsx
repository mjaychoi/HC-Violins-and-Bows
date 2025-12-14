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
// Traditional serif font for authentic certificate feel (Strad/Vuillaume style)
let fontRegistered = false;

function ensureFonts() {
  if (fontRegistered) return;
  fontRegistered = true;

  try {
    // Register serif font (Baskerville/Garamond style) for traditional certificate
    // Using Google Fonts' EB Garamond as it's close to traditional certificate fonts
    Font.register({
      family: 'Garamond',
      fonts: [
        {
          src: 'https://fonts.gstatic.com/s/ebgaramond/v27/SlGDmQSNjdsmc35JDF1K5GRy7cJdFnk5rPtuPMV.ttf',
          fontWeight: 400,
          fontStyle: 'normal',
        },
        {
          src: 'https://fonts.gstatic.com/s/ebgaramond/v27/SlGDmQSNjdsmc35JDF1K5GRy7cJdFnk5rPtuPMV.ttf',
          fontWeight: 700,
          fontStyle: 'normal',
        },
      ],
    });

    // Korean font for bilingual support
    Font.register({
      family: 'NotoSansKR',
      fonts: [
        {
          src: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/Variable/TTF/Subset/NotoSansKR-VF.ttf',
          fontWeight: 400,
          fontStyle: 'normal',
        },
        {
          src: 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/Variable/TTF/Subset/NotoSansKR-VF.ttf',
          fontWeight: 700,
          fontStyle: 'normal',
        },
      ],
    });
  } catch (error) {
    // Log error but continue - react-pdf will use fallback font
    if (typeof window === 'undefined') {
      // Server-side only
      console.warn(
        'Font registration failed. Using fallback font.',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

const COLORS = {
  ink: '#1A1A1A', // Deep black for traditional documents
  muted: '#4A4A4A', // Soft gray for secondary text
  line: '#D4D4D4', // Subtle line color
  white: '#FFFFFF',
};

const STORE_INFO = {
  name: 'HC Violins and Bows',
  tagline: 'Premium String Instruments',
  address: '서울특별시 강남구',
  phone: '02-0000-0000',
  web: 'www.hcviolins.com',
  email: 'contact@hcviolins.com',
};

type CertificateDocumentProps = {
  instrument: Instrument;
  logoSrc?: string;
  watermarkSrc?: string;
  verifyUrl?: string;
  ownerName?: string | null;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 50,
    backgroundColor: COLORS.white,
    fontFamily: 'Garamond',
    color: COLORS.ink,
  },

  // Traditional single-column layout - no cards, no boxes
  content: {
    maxWidth: 500,
    marginLeft: 'auto',
    marginRight: 'auto',
  },

  // Header - minimal, left-aligned
  header: {
    marginBottom: 40,
    textAlign: 'left',
  },
  brandName: {
    fontSize: 14,
    fontWeight: 400,
    color: COLORS.ink,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  brandTagline: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 0.3,
    marginBottom: 32,
  },
  certTitle: {
    fontSize: 18,
    fontWeight: 400,
    color: COLORS.ink,
    letterSpacing: 0.8,
    textAlign: 'left',
    marginBottom: 8,
  },
  certSubtitle: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 0.3,
    textAlign: 'left',
    marginBottom: 24,
  },
  contactLine: {
    fontSize: 9,
    color: COLORS.muted,
    letterSpacing: 0.2,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
  },

  // Main attestation - paragraph-based, not field-based
  attestation: {
    marginTop: 32,
    marginBottom: 32,
  },
  attestationText: {
    fontSize: 11,
    lineHeight: 1.8,
    color: COLORS.ink,
    textAlign: 'left',
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  storeName: {
    fontWeight: 700,
    color: COLORS.ink,
  },

  // Instrument description - sentence-based, not table
  instrumentDescription: {
    marginTop: 24,
    marginBottom: 32,
  },
  descriptionText: {
    fontSize: 11,
    lineHeight: 1.8,
    color: COLORS.ink,
    textAlign: 'left',
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  instrumentDetails: {
    fontSize: 11,
    lineHeight: 1.8,
    color: COLORS.ink,
    textAlign: 'left',
    letterSpacing: 0.2,
    marginTop: 8,
    paddingLeft: 20,
  },

  // Signature section - authority and trust
  signature: {
    marginTop: 60,
    paddingTop: 24,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
  },
  signatureCol: {
    width: '48%',
  },
  signatureLabel: {
    fontSize: 9,
    color: COLORS.muted,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  signatureLine: {
    height: 50,
    borderTopWidth: 1,
    borderTopColor: COLORS.ink,
    borderTopStyle: 'solid',
    marginBottom: 6,
  },
  signatureHint: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 0.2,
  },

  // Footer - minimal, certificate number small and quiet
  footer: {
    position: 'absolute',
    bottom: 50,
    left: 50,
    right: 50,
    paddingTop: 20,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
    fontSize: 8,
    color: COLORS.muted,
    textAlign: 'left',
    letterSpacing: 0.2,
  },
  certNumber: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  verifyText: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 0.2,
    marginTop: 4,
  },
});

// Helper to format instrument details into sentences
function formatInstrumentDescription(
  instrument: Instrument,
  ownerName?: string | null
): string {
  const parts: string[] = [];

  // Type and maker
  if (instrument.type && instrument.maker) {
    const typeLower =
      instrument.type.toLowerCase() === 'violin'
        ? 'violin'
        : instrument.type.toLowerCase() === 'viola'
          ? 'viola'
          : instrument.type.toLowerCase() === 'cello'
            ? 'cello'
            : instrument.type.toLowerCase() === 'bass'
              ? 'double bass'
              : instrument.type.toLowerCase();
    parts.push(`This ${typeLower} is, in our considered opinion, an authentic work by ${instrument.maker}`);
  } else if (instrument.maker) {
    parts.push(`This instrument is, in our considered opinion, an authentic work by ${instrument.maker}`);
  } else if (instrument.type) {
    const typeLower =
      instrument.type.toLowerCase() === 'violin'
        ? 'violin'
        : instrument.type.toLowerCase() === 'viola'
          ? 'viola'
          : instrument.type.toLowerCase() === 'cello'
            ? 'cello'
            : instrument.type.toLowerCase() === 'bass'
              ? 'double bass'
              : instrument.type.toLowerCase();
    parts.push(`This ${typeLower} is, in our considered opinion, an authentic instrument`);
  }

  // Year
  if (instrument.year) {
    parts.push(`made in the year ${instrument.year}`);
  }

  // Serial number
  if (instrument.serial_number) {
    parts.push(`bearing the serial number ${instrument.serial_number}`);
  }

  // Ownership
  if (ownerName) {
    parts.push(`currently in the ownership of ${ownerName}`);
  }

  // Combine into sentence
  let sentence = parts.join(', ');
  if (parts.length > 0) {
    sentence += '.';
  }

  return sentence || 'This instrument has been examined and authenticated.';
}

const CertificateDocument: React.FC<CertificateDocumentProps> = ({
  instrument,
  logoSrc,
  watermarkSrc,
  verifyUrl,
  ownerName,
}) => {
  // FIXED: Ensure fonts are registered when component is rendered
  ensureFonts();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const issueDate = `${year}-${month}-${day}`;

  const rawKey =
    instrument.serial_number?.trim() ||
    instrument.id?.slice(0, 8)?.toUpperCase() ||
    'UNKNOWN';

  const certKey = rawKey
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '');

  const certificateNumber = `CERT-${certKey}-${year}`;

  const safeSrc = (s?: string | null) =>
    typeof s === 'string' && s.trim() ? s : null;

  const finalLogoSrc = safeSrc(logoSrc);
  const finalWatermarkSrc = safeSrc(watermarkSrc);

  const finalVerifyUrl =
    verifyUrl || `https://www.hcviolins.com/verify/${certificateNumber}`;

  const instrumentDescription = formatInstrumentDescription(
    instrument,
    ownerName
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Watermark (optional, very subtle) */}
        {finalWatermarkSrc ? (
          <Image
            src={finalWatermarkSrc}
            style={{
              position: 'absolute',
              top: 200,
              left: 150,
              width: 300,
              height: 300,
              opacity: 0.03,
            }}
          />
        ) : null}

        <View style={styles.content}>
          {/* Header - minimal, left-aligned */}
          <View style={styles.header}>
            {finalLogoSrc ? (
              <Image
                src={finalLogoSrc}
                style={{ width: 36, height: 36, marginBottom: 12 }}
              />
            ) : null}
            <Text style={styles.brandName}>{STORE_INFO.name}</Text>
            <Text style={styles.brandTagline}>{STORE_INFO.tagline}</Text>

            <Text style={styles.certTitle}>Certificate of Authenticity</Text>
            <Text style={styles.certSubtitle}>악기 인증서</Text>

            <Text style={styles.contactLine}>
              {STORE_INFO.address} · {STORE_INFO.phone} · {STORE_INFO.web} ·{' '}
              {STORE_INFO.email}
            </Text>
          </View>

          {/* Main Attestation - paragraph-based, traditional tone */}
          <View style={styles.attestation}>
            <Text style={styles.attestationText}>
              This is to certify that the instrument described herein is, in
              our considered opinion, an authentic work.
            </Text>
            <Text style={styles.attestationText}>
              Having examined the instrument in detail, we find its construction,
              materials, and stylistic features to be consistent with the known
              works of the maker.
            </Text>
            <Text style={styles.attestationText}>
              Issued by{' '}
              <Text style={styles.storeName}>{STORE_INFO.name}</Text>.
            </Text>
          </View>

          {/* Instrument Description - sentence-based, not table */}
          <View style={styles.instrumentDescription}>
            <Text style={styles.descriptionText}>{instrumentDescription}</Text>

            {/* Additional details if available */}
            {(instrument.subtype ||
              instrument.size ||
              instrument.weight ||
              instrument.note) && (
              <View style={{ marginTop: 12 }}>
                {instrument.subtype && (
                  <Text style={styles.instrumentDetails}>
                    Subtype: {instrument.subtype}
                  </Text>
                )}
                {instrument.size && (
                  <Text style={styles.instrumentDetails}>
                    Size: {instrument.size}
                  </Text>
                )}
                {instrument.weight && (
                  <Text style={styles.instrumentDetails}>
                    Weight: {instrument.weight}
                  </Text>
                )}
                {instrument.note && (
                  <Text style={styles.instrumentDetails}>
                    Notes: {instrument.note}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Signature Section - authority and trust */}
          <View style={styles.signature}>
            <View style={styles.signatureRow}>
              <View style={styles.signatureCol}>
                <Text style={styles.signatureLabel}>
                  Authorized Signature
                </Text>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureHint}>Name / Title</Text>
              </View>

              <View style={styles.signatureCol}>
                <Text style={styles.signatureLabel}>Store Seal / 직인</Text>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureHint}>Stamp</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Footer - minimal, certificate number small and quiet */}
        <View style={styles.footer}>
          <Text style={styles.certNumber}>
            Certificate No. {certificateNumber}
          </Text>
          <Text style={styles.verifyText}>
            Issued: {issueDate}
          </Text>
          <Text style={styles.verifyText}>
            This certificate may be verified at: {finalVerifyUrl}
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export default CertificateDocument;
