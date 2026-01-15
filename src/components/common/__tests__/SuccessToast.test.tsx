import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@/test-utils/render';
import SuccessToast from '../feedback/SuccessToast';

jest.useFakeTimers();

describe('SuccessToast', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  it('renders message and close button', () => {
    render(
      <SuccessToast message="Saved!" onClose={onClose} autoClose={false} />
    );
    expect(screen.getByText('Saved!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it.skip('auto closes after timeout', () => {
    render(<SuccessToast message="Auto" onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('manual close hides immediately and triggers onClose', () => {
    render(
      <SuccessToast message="Manual" onClose={onClose} autoClose={false} />
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    // component unmounts after click
    expect(screen.queryByText('Manual')).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onClose).toHaveBeenCalled();
  });
});
