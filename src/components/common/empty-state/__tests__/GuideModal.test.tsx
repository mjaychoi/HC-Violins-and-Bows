import React from 'react';
import { render, screen, fireEvent } from '@/test-utils/render';
import { GuideModal } from '../GuideModal';

describe('GuideModal', () => {
  const steps = ['첫 악기 정보를 입력하세요', '가격과 상태를 설정하세요'];
  const onClose = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when closed', () => {
    const { container } = render(
      <GuideModal
        isOpen={false}
        onClose={onClose}
        title="시작하기 가이드"
        steps={steps}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders title and steps when open', () => {
    render(
      <GuideModal
        isOpen
        onClose={onClose}
        title="시작하기 가이드"
        steps={steps}
      />
    );

    expect(screen.getByText('시작하기 가이드')).toBeInTheDocument();
    expect(
      screen.getByText('다음 단계를 따라 첫 악기를 추가해보세요:')
    ).toBeInTheDocument();
    expect(screen.getByText('첫 악기 정보를 입력하세요')).toBeInTheDocument();
    expect(screen.getByText('가격과 상태를 설정하세요')).toBeInTheDocument();
  });

  it('calls onClose when clicking the primary button', () => {
    render(
      <GuideModal
        isOpen
        onClose={onClose}
        title="시작하기 가이드"
        steps={steps}
      />
    );

    fireEvent.click(screen.getByText('시작하기'));
    expect(onClose).toHaveBeenCalled();
  });
});
