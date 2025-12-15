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
} from '@react-pdf/renderer';
import { Instrument } from '@/types';

// FIXED: Font registration disabled due to react-pdf server-side font loading issues
// Using built-in fonts (Times, Helvetica) for reliable PDF generation
// These fonts are available by default in react-pdf and provide a traditional certificate feel
//
// Note: Custom font registration from remote URLs fails in server-side rendering
// because react-pdf's fontkit cannot reliably fetch remote fonts in Next.js server environment
//
// To use custom fonts in the future:
// 1. Download font files locally to /public/fonts/
// 2. Use absolute file paths or data URIs
// 3. Or use a font service that provides direct binary access

function ensureFonts() {
  // Font registration disabled - using default fonts
  // react-pdf provides Times (serif) and Helvetica (sans-serif) by default
  // These work reliably in server-side rendering
  return;
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
  address: 'Seoul, South Korea', // English only to avoid encoding issues
  phone: process.env.NEXT_PUBLIC_STORE_PHONE || '02-0000-0000', // Use environment variable for actual phone number
  web: 'www.hcviolins.com',
  email: 'contact@hcviolins.com',
  location: 'Seoul', // For "Issued by" statement
  defaultSignerName: process.env.NEXT_PUBLIC_DEFAULT_SIGNER_NAME || 'J. Kim', // Default signer name for accountability
  defaultSignerTitle: 'Head of Certification', // Default signer title
};

