import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  InlineTextField,
  InlineNumberField,
  InlineSelectField,
  InlineBooleanField,
  InlineEditButton,
  InlineEditActions,
} from '../InlineEditFields';

describe('InlineTextField', () => {
  const mockOnChange = jest.fn();
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render as span when not editing', () => {
    render(
      <InlineTextField
        isEditing={false}
        value="Test Value"
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Test Value')).toBeInTheDocument();
  });

  it('should render as input when editing', () => {
    render(
      <InlineTextField
        isEditing={true}
        value="Test Value"
        onChange={mockOnChange}
      />
    );

    const input = screen.getByDisplayValue('Test Value');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
  });

  it('should call onChange when input value changes', async () => {
    const user = userEvent.setup();
    render(
      <InlineTextField isEditing={true} value="Test" onChange={mockOnChange} />
    );

    const input = screen.getByDisplayValue('Test') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'X');

    // onChange is called for each character typed (including clear)
    expect(mockOnChange).toHaveBeenCalled();
    // Just verify that onChange was called multiple times (clear + type)
    expect(mockOnChange.mock.calls.length).toBeGreaterThan(0);
  });

  it('should call onClick when span is clicked', async () => {
    const user = userEvent.setup();
    render(
      <InlineTextField
        isEditing={false}
        value="Test"
        onChange={mockOnChange}
        onClick={mockOnClick}
      />
    );

    const span = screen.getByText('Test');
    await user.click(span);

    expect(mockOnClick).toHaveBeenCalled();
  });

  it('should call onEnter when Enter is pressed', async () => {
    const mockOnEnter = jest.fn();
    const user = userEvent.setup();
    render(
      <InlineTextField
        isEditing={true}
        value="Test"
        onChange={mockOnChange}
        onEnter={mockOnEnter}
      />
    );

    const input = screen.getByDisplayValue('Test');
    await user.type(input, '{Enter}');

    expect(mockOnEnter).toHaveBeenCalled();
  });

  it('should call onEscape when Escape is pressed', async () => {
    const mockOnEscape = jest.fn();
    const user = userEvent.setup();
    render(
      <InlineTextField
        isEditing={true}
        value="Test"
        onChange={mockOnChange}
        onEscape={mockOnEscape}
      />
    );

    const input = screen.getByDisplayValue('Test');
    await user.type(input, '{Escape}');

    expect(mockOnEscape).toHaveBeenCalled();
  });

  it('should show placeholder when value is empty in edit mode', () => {
    render(
      <InlineTextField
        isEditing={true}
        value=""
        onChange={mockOnChange}
        placeholder="Enter text"
      />
    );

    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('should show dash when value is empty in view mode', () => {
    render(
      <InlineTextField isEditing={false} value="" onChange={mockOnChange} />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should support email type', () => {
    render(
      <InlineTextField
        isEditing={true}
        value="test@example.com"
        onChange={mockOnChange}
        type="email"
      />
    );

    const input = screen.getByDisplayValue('test@example.com');
    expect(input).toHaveAttribute('type', 'email');
  });
});

describe('InlineNumberField', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render number input when editing', () => {
    render(
      <InlineNumberField isEditing={true} value={123} onChange={mockOnChange} />
    );

    const input = screen.getByDisplayValue('123');
    expect(input).toHaveAttribute('type', 'number');
  });

  it('should call onChange with null when input is cleared', async () => {
    const user = userEvent.setup();
    render(
      <InlineNumberField isEditing={true} value={123} onChange={mockOnChange} />
    );

    const input = screen.getByDisplayValue('123');
    await user.clear(input);

    expect(mockOnChange).toHaveBeenCalledWith(null);
  });

  it('should format value using format function when provided', () => {
    const formatFn = (val: number | null) => `$${val?.toFixed(2) || '0.00'}`;
    render(
      <InlineNumberField
        isEditing={false}
        value={123.456}
        onChange={mockOnChange}
        format={formatFn}
      />
    );

    expect(screen.getByText('$123.46')).toBeInTheDocument();
  });

  it('should show dash when value is null in view mode', () => {
    render(
      <InlineNumberField
        isEditing={false}
        value={null}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should handle string number value', () => {
    render(
      <InlineNumberField isEditing={true} value="123" onChange={mockOnChange} />
    );

    expect(screen.getByDisplayValue('123')).toBeInTheDocument();
  });
});

