import { apiFetch } from '@/utils/apiFetch';

type DownloadCertificateParams = {
  url: string;
  downloadFileName: string;
  successMessage?: string;
  errorContext: string;
  showSuccess: (message: string) => void;
  handleError: (error: unknown, context?: string) => void;
};

export async function downloadCertificatePdf({
  url,
  downloadFileName,
  successMessage = 'Certificate downloaded successfully',
  errorContext,
  showSuccess,
  handleError,
}: DownloadCertificateParams): Promise<boolean> {
  try {
    const response = await apiFetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download certificate: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (!contentType || !contentType.startsWith('application/pdf')) {
      throw new Error('Invalid file type');
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error('Empty file');
    }

    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = downloadFileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(objectUrl);

    showSuccess(successMessage);
    return true;
  } catch (error) {
    handleError(error, errorContext);
    return false;
  }
}
