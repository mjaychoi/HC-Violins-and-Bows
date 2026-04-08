import { claimInvoiceImageUploads } from '../imageUploadTracking';
import { logError, logWarn } from '@/utils/logger';

jest.mock('@/utils/logger', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

const mockLogError = logError as jest.MockedFunction<typeof logError>;
const mockLogWarn = logWarn as jest.MockedFunction<typeof logWarn>;

describe('invoice image upload tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns claimed when every tracked upload is matched', async () => {
    const mockUpdateQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ file_path: 'test-org/file-a.png' }],
        error: null,
      }),
    };

    const supabase = {
      from: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateQuery),
      }),
    } as any;

    const result = await claimInvoiceImageUploads(
      supabase,
      'test-org',
      'invoice-1',
      [{ image_url: 'test-org/file-a.png' }]
    );

    expect(result).toEqual({
      status: 'claimed',
      requestedCount: 1,
      claimedCount: 1,
      missingCount: 0,
      missingPaths: [],
    });
    expect(mockLogWarn).not.toHaveBeenCalled();
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('returns partial when some tracked uploads were not claimed', async () => {
    const mockUpdateQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ file_path: 'test-org/file-a.png' }],
        error: null,
      }),
    };

    const supabase = {
      from: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateQuery),
      }),
    } as any;

    const result = await claimInvoiceImageUploads(
      supabase,
      'test-org',
      'invoice-1',
      [
        { image_url: 'test-org/file-a.png' },
        { image_url: 'test-org/file-b.png' },
      ]
    );

    expect(result.status).toBe('partial');
    expect(result.requestedCount).toBe(2);
    expect(result.claimedCount).toBe(1);
    expect(result.missingCount).toBe(1);
    expect(result.missingPaths).toEqual(['test-org/file-b.png']);
    expect(mockLogWarn).toHaveBeenCalledWith(
      'invoice-image.claim-tracking.partial',
      expect.stringContaining('requested=2'),
      expect.objectContaining({
        missingPaths: ['test-org/file-b.png'],
      })
    );
  });

  it('returns failed when the claim update errors', async () => {
    const mockUpdateQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'update failed' },
      }),
    };

    const supabase = {
      from: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue(mockUpdateQuery),
      }),
    } as any;

    const result = await claimInvoiceImageUploads(
      supabase,
      'test-org',
      'invoice-1',
      [{ image_url: 'test-org/file-a.png' }]
    );

    expect(result).toEqual({
      status: 'failed',
      requestedCount: 1,
      claimedCount: 0,
      missingCount: 1,
      missingPaths: ['test-org/file-a.png'],
    });
    expect(mockLogError).toHaveBeenCalled();
    expect(mockLogWarn).toHaveBeenCalledWith(
      'invoice-image.claim-tracking.failed',
      expect.stringContaining('fileCount=1')
    );
  });
});