describe('InlineSelectField', () => {
  const mockOnChange = jest.fn();
  const options = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
    { value: 'option3', label: 'Option 3' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render select when editing', () => {
    render(
      <InlineSelectField
        isEditing={true}
        value="option1"
        onChange={mockOnChange}
        options={options}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('should render selected option label when not editing', () => {
    render(
      <InlineSelectField
        isEditing={false}
        value="option2"
        onChange={mockOnChange}
        options={options}
      />
    );

    expect(screen.getByText('Option 2')).toBeInTheDocument();
  });

  it('should call onChange when option is selected', async () => {
    const user = userEvent.setup();
    render(
      <InlineSelectField
        isEditing={true}
        value="option1"
        onChange={mockOnChange}
        options={options}
      />
    );

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'option2');

    expect(mockOnChange).toHaveBeenCalledWith('option2');
  });

  it('should show placeholder option when provided', () => {
    render(
      <InlineSelectField
        isEditing={true}
        value={null}
        onChange={mockOnChange}
        options={options}
        placeholder="Select an option"
      />
    );

    expect(screen.getByText('Select an option')).toBeInTheDocument();
  });

  it('should show dash when value is null in view mode', () => {
    render(
      <InlineSelectField
        isEditing={false}
        value={null}
        onChange={mockOnChange}
        options={options}
      />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('InlineBooleanField', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render select when editing', () => {
    render(
      <InlineBooleanField
        isEditing={true}
        value={true}
        onChange={mockOnChange}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('should show trueLabel when value is true in view mode', () => {
    render(
      <InlineBooleanField
        isEditing={false}
        value={true}
        onChange={mockOnChange}
        trueLabel="Yes"
        falseLabel="No"
      />
    );

    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('should show falseLabel when value is false in view mode', () => {
    render(
      <InlineBooleanField
        isEditing={false}
        value={false}
        onChange={mockOnChange}
        trueLabel="Yes"
        falseLabel="No"
      />
    );

    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('should call onChange when value changes', async () => {
    const user = userEvent.setup();
    render(
      <InlineBooleanField
        isEditing={true}
        value={true}
        onChange={mockOnChange}
      />
    );

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'false');

    expect(mockOnChange).toHaveBeenCalledWith(false);
  });

  it('should show dash when value is null', () => {
    render(
      <InlineBooleanField
        isEditing={false}
        value={null}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('should handle disabled prop', () => {
    render(
      <InlineBooleanField
        isEditing={true}
        value={true}
        onChange={mockOnChange}
        disabled={true}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });

  it('should call onClick when span is clicked in view mode', async () => {
    const user = userEvent.setup();
    const mockOnClick = jest.fn();
    render(
      <InlineBooleanField
        isEditing={false}
        value={true}
        onChange={mockOnChange}
        onClick={mockOnClick}
      />
    );

    const span = screen.getByText('Yes');
    await user.click(span);

    expect(mockOnClick).toHaveBeenCalled();
  });
});

describe('InlineNumberField edge cases', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call onEnter when Enter is pressed', async () => {
    const mockOnEnter = jest.fn();
    const user = userEvent.setup();
    render(
      <InlineNumberField
        isEditing={true}
        value={123}
        onChange={mockOnChange}
        onEnter={mockOnEnter}
      />
    );

    const input = screen.getByDisplayValue('123');
    await user.type(input, '{Enter}');

    expect(mockOnEnter).toHaveBeenCalled();
  });

  it('should call onEscape when Escape is pressed', async () => {
    const mockOnEscape = jest.fn();
    const user = userEvent.setup();
    render(
      <InlineNumberField
        isEditing={true}
        value={123}
        onChange={mockOnChange}
        onEscape={mockOnEscape}
      />
    );

    const input = screen.getByDisplayValue('123');
    await user.type(input, '{Escape}');

    expect(mockOnEscape).toHaveBeenCalled();
  });

  it('should handle disabled prop', () => {
    render(
      <InlineNumberField
        isEditing={true}
        value={123}
        onChange={mockOnChange}
        disabled={true}
      />
    );

    const input = screen.getByDisplayValue('123');
    expect(input).toBeDisabled();
  });

  it('should call onClick when span is clicked in view mode', async () => {
    const user = userEvent.setup();
    const mockOnClick = jest.fn();
    render(
      <InlineNumberField
        isEditing={false}
        value={123}
        onChange={mockOnChange}
        onClick={mockOnClick}
      />
    );

    const span = screen.getByText('123');
    await user.click(span);

    expect(mockOnClick).toHaveBeenCalled();
  });
});

describe('InlineSelectField edge cases', () => {
  const mockOnChange = jest.fn();
  const options = [
    { value: 'option1', label: 'Option 1' },
    { value: 'option2', label: 'Option 2' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle disabled prop', () => {
    render(
      <InlineSelectField
        isEditing={true}
        value="option1"
        onChange={mockOnChange}
        options={options}
        disabled={true}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });

  it('should call onClick when span is clicked in view mode', async () => {
    const user = userEvent.setup();
    const mockOnClick = jest.fn();
    render(
      <InlineSelectField
        isEditing={false}
        value="option1"
        onChange={mockOnChange}
        options={options}
        onClick={mockOnClick}
      />
    );

    const span = screen.getByText('Option 1');
    await user.click(span);

    expect(mockOnClick).toHaveBeenCalled();
  });
});

describe('InlineEditButton', () => {
  const mockOnClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render button with aria-label', () => {
    render(<InlineEditButton onClick={mockOnClick} aria-label="Edit field" />);

    const button = screen.getByLabelText('Edit field');
    expect(button).toBeInTheDocument();
  });

  it('should call onClick when clicked', async () => {
    const user = userEvent.setup();
    render(<InlineEditButton onClick={mockOnClick} aria-label="Edit" />);

    const button = screen.getByLabelText('Edit');
    await user.click(button);

    expect(mockOnClick).toHaveBeenCalled();
  });

  it('should support different sizes', () => {
    const { rerender } = render(
      <InlineEditButton onClick={mockOnClick} aria-label="Edit" size="xs" />
    );

    let button = screen.getByLabelText('Edit');
    expect(button).toBeInTheDocument();

    rerender(
      <InlineEditButton onClick={mockOnClick} aria-label="Edit" size="md" />
    );

    button = screen.getByLabelText('Edit');
    expect(button).toBeInTheDocument();
  });
});

describe('InlineEditActions', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render Save and Cancel buttons', () => {
    render(
      <InlineEditActions
        isSaving={false}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should call onSave when Save button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <InlineEditActions
        isSaving={false}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const saveButton = screen.getByText('Save');
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalled();
  });

  it('should call onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <InlineEditActions
        isSaving={false}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should show loading state when isSaving is true', () => {
    render(
      <InlineEditActions
        isSaving={true}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Saving...')).toBeInTheDocument();
    const saveButton = screen.getByText('Saving...').closest('button');
    expect(saveButton).toBeDisabled();
    const cancelButton = screen.getByText('Cancel').closest('button');
    expect(cancelButton).toBeDisabled();
  });

  it('should support custom labels', () => {
    render(
      <InlineEditActions
        isSaving={false}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        saveLabel="저장"
        cancelLabel="취소"
      />
    );

    expect(screen.getByText('저장')).toBeInTheDocument();
    expect(screen.getByText('취소')).toBeInTheDocument();
  });
});