type CertificateDocumentProps = {
  instrument: Instrument;
  logoSrc?: string;
  // watermarkSrc?: string; // Currently unused - watermark uses logoSrc instead
  verifyUrl?: string;
  ownerName?: string | null; // Optional - consider privacy/security implications for original certificates
  certificateNumber?: string; // Optional - if provided, use this instead of generating
  issuedAt?: string; // Optional - ISO date string, if provided use this instead of new Date()
  signerName?: string; // Optional - actual signer name for high-value transactions (English name recommended)
  signerTitle?: string; // Optional - signer title (e.g., "Master Luthier", "Certification Lead")
  signatureDate?: string; // Optional - signature date (separate from issue date)
  hasEmbossedSeal?: boolean; // Optional - indicate if embossed seal is present
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 50, // Reduced from 60
    paddingBottom: 70, // Reduced from 90
    paddingHorizontal: 50,
    backgroundColor: COLORS.white,
    fontFamily: 'Times-Roman', // Built-in serif font - traditional certificate feel
    color: COLORS.ink,
  },

  // Traditional single-column layout - no cards, no boxes
  content: {
    maxWidth: 500,
    marginLeft: 'auto',
    marginRight: 'auto',
  },

  // Header - structured hierarchy
  header: {
    marginBottom: 35, // Reduced from 50
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    borderBottomStyle: 'solid',
    paddingBottom: 18, // Reduced from 24
  },
  brandName: {
    fontSize: 12,
    fontWeight: 400,
    color: COLORS.muted,
    letterSpacing: 0.5,
    marginBottom: 2,
    textAlign: 'center',
  },
  brandTagline: {
    fontSize: 9,
    color: COLORS.muted,
    letterSpacing: 0.3,
    marginBottom: 32,
    textAlign: 'center',
  },
  certTitle: {
    fontSize: 24,
    fontFamily: 'Times-Bold',
    color: COLORS.ink,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 12, // Reduced for divider spacing
    textTransform: 'uppercase',
  },
  certTitleDivider: {
    height: 1,
    backgroundColor: COLORS.line,
    width: 200,
    marginLeft: 'auto',
    marginRight: 'auto',
    marginBottom: 24, // Reduced from 32
  },
  // Top section - 3-tier hierarchy
  instrumentHeader: {
    marginTop: 24, // Reduced from 32
    marginBottom: 28, // Reduced from 40
    textAlign: 'center',
  },
  makerYear: {
    fontSize: 21, // Reduced by 1pt for more classic, calm feel
    fontFamily: 'Times-Roman', // Serif for 17th century feel
    color: COLORS.ink,
    letterSpacing: 0.3, // Reduced for premium restraint
    textAlign: 'center',
    marginBottom: 8,
  },
  instrumentMeta: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18, // Reduced from 24
  },
  dividerLine: {
    height: 1,
    backgroundColor: COLORS.line,
    marginTop: 12, // Reduced from 16
    marginBottom: 12, // Reduced from 16
  },
  certSubtitle: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 0.3,
    textAlign: 'left',
    marginBottom: 24,
    // Korean text will use default font (Times-Roman) - react-pdf doesn't support custom fonts reliably
    // For proper Korean font support, fonts need to be loaded locally
  },
  // Korean text style - using default font for now
  ko: {
    // fontFamily: 'NotoSansKR', // Disabled - custom fonts not reliably loading
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

  // Structured fields section
  fieldsSection: {
    marginTop: 24, // Reduced from 32
    marginBottom: 24, // Reduced from 32
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderTopColor: COLORS.line,
    borderBottomColor: COLORS.line,
    borderTopStyle: 'solid',
    borderBottomStyle: 'solid',
    paddingTop: 12, // Reduced from 16
    paddingBottom: 6, // Reduced from 8
  },
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 8, // Reduced from 10
    paddingBottom: 6, // Reduced from 8
    // Border removed - spacing only
  },
  fieldLabel: {
    fontSize: 10, // Same size as value for document record feel
    fontFamily: 'Times-Roman',
    color: COLORS.muted, // Slightly muted for better scan readability
    letterSpacing: 0.2,
    marginRight: 8, // Space before colon
  },
  fieldColon: {
    fontSize: 10,
    fontFamily: 'Times-Roman',
    color: COLORS.ink,
    marginRight: 4, // Reduced spacing after colon for document format
    // No space before colon - standard document format
  },
  fieldValue: {
    fontSize: 10, // Same size as label
    fontFamily: 'Times-Roman', // Regular, not bold
    color: COLORS.ink,
    letterSpacing: 0.2,
    flex: 1,
  },
  // Supporting statement (paragraph-based)
  supportingStatement: {
    marginTop: 24, // Reduced from 32
    marginBottom: 24, // Reduced from 32
    paddingTop: 18, // Reduced from 24
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
  },
  statementText: {
    fontSize: 11,
    lineHeight: 1.5, // Reduced from 1.6
    color: COLORS.ink,
    textAlign: 'left',
    marginBottom: 12, // Reduced from 16
    letterSpacing: 0.2,
  },
  issuedByText: {
    fontSize: 11,
    lineHeight: 1.6,
    color: COLORS.ink,
    textAlign: 'left',
    marginTop: 8,
    letterSpacing: 0.2,
  },
  storeName: {
    fontFamily: 'Times-Bold',
    color: COLORS.ink,
  },

  // Instrument description - sentence-based, not table
  instrumentDescription: {
    marginTop: 24,
    marginBottom: 32,
  },
  descriptionText: {
    fontSize: 11,
    lineHeight: 1.6, // Reduced from 1.8 for more formal document feel
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
  },
  additionalObservations: {
    fontSize: 11,
    lineHeight: 1.6, // Reduced from 1.8 for more formal document feel
    color: COLORS.ink,
    textAlign: 'left',
    letterSpacing: 0.2,
    marginTop: 12,
    fontStyle: 'italic',
  },

  // Signature section - authority and trust
  signature: {
    marginTop: 50, // Reduced from 80
    paddingTop: 18, // Reduced from 24
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 35, // Reduced from 50
    alignItems: 'flex-start', // Same baseline alignment
  },
  signatureCol: {
    width: '48%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 100, // Unified height for alignment
  },
  signatureLabel: {
    fontSize: 9,
    fontFamily: 'Times-Roman', // Changed from Bold for small caps effect
    color: COLORS.muted,
    marginBottom: 12,
    letterSpacing: 0.5, // Increased for small caps effect
    textTransform: 'uppercase',
    // Small caps style for premium feel
  },
  signatureDivider: {
    height: 0.5,
    backgroundColor: COLORS.line,
    marginBottom: 16,
  },
  signatureForm: {
    marginTop: 16, // Reduced from 20
  },
  signatureFormRow: {
    flexDirection: 'row',
    marginBottom: 8, // Reduced from 12
    alignItems: 'flex-start',
  },
  signatureFormLabel: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 0.2,
    width: 80,
    fontFamily: 'Times-Roman',
  },
  signatureFormValue: {
    fontSize: 9,
    color: COLORS.ink,
    letterSpacing: 0.2,
    flex: 1,
    fontFamily: 'Times-Roman',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
    paddingBottom: 2,
    minHeight: 14,
  },
  signatureLine: {
    height: 60,
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
  signatureNameField: {
    fontSize: 9,
    color: COLORS.ink,
    letterSpacing: 0.2,
    marginTop: 4,
    fontFamily: 'Times-Roman',
  },
  signatureTitleField: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 0.2,
    marginTop: 2,
    fontStyle: 'italic',
  },
  disclaimerSection: {
    marginTop: 28, // Reduced from 40
    marginBottom: 24, // Reduced from 32
    paddingTop: 18, // Reduced from 24
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
  },
  disclaimerText: {
    fontSize: 9,
    lineHeight: 1.4, // Reduced from 1.5
    color: COLORS.muted,
    textAlign: 'left',
    letterSpacing: 0.15,
    marginBottom: 6, // Reduced from 8
  },
  sealGuide: {
    width: 80,
    height: 60, // Match signatureLine height for same baseline
    borderRadius: 40,
    borderWidth: 0.3, // Even lighter for more natural look
    borderColor: COLORS.line,
    borderStyle: 'solid',
    marginBottom: 6,
    alignSelf: 'center', // Center the circular guide
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealHint: {
    fontSize: 7, // Smaller than signatureHint
    color: COLORS.muted,
    letterSpacing: 0.15,
    marginTop: 2, // Positioned lower
  },
  signatureInfo: {
    marginTop: 18, // Reduced from 24
    marginBottom: 12, // Reduced from 16
  },
  signatureInfoLabel: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 0.3,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  signatureInfoText: {
    fontSize: 9,
    color: COLORS.ink,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  signatureInfoRole: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 0.2,
    marginTop: 2,
    fontStyle: 'italic',
  },
  // Opinion statement - standalone on page 2
  opinionStatement: {
    marginTop: 24, // Reduced from 32
    marginBottom: 18, // Reduced from 24
    paddingTop: 18, // Reduced from 24
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
  },
  opinionText: {
    fontSize: 12,
    fontFamily: 'Times-Bold',
    color: COLORS.ink,
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 1.6,
  },

  // Certificate metadata - left-aligned, grouped
  certMetadata: {
    position: 'absolute',
    bottom: 40, // Reduced from 50
    left: 50,
    minWidth: 250,
  },
  certMetadataSection: {
    marginBottom: 12, // Reduced from 16
  },
  certMetadataSubtitle: {
    fontSize: 7,
    fontFamily: 'Times-Bold',
    color: COLORS.muted,
    letterSpacing: 0.6, // Increased for better contrast
    textTransform: 'uppercase',
    marginBottom: 8, // Increased spacing
    fontWeight: 700, // Explicit bold
  },
  certMetadataLine: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 0.2,
    marginBottom: 4,
    lineHeight: 1.4,
    fontFamily: 'Times-Roman', // Same font for consistency
  },
  certMetadataLabel: {
    fontSize: 8, // Same size as value
    color: COLORS.muted,
    letterSpacing: 0.2,
    fontFamily: 'Times-Roman',
  },
  verifyText: {
    fontSize: 7,
    color: COLORS.muted,
    letterSpacing: 0.2,
  },
  // Footer metadata - single line, smaller, fixed at bottom
  footer: {
    position: 'absolute',
    bottom: 25, // Reduced from 30
    left: 50,
    right: 50,
    paddingTop: 10, // Reduced from 12
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    borderTopStyle: 'solid',
    fontSize: 7,
    color: COLORS.muted,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});

