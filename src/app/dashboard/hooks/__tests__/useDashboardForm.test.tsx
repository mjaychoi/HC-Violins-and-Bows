import { renderHook, act } from '@/test-utils/render';
import { useDashboardForm } from '../useDashboardForm';

describe('useDashboardForm', () => {
  it('should initialize with default form data', () => {
    const { result } = renderHook(() => useDashboardForm());

    expect(result.current.formData.status).toBe('Available');
    expect(result.current.formData.maker).toBe('');
    expect(result.current.formData.type).toBe('Instrument');
    expect(result.current.formData.subtype).toBe('Violin');
    expect(result.current.priceInput).toBe('');
    expect(result.current.selectedFiles).toHaveLength(0);
  });

  it('should update individual field', () => {
    const { result } = renderHook(() => useDashboardForm());

    act(() => {
      result.current.updateField('maker', 'Stradivari');
    });

    expect(result.current.formData.maker).toBe('Stradivari');
  });

  it('should update multiple fields', () => {
    const { result } = renderHook(() => useDashboardForm());

    act(() => {
      result.current.updateFields({
        maker: 'Guarneri',
        type: 'Violin',
        year: '1700',
      });
    });

    expect(result.current.formData.maker).toBe('Guarneri');
    expect(result.current.formData.type).toBe('Violin');
    expect(result.current.formData.year).toBe('1700');
  });

  it('should handle price change', () => {
    const { result } = renderHook(() => useDashboardForm());

    act(() => {
      result.current.handlePriceChange('10000');
    });

    // FIXED: priceInput is the single source of truth, formData.price is derived at submit time
    expect(result.current.priceInput).toBe('10000');
    // formData.price is not updated immediately - it remains at initial value (empty string)
    expect(result.current.formData.price).toBe('');
  });

  it('should handle file change', () => {
    const { result } = renderHook(() => useDashboardForm());

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const fileList = { 0: file, length: 1, item: () => file } as any;

    act(() => {
      result.current.handleFileChange(fileList);
    });

    expect(result.current.selectedFiles).toHaveLength(1);
    expect(result.current.selectedFiles[0].name).toBe('test.jpg');
  });

  it('should remove file at index', () => {
    const { result } = renderHook(() => useDashboardForm());

    const file1 = new File(['test1'], 'test1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['test2'], 'test2.jpg', { type: 'image/jpeg' });
    const fileList = {
      0: file1,
      1: file2,
      length: 2,
      item: (i: number) => (i === 0 ? file1 : file2),
    } as any;

    act(() => {
      result.current.handleFileChange(fileList);
    });

    expect(result.current.selectedFiles).toHaveLength(2);

    act(() => {
      result.current.removeFile(0);
    });

    expect(result.current.selectedFiles).toHaveLength(1);
    expect(result.current.selectedFiles[0].name).toBe('test2.jpg');
  });

  it('should handle null file list', () => {
    const { result } = renderHook(() => useDashboardForm());

    act(() => {
      result.current.handleFileChange(null);
    });

    expect(result.current.selectedFiles).toHaveLength(0);
  });

  it('should reset form', () => {
    const { result } = renderHook(() => useDashboardForm());

    act(() => {
      result.current.updateField('maker', 'Stradivari');
      result.current.updateField('year', '1700');
    });

    expect(result.current.formData.maker).toBe('Stradivari');
    expect(result.current.formData.year).toBe('1700');

    act(() => {
      result.current.resetForm();
    });

    expect(result.current.formData.maker).toBe('');
    expect(result.current.formData.year).toBe('');
    expect(result.current.priceInput).toBe('');
    expect(result.current.selectedFiles).toHaveLength(0);
  });

  it('should not sync price input with form data (priceInput is single source of truth)', () => {
    const { result } = renderHook(() => useDashboardForm());

    act(() => {
      // FIXED: formData.price is string type, so use string value
      result.current.updateField('price', '5000');
    });

    // FIXED: priceInput is the single source of truth and is not synced from formData.price
    // formData.price can be set directly, but priceInput remains independent
    // This test verifies that priceInput is not automatically synced from formData.price
    expect(result.current.formData.price).toBe('5000');
    expect(result.current.priceInput).toBe(''); // priceInput is not synced from formData
  });

  it('should support all form fields', () => {
    const { result } = renderHook(() => useDashboardForm());

    act(() => {
      result.current.updateFields({
        size: '4/4',
        weight: '500g',
        ownership: 'Store',
        note: 'Test note',
      });
    });

    expect(result.current.formData.size).toBe('4/4');
    expect(result.current.formData.weight).toBe('500g');
    expect(result.current.formData.ownership).toBe('Store');
    expect(result.current.formData.note).toBe('Test note');
  });
});
