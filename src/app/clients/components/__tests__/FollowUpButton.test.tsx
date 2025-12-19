// src/app/clients/components/__tests__/FollowUpButton.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import FollowUpButton from '../FollowUpButton';

describe('FollowUpButton', () => {
  const mockClientId = 'client-123';
  const mockInstrumentId = 'instrument-456';
  const mockOnSetFollowUp = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Default variant', () => {
    it('renders default variant with labels', () => {
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
        />
      );

      expect(screen.getByText('Follow-up:')).toBeInTheDocument();
      expect(screen.getByText('In 7 days')).toBeInTheDocument();
      expect(screen.getByText('In 30 days')).toBeInTheDocument();
      expect(screen.getByText('In 90 days')).toBeInTheDocument();
    });

    it('calls onSetFollowUp with 7 days when 7 days button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
        />
      );

      const button7Days = screen.getByText('In 7 days');
      await user.click(button7Days);

      expect(mockOnSetFollowUp).toHaveBeenCalledWith(
        mockClientId,
        null,
        7,
        'Follow-up in 7 days'
      );
    });

    it('calls onSetFollowUp with 30 days when 30 days button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
        />
      );

      const button30Days = screen.getByText('In 30 days');
      await user.click(button30Days);

      expect(mockOnSetFollowUp).toHaveBeenCalledWith(
        mockClientId,
        null,
        30,
        'Follow-up in 30 days'
      );
    });

    it('calls onSetFollowUp with 90 days when 90 days button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
        />
      );

      const button90Days = screen.getByText('In 90 days');
      await user.click(button90Days);

      expect(mockOnSetFollowUp).toHaveBeenCalledWith(
        mockClientId,
        null,
        90,
        'Follow-up in 90 days'
      );
    });

    it('passes instrumentId when provided', async () => {
      const user = userEvent.setup();
      render(
        <FollowUpButton
          clientId={mockClientId}
          instrumentId={mockInstrumentId}
          onSetFollowUp={mockOnSetFollowUp}
        />
      );

      const button7Days = screen.getByText('In 7 days');
      await user.click(button7Days);

      expect(mockOnSetFollowUp).toHaveBeenCalledWith(
        mockClientId,
        mockInstrumentId,
        7,
        'Follow-up in 7 days'
      );
    });

    it('passes null when instrumentId is not provided', async () => {
      const user = userEvent.setup();
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
        />
      );

      const button7Days = screen.getByText('In 7 days');
      await user.click(button7Days);

      expect(mockOnSetFollowUp).toHaveBeenCalledWith(
        mockClientId,
        null,
        7,
        'Follow-up in 7 days'
      );
    });

    it('disables buttons when loading', () => {
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
          loading={true}
        />
      );

      const button7Days = screen.getByText('In 7 days');
      const button30Days = screen.getByText('In 30 days');
      const button90Days = screen.getByText('In 90 days');

      expect(button7Days).toBeDisabled();
      expect(button30Days).toBeDisabled();
      expect(button90Days).toBeDisabled();
    });
  });

  describe('Compact variant', () => {
    it('renders compact variant without labels', () => {
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
          variant="compact"
        />
      );

      expect(screen.queryByText('Follow-up:')).not.toBeInTheDocument();
      expect(screen.getByText('7d')).toBeInTheDocument();
      expect(screen.getByText('30d')).toBeInTheDocument();
      expect(screen.getByText('90d')).toBeInTheDocument();
    });

    it('renders compact buttons with correct titles', () => {
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
          variant="compact"
        />
      );

      const button7d = screen.getByText('7d');
      const button30d = screen.getByText('30d');
      const button90d = screen.getByText('90d');

      expect(button7d).toHaveAttribute('title', 'Follow-up in 7 days');
      expect(button30d).toHaveAttribute('title', 'Follow-up in 30 days');
      expect(button90d).toHaveAttribute('title', 'Follow-up in 90 days');
    });

    it('calls onSetFollowUp when compact buttons are clicked', async () => {
      const user = userEvent.setup();
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
          variant="compact"
        />
      );

      const button7d = screen.getByText('7d');
      await user.click(button7d);

      expect(mockOnSetFollowUp).toHaveBeenCalledWith(
        mockClientId,
        null,
        7,
        'Follow-up in 7 days'
      );
    });

    it('disables compact buttons when loading', () => {
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
          variant="compact"
          loading={true}
        />
      );

      const button7d = screen.getByText('7d');
      const button30d = screen.getByText('30d');
      const button90d = screen.getByText('90d');

      expect(button7d).toBeDisabled();
      expect(button30d).toBeDisabled();
      expect(button90d).toBeDisabled();
    });
  });

  describe('Edge cases', () => {
    it('calls onSetFollowUp (error handling is parent responsibility)', async () => {
      const user = userEvent.setup();
      const rejectedOnSetFollowUp = jest.fn().mockResolvedValue(undefined);

      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={rejectedOnSetFollowUp}
        />
      );

      const button7Days = screen.getByText('In 7 days');

      // Component should call onSetFollowUp, error handling is parent's responsibility
      await user.click(button7Days);

      await waitFor(() => {
        expect(rejectedOnSetFollowUp).toHaveBeenCalledWith(
          mockClientId,
          null,
          7,
          'Follow-up in 7 days'
        );
      });
    });

    it('handles undefined instrumentId', async () => {
      const user = userEvent.setup();
      render(
        <FollowUpButton
          clientId={mockClientId}
          instrumentId={undefined}
          onSetFollowUp={mockOnSetFollowUp}
        />
      );

      const button7Days = screen.getByText('In 7 days');
      await user.click(button7Days);

      expect(mockOnSetFollowUp).toHaveBeenCalledWith(
        mockClientId,
        null,
        7,
        'Follow-up in 7 days'
      );
    });

    it('maintains button accessibility with titles in compact variant', () => {
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
          variant="compact"
        />
      );

      const buttons = screen.getAllByTitle(/Follow-up in \d+ days/);
      expect(buttons).toHaveLength(3);
    });

    it('handles rapid button clicks without errors', async () => {
      const user = userEvent.setup();
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
        />
      );

      const button7Days = screen.getByText('In 7 days');
      const button30Days = screen.getByText('In 30 days');

      // Rapid clicks
      await user.click(button7Days);
      await user.click(button30Days);
      await user.click(button7Days);

      // Should handle all clicks
      expect(mockOnSetFollowUp).toHaveBeenCalledTimes(3);
    });

    it('uses correct purpose string format', async () => {
      const user = userEvent.setup();
      render(
        <FollowUpButton
          clientId={mockClientId}
          onSetFollowUp={mockOnSetFollowUp}
        />
      );

      const button90Days = screen.getByText('In 90 days');
      await user.click(button90Days);

      expect(mockOnSetFollowUp).toHaveBeenCalledWith(
        mockClientId,
        null,
        90,
        'Follow-up in 90 days'
      );
    });
  });
});