const CertificateDocument: React.FC<CertificateDocumentProps> = ({
  instrument,
  logoSrc,
  // watermarkSrc, // Currently unused
  verifyUrl,
  ownerName,
  certificateNumber: providedCertificateNumber,
  issuedAt: providedIssuedAt,
  signerName,
  signerTitle,
  signatureDate,
  hasEmbossedSeal = false,
}) => {
  // FIXED: Ensure fonts are registered when component is rendered
  ensureFonts();

  // Use provided issuedAt or generate from current date
  // NOTE: For production, issuedAt should come from database to avoid timezone issues
  const issueDate = providedIssuedAt
    ? providedIssuedAt.split('T')[0] // Extract YYYY-MM-DD from ISO string
    : (() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })();

  // Use provided certificateNumber or generate
  // NOTE: For production, certificateNumber should be stored in database to ensure consistency
  // The same instrument should always have the same certificate number
  const certificateNumber =
    providedCertificateNumber ||
    (() => {
      const year = new Date().getFullYear();
      const rawKey =
        instrument.serial_number?.trim() ||
        instrument.id?.slice(0, 8)?.toUpperCase() ||
        'UNKNOWN';

      const certKey = rawKey
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '');

      return `CERT-${certKey}-${year}`;
    })();

  const safeSrc = (s?: string | null) =>
    typeof s === 'string' && s.trim() ? s : null;

  const finalLogoSrc = safeSrc(logoSrc);
  // watermarkSrc is currently unused - watermark uses logoSrc instead
  // const finalWatermarkSrc = safeSrc(watermarkSrc);

  const finalVerifyUrl =
    verifyUrl || `https://www.hcviolins.com/verify/${certificateNumber}`;

  return (
    <Document>
      {/* Page 1: Main certificate content */}
      <Page size="A4" style={styles.page}>
        {/* Watermark logo - very subtle (5% opacity) */}
        {finalLogoSrc ? (
          <Image
            src={finalLogoSrc}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 250,
              height: 250,
              marginTop: -125,
              marginLeft: -125,
              opacity: 0.05,
            }}
          />
        ) : null}

        <View style={styles.content}>
          {/* Header - text only, no logo (premium official document feel) */}
          <View style={styles.header}>
            <Text style={styles.brandName}>{STORE_INFO.name}</Text>
            <Text style={styles.brandTagline}>{STORE_INFO.tagline}</Text>

            <Text style={styles.certTitle}>Certificate of Authenticity</Text>
            <View style={styles.certTitleDivider} />
          </View>

          {/* Top section - title format: Maker, circa Year - consistent notation */}
          <View style={styles.instrumentHeader}>
            <Text style={styles.makerYear}>
              {instrument.maker || 'Unknown maker'}
              {instrument.year ? `, circa ${instrument.year}` : ''}
            </Text>
            {instrument.type && (
              <Text style={styles.instrumentMeta}>
                {instrument.type.charAt(0).toUpperCase() +
                  instrument.type.slice(1).toLowerCase()}
              </Text>
            )}
            <View style={styles.dividerLine} />
          </View>

          {/* Structured fields section - document record format (no duplication with header) */}
          <View style={styles.fieldsSection}>
            {/* Ownership - optional, consider privacy/security for original certificates */}
            {/* For internal/CRM use only, not recommended for original certificates due to privacy/security concerns */}
            {ownerName && (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Ownership</Text>
                <Text style={styles.fieldColon}>:</Text>
                <Text style={styles.fieldValue}>{ownerName}</Text>
              </View>
            )}
            {/* Serial no. moved to certificate metadata block */}
          </View>

          {/* Supporting statement - paragraph-based explanation with explicit authenticity */}
          <View style={styles.supportingStatement}>
            <Text style={styles.statementText}>
              In our considered opinion, this{' '}
              {instrument.type?.toLowerCase() || 'instrument'} is an authentic
              example of the work of {instrument.maker || 'the stated maker'}
              {instrument.year ? `, circa ${instrument.year}` : ''}.
            </Text>
            <Text style={styles.statementText}>
              This opinion is based on examination of construction, materials,
              varnish, stylistic characteristics, and internal features. Having
              examined the instrument in detail, we find its construction,
              materials, style, and workmanship to be consistent with the
              documented works of the maker.
            </Text>
            {/* Issued by moved to footer to avoid duplication */}
          </View>

          {/* Additional observations - if available */}
          {(instrument.subtype ||
            instrument.size ||
            instrument.weight ||
            instrument.note) && (
            <View style={styles.fieldsSection}>
              {instrument.subtype && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Subtype</Text>
                  <Text style={styles.fieldColon}>:</Text>
                  <Text style={styles.fieldValue}>{instrument.subtype}</Text>
                </View>
              )}
              {instrument.size && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Size</Text>
                  <Text style={styles.fieldColon}>:</Text>
                  <Text style={styles.fieldValue}>{instrument.size}</Text>
                </View>
              )}
              {instrument.weight && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Weight</Text>
                  <Text style={styles.fieldColon}>:</Text>
                  <Text style={styles.fieldValue}>{instrument.weight}</Text>
                </View>
              )}
              {instrument.note && (
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <Text style={styles.fieldColon}>:</Text>
                  <Text style={styles.fieldValue}>
                    {(() => {
                      // Clean note to prevent double periods
                      const clean = (s: string) =>
                        s.trim().replace(/\.*\s*$/, '');
                      return clean(instrument.note || '');
                    })()}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Certificate metadata - left-aligned, grouped (all key information in one place) */}
        <View style={styles.certMetadata}>
          {/* Certificate Information Section */}
          <View style={styles.certMetadataSection}>
            <Text style={styles.certMetadataSubtitle}>
              Certificate Information
            </Text>
            <Text style={styles.certMetadataLine}>
              <Text style={styles.certMetadataLabel}>Certificate No.</Text>
              <Text style={styles.fieldColon}>:</Text> {certificateNumber}
            </Text>
            <Text style={styles.certMetadataLine}>
              <Text style={styles.certMetadataLabel}>Issued</Text>
              <Text style={styles.fieldColon}>:</Text> {issueDate}
            </Text>
            <Text style={styles.certMetadataLine}>
              <Text style={styles.certMetadataLabel}>Verification</Text>
              <Text style={styles.fieldColon}>:</Text>{' '}
              {finalVerifyUrl
                .replace('https://www.', '')
                .replace('https://', '')}
            </Text>
          </View>

          {/* Instrument Identification Section */}
          {instrument.serial_number && (
            <View style={styles.certMetadataSection}>
              <Text style={styles.certMetadataSubtitle}>
                Instrument Identification
              </Text>
              <Text style={styles.certMetadataLine}>
                <Text style={styles.certMetadataLabel}>Serial no.</Text>
                <Text style={styles.fieldColon}>:</Text>{' '}
                {instrument.serial_number}
              </Text>
            </View>
          )}
        </View>

        {/* Footer metadata - full information on page 1 (consolidated, legal entity info) */}
        <View style={styles.footer} fixed>
          <Text style={styles.verifyText}>
            {STORE_INFO.name} · {STORE_INFO.address} · {STORE_INFO.phone} ·{' '}
            {STORE_INFO.web}
          </Text>
        </View>
      </Page>

      {/* Page 2: Signature page only - redesigned for authority */}
      <Page size="A4" style={styles.page}>
        {/* Watermark logo - very subtle (5% opacity) */}
        {finalLogoSrc ? (
          <Image
            src={finalLogoSrc}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 200,
              height: 200,
              marginTop: -100,
              marginLeft: -100,
              opacity: 0.05,
            }}
          />
        ) : null}

        <View style={styles.content}>
          {/* Opinion statement - standalone, above signature (consistent notation) */}
          <View style={styles.opinionStatement}>
            <Text style={styles.opinionText}>
              Our considered opinion: Authentic work by{' '}
              {instrument.maker || 'the stated maker'}
              {instrument.year ? `, circa ${instrument.year}` : ''}
            </Text>
          </View>

          {/* Disclaimer and scope section */}
          <View style={styles.disclaimerSection}>
            <Text style={styles.disclaimerText}>
              <Text style={{ fontFamily: 'Times-Bold' }}>
                Scope of Examination:
              </Text>{' '}
              This certificate is based on visual and structural examination of
              the instrument. The opinion expressed herein reflects the
              condition and characteristics observed at the time of examination.
            </Text>
            <Text style={styles.disclaimerText}>
              <Text style={{ fontFamily: 'Times-Bold' }}>
                Professional Opinion:
              </Text>{' '}
              This opinion is rendered in accordance with standard lutherie and
              appraisal practices for historic bowed string instruments. The
              conclusions above represent our professional opinion at the time
              of examination.
            </Text>
            <Text style={styles.disclaimerText}>
              <Text style={{ fontFamily: 'Times-Bold' }}>Limitations:</Text>{' '}
              This certificate reflects our opinion based on examination at the
              time of issue. It does not constitute a legal guarantee of
              provenance. The opinion is based on available information and
              standard examination practices within the industry.
            </Text>
            <Text style={styles.disclaimerText}>
              This certificate is valid only when signed by an authorized
              representative of {STORE_INFO.name}.
            </Text>
          </View>

          {/* Signature Section - grid layout with visual guides */}
          <View style={[styles.signature, { marginTop: 0 }]}>
            {/* Examiner information */}
            <View style={styles.signatureInfo}>
              <Text style={styles.signatureInfoLabel}>
                Examined and certified by
              </Text>
              <Text style={styles.signatureInfoText}>{STORE_INFO.name}</Text>
              <Text style={styles.signatureInfoRole}>
                Authorized representative
              </Text>
            </View>

            {/* Divider before signature section */}
            <View style={styles.signatureDivider} />

            <View style={styles.signatureRow}>
              <View style={styles.signatureCol}>
                <Text style={styles.signatureLabel}>Authorized Signature</Text>
                <View style={styles.signatureLine} />
              </View>

              <View style={styles.signatureCol}>
                <Text style={styles.signatureLabel}>Store Seal</Text>
                <View style={styles.sealGuide} />
                {hasEmbossedSeal && (
                  <Text style={styles.sealHint}>Embossed seal</Text>
                )}
                {!hasEmbossedSeal && <Text style={styles.sealHint}>Stamp</Text>}
              </View>
            </View>

            {/* Signature form - fixed format for accountability */}
            <View style={styles.signatureForm}>
              <View style={styles.signatureFormRow}>
                <Text style={styles.signatureFormLabel}>Signature:</Text>
                <Text style={styles.signatureFormValue}>
                  {'_________________'}
                </Text>
              </View>
              <View style={styles.signatureFormRow}>
                <Text style={styles.signatureFormLabel}>Printed name:</Text>
                <Text style={styles.signatureFormValue}>
                  {signerName || STORE_INFO.defaultSignerName} /{' '}
                  {signerTitle || STORE_INFO.defaultSignerTitle}
                </Text>
              </View>
              <View style={styles.signatureFormRow}>
                <Text style={styles.signatureFormLabel}>Title:</Text>
                <Text style={styles.signatureFormValue}>
                  {signerTitle || 'Master Luthier / Certification Lead'}
                </Text>
              </View>
              <View style={styles.signatureFormRow}>
                <Text style={styles.signatureFormLabel}>Date:</Text>
                <Text style={styles.signatureFormValue}>
                  {signatureDate || issueDate || '_________________'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Footer metadata - website only on page 2 */}
        <View style={styles.footer} fixed>
          <Text style={styles.verifyText}>{STORE_INFO.web}</Text>
        </View>
      </Page>
    </Document>
  );
};

export default CertificateDocument;
