import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import { FormWrapper, SimpleFormWrapper } from '@/components/common/layout';
import { useFormState } from '@/hooks/useFormState';
import { logError } from '@/utils/logger';

jest.mock('@/hooks/useFormState');
jest.mock('@/utils/logger');

const mockUseFormState = useFormState as jest.MockedFunction<
  typeof useFormState
>;
const mockLogError = logError as jest.MockedFunction<typeof logError>;

describe('FormWrapper', () => {
  const mockFormState = {
    formData: { name: '', email: '' },
    errors: {},
    touched: {},
    updateField: jest.fn(),
    updateFields: jest.fn(),
    setFieldError: jest.fn(),
    setFieldTouched: jest.fn(),
    resetForm: jest.fn(),
    hasErrors: false,
    isTouched: false,
    setFormData: jest.fn(),
    setErrors: jest.fn(),
    setTouched: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFormState.mockReturnValue(
      mockFormState as unknown as ReturnType<typeof useFormState>
    );
  });

  it('should render form with children', () => {
    const mockOnSubmit = jest.fn();
    render(
      <FormWrapper
        initialData={{ name: '', email: '' }}
        onSubmit={mockOnSubmit}
      >
        {({ formData }) => (
          <div>
            <input name="name" defaultValue={formData.name} />
            <button type="submit">Submit</button>
          </div>
        )}
      </FormWrapper>
    );

    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('should call onSubmit on form submit', async () => {
    const user = userEvent.setup();
    const mockOnSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <FormWrapper
        initialData={{ name: 'Test', email: 'test@example.com' }}
        onSubmit={mockOnSubmit}
      >
        {() => <button type="submit">Submit</button>}
      </FormWrapper>
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({ name: '', email: '' });
    });
  });

  it('should validate form before submit', async () => {
    const user = userEvent.setup();
    const mockOnSubmit = jest.fn();
    const validate = jest.fn().mockReturnValue({ name: 'Name is required' });

    const mockSetFieldError = jest.fn();
    mockUseFormState.mockReturnValue({
      ...mockFormState,
      setFieldError: mockSetFieldError,
    } as unknown as ReturnType<typeof useFormState>);

    render(
      <FormWrapper
        initialData={{ name: '', email: '' }}
        onSubmit={mockOnSubmit}
        validate={validate}
      >
        {() => <button type="submit">Submit</button>}
      </FormWrapper>
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(validate).toHaveBeenCalled();
      expect(mockSetFieldError).toHaveBeenCalledWith(
        'name',
        'Name is required'
      );
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  it('should handle submit errors', async () => {
    const user = userEvent.setup();
    const mockOnSubmit = jest
      .fn()
      .mockRejectedValue(new Error('Submit failed'));

    render(
      <FormWrapper
        initialData={{ name: '', email: '' }}
        onSubmit={mockOnSubmit}
      >
        {() => <button type="submit">Submit</button>}
      </FormWrapper>
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(mockLogError).toHaveBeenCalledWith(
        'Form submission error',
        expect.any(Error),
        'FormWrapper',
        expect.any(Object)
      );
    });
  });

  it('should apply custom className', () => {
    const { container } = render(
      <FormWrapper
        initialData={{ name: '' }}
        onSubmit={jest.fn()}
        className="custom-form"
      >
        {() => <button type="submit">Submit</button>}
      </FormWrapper>
    );

    const form = container.querySelector('form');
    expect(form).toHaveClass('custom-form');
  });

  it('should pass submitting prop to children', () => {
    render(
      <FormWrapper
        initialData={{ name: '' }}
        onSubmit={jest.fn()}
        submitting={true}
      >
        {({ submitting }) => (
          <button type="submit" disabled={submitting}>
            Submit
          </button>
        )}
      </FormWrapper>
    );

    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button).toBeDisabled();
  });
});

describe('SimpleFormWrapper', () => {
  const mockFormState = {
    formData: { name: '', email: '' },
    errors: {},
    touched: {},
    updateField: jest.fn(),
    updateFields: jest.fn(),
    setFieldError: jest.fn(),
    setFieldTouched: jest.fn(),
    resetForm: jest.fn(),
    hasErrors: false,
    isTouched: false,
    setFormData: jest.fn(),
    setErrors: jest.fn(),
    setTouched: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useFormState as jest.MockedFunction<typeof useFormState>).mockReturnValue(
      mockFormState as unknown as ReturnType<typeof useFormState>
    );
  });

  it('should render children directly', () => {
    render(
      <SimpleFormWrapper initialData={{ name: '' }} onSubmit={jest.fn()}>
        <div>Simple Form Content</div>
      </SimpleFormWrapper>
    );

    expect(screen.getByText('Simple Form Content')).toBeInTheDocument();
  });

  it('should pass props to FormWrapper', async () => {
    const user = userEvent.setup();
    const mockOnSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <SimpleFormWrapper initialData={{ name: 'Test' }} onSubmit={mockOnSubmit}>
        <button type="submit">Submit</button>
      </SimpleFormWrapper>
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });
});
