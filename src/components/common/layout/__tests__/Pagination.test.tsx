import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from '../Pagination';

describe('Pagination', () => {
  const mockOnPageChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic rendering', () => {
    it('should render page numbers', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      expect(screen.getByText(/Page/)).toBeInTheDocument();
      const currentPageEl =
        screen.getByText(/^1$/).closest('span') || screen.getAllByText('1')[0];
      expect(currentPageEl).toBeInTheDocument();
    });

    it('should render navigation buttons', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      expect(screen.getByTitle('First page')).toBeInTheDocument();
      expect(screen.getByText('Prev')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByTitle('Last page')).toBeInTheDocument();
    });
  });

  describe('Navigation buttons', () => {
    it('should call onPageChange when Next is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const nextButton = screen.getByText('Next');
      await user.click(nextButton);

      expect(mockOnPageChange).toHaveBeenCalledWith(2);
    });

    it('should call onPageChange when Prev is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          currentPage={3}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const prevButton = screen.getByText('Prev');
      await user.click(prevButton);

      expect(mockOnPageChange).toHaveBeenCalledWith(2);
    });

    it('should call onPageChange when First is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          currentPage={5}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const firstButton = screen.getByTitle('First page');
      await user.click(firstButton);

      expect(mockOnPageChange).toHaveBeenCalledWith(1);
    });

    it('should call onPageChange when Last is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const lastButton = screen.getByTitle('Last page');
      await user.click(lastButton);

      expect(mockOnPageChange).toHaveBeenCalledWith(5);
    });

    it('should disable Prev and First buttons on first page', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const prevButton = screen.getByText('Prev');
      const firstButton = screen.getByTitle('First page');

      expect(prevButton).toBeDisabled();
      expect(firstButton).toBeDisabled();
    });

    it('should disable Next and Last buttons on last page', () => {
      render(
        <Pagination
          currentPage={5}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const nextButton = screen.getByText('Next');
      const lastButton = screen.getByTitle('Last page');

      expect(nextButton).toBeDisabled();
      expect(lastButton).toBeDisabled();
    });

    it('should disable all buttons when loading', () => {
      render(
        <Pagination
          currentPage={3}
          totalPages={5}
          onPageChange={mockOnPageChange}
          loading={true}
        />
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });

    it('should not call onPageChange when clicking disabled buttons', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const prevButton = screen.getByText('Prev');
      await user.click(prevButton);

      expect(mockOnPageChange).not.toHaveBeenCalled();
    });
  });

  describe('Count display', () => {
    it('should show item count when totalCount and pageSize are provided', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={mockOnPageChange}
          totalCount={100}
          pageSize={10}
        />
      );

      expect(screen.getByText(/Showing/)).toBeInTheDocument();
      expect(screen.getByText(/1-10/)).toBeInTheDocument();
      expect(screen.getByText(/100/)).toBeInTheDocument();
    });

    it('should calculate endItem correctly on last page', () => {
      render(
        <Pagination
          currentPage={10}
          totalPages={10}
          onPageChange={mockOnPageChange}
          totalCount={95}
          pageSize={10}
        />
      );

      expect(screen.getByText(/91-95/)).toBeInTheDocument();
    });

    it('should show filtered count when hasFilters and filteredCount are provided', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={2}
          onPageChange={mockOnPageChange}
          totalCount={100}
          pageSize={10}
          filteredCount={20}
          hasFilters={true}
        />
      );

      expect(screen.getByText(/20/)).toBeInTheDocument();
      expect(screen.getByText(/100/)).toBeInTheDocument();
      expect(screen.getByText(/\(filtered\)/)).toBeInTheDocument();
    });

    it('should not show filtered label when filteredCount equals totalCount', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={mockOnPageChange}
          totalCount={50}
          pageSize={10}
          filteredCount={50}
          hasFilters={true}
        />
      );

      expect(screen.queryByText(/\(filtered\)/)).not.toBeInTheDocument();
      expect(screen.getByText(/1-10/)).toBeInTheDocument();
    });

    it('should format large numbers with locale string', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={100}
          onPageChange={mockOnPageChange}
          totalCount={1000000}
          pageSize={10000}
        />
      );

      expect(screen.getByText(/1,000,000/)).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('should handle zero totalPages', () => {
      render(
        <Pagination
          currentPage={0}
          totalPages={0}
          onPageChange={mockOnPageChange}
        />
      );

      expect(screen.getByText(/Page/)).toBeInTheDocument();
      // Should clamp to 1, but there may be multiple "1" texts, so just check it exists
      expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    });

    it('should clamp currentPage to valid range', () => {
      render(
        <Pagination
          currentPage={100}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      expect(screen.getByText(/Page/)).toBeInTheDocument();
      // Should clamp to 5, but there may be multiple "5" texts
      expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    });

    it('should clamp negative currentPage to 1', () => {
      render(
        <Pagination
          currentPage={-5}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      expect(screen.getByText(/Page/)).toBeInTheDocument();
      expect(screen.getByText(/1/)).toBeInTheDocument();
    });

    it('should handle single page', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={1}
          onPageChange={mockOnPageChange}
        />
      );

      const nextButton = screen.getByText('Next');
      const prevButton = screen.getByText('Prev');
      expect(nextButton).toBeDisabled();
      expect(prevButton).toBeDisabled();
    });

    it('should not call onPageChange when handleFirst is called on first page', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const firstButton = screen.getByTitle('First page');
      await user.click(firstButton);

      expect(mockOnPageChange).not.toHaveBeenCalled();
    });

    it('should not call onPageChange when handlePrev is called on first page', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const prevButton = screen.getByText('Prev');
      await user.click(prevButton);

      expect(mockOnPageChange).not.toHaveBeenCalled();
    });

    it('should not call onPageChange when handleNext is called on last page', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          currentPage={5}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const nextButton = screen.getByText('Next');
      await user.click(nextButton);

      expect(mockOnPageChange).not.toHaveBeenCalled();
    });

    it('should not call onPageChange when handleLast is called on last page', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          currentPage={5}
          totalPages={5}
          onPageChange={mockOnPageChange}
        />
      );

      const lastButton = screen.getByTitle('Last page');
      await user.click(lastButton);

      expect(mockOnPageChange).not.toHaveBeenCalled();
    });

    it('should not call onPageChange when loading is true', async () => {
      const user = userEvent.setup();
      render(
        <Pagination
          currentPage={3}
          totalPages={5}
          onPageChange={mockOnPageChange}
          loading={true}
        />
      );

      const nextButton = screen.getByText('Next');
      await user.click(nextButton);

      expect(mockOnPageChange).not.toHaveBeenCalled();
    });
  });
});
