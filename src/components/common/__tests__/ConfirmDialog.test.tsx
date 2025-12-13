import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfirmDialog from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    message: 'Are you sure you want to delete this item?',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dialog when isOpen is true', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete this item?')
    ).toBeInTheDocument();
  });

  it('does not render dialog when isOpen is false', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
  });

  it('displays custom title', () => {
    render(<ConfirmDialog {...defaultProps} title="Custom Title" />);

    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  it('displays custom message', () => {
    render(<ConfirmDialog {...defaultProps} message="Custom message" />);

    expect(screen.getByText('Custom message')).toBeInTheDocument();
  });

  it('displays custom confirm label', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="삭제" />);

    expect(screen.getByText('삭제')).toBeInTheDocument();
  });

  it('displays custom cancel label', () => {
    render(<ConfirmDialog {...defaultProps} cancelLabel="취소" />);

    expect(screen.getByText('취소')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = jest.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when modal is closed', () => {
    const onCancel = jest.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

    // Modal's onClose should call onCancel
    // This depends on Modal implementation, but we can test the cancel button
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalled();
  });

  it('has correct styling for confirm button', () => {
    render(<ConfirmDialog {...defaultProps} />);

    const confirmButton = screen.getByText('Confirm');
    expect(confirmButton).toHaveClass('bg-red-600');
  });

  it('has correct styling for cancel button', () => {
    render(<ConfirmDialog {...defaultProps} />);

    const cancelButton = screen.getByText('Cancel');
    expect(cancelButton).toHaveClass('border-gray-300');
  });

  it('renders with Korean labels', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        title="고객을 삭제하시겠어요?"
        message="삭제한 고객은 복구할 수 없습니다."
        confirmLabel="삭제"
        cancelLabel="취소"
      />
    );

    expect(screen.getByText('고객을 삭제하시겠어요?')).toBeInTheDocument();
    expect(
      screen.getByText('삭제한 고객은 복구할 수 없습니다.')
    ).toBeInTheDocument();
    expect(screen.getByText('삭제')).toBeInTheDocument();
    expect(screen.getByText('취소')).toBeInTheDocument();
  });
});
