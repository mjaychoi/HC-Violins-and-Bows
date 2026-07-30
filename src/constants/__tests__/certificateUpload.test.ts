import {
  CERTIFICATE_PDF_SIZE_HELP_TEXT,
  CERTIFICATE_PDF_TOO_LARGE_ERROR,
  MAX_CERTIFICATE_PDF_SIZE_BYTES,
  MAX_CERTIFICATE_PDF_SIZE_MB,
} from '../certificateUpload';

describe('certificate upload constants', () => {
  it('defines the canonical 20 MiB limit and user-facing copy', () => {
    expect(MAX_CERTIFICATE_PDF_SIZE_MB).toBe(20);
    expect(MAX_CERTIFICATE_PDF_SIZE_BYTES).toBe(20 * 1024 * 1024);
    expect(CERTIFICATE_PDF_SIZE_HELP_TEXT).toBe('PDF only, max 20MB');
    expect(CERTIFICATE_PDF_TOO_LARGE_ERROR).toBe(
      'Certificate PDFs must be 20MB or smaller.'
    );
  });
});
