import React from 'react';
import { render, screen, act } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import NotesPage from '../page';

jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

jest.mock('@/components/layout', () => ({
  AppLayout: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

jest.mock('@/components/common/inputs', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
    id,
    name,
  }: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    id?: string;
    name?: string;
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      id={id}
      name={name}
    />
  ),
  Button: ({
    onClick,
    children,
  }: {
    onClick?: () => void;
    children: React.ReactNode;
  }) => <button onClick={onClick}>{children}</button>,
}));

jest.mock('@/components/common', () => ({
  EmptyState: ({
    title,
    description,
    actionButton,
  }: {
    title: string;
    description?: string;
    actionButton?: { label: string; onClick: () => void };
  }) => (
    <div>
      <div>{title}</div>
      {description && <div>{description}</div>}
      {actionButton && (
        <button onClick={actionButton.onClick}>{actionButton.label}</button>
      )}
    </div>
  ),
}));

jest.mock('@/components/common/modals', () => ({
  ConfirmDialog: ({
    isOpen,
    onConfirm,
    onCancel,
    title,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
  }) => {
    if (!isOpen) return null;
    return (
      <div>
        <div>{title}</div>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  },
}));

describe('NotesPage', () => {
  const getPrimaryNewNoteButton = () => {
    const button = screen
      .getAllByRole('button')
      .find(btn => (btn.textContent || '').trim().startsWith('New Note'));
    if (!button) {
      throw new Error('Primary New Note button not found');
    }
    return button;
  };

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  it('renders empty state when no notes exist', () => {
    render(<NotesPage />);

    expect(screen.getAllByText('Notes').length).toBeGreaterThan(0);
    expect(screen.getByText('No notes yet')).toBeInTheDocument();
    expect(screen.getByText('No note selected')).toBeInTheDocument();
  });

  it('creates a new note and selects it', async () => {
    const user = userEvent.setup();
    render(<NotesPage />);

    const newButton = getPrimaryNewNoteButton();
    await user.click(newButton);

    expect(screen.getAllByText('Untitled').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Untitled')).toBeInTheDocument();
  });

  it('deletes a note after confirmation', async () => {
    const user = userEvent.setup();
    render(<NotesPage />);

    const newButton = getPrimaryNewNoteButton();
    await user.click(newButton);

    const deleteButtons = screen.getAllByRole('button', {
      name: /delete note/i,
    });
    await user.click(deleteButtons[0]);

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirmButton);

    expect(screen.getByText('No notes yet')).toBeInTheDocument();
  });

  it('filters notes by search query', async () => {
    const user = userEvent.setup();
    render(<NotesPage />);

    const newButton = getPrimaryNewNoteButton();
    await user.click(newButton);

    const titleInput = screen.getByDisplayValue('Untitled');
    await user.clear(titleInput);
    await user.type(titleInput, 'Alpha Note');

    await user.click(newButton);
    const titleInput2 = screen.getByDisplayValue('Untitled');
    await user.clear(titleInput2);
    await user.type(titleInput2, 'Beta Note');

    const searchInput = screen.getByPlaceholderText('Search notes...');
    await user.type(searchInput, 'beta');

    expect(screen.getByText(/Beta\s*Note/i)).toBeInTheDocument();
    expect(screen.queryByText(/Alpha\s*Note/i)).not.toBeInTheDocument();
  });

  it('persists notes to localStorage after edits', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    render(<NotesPage />);

    const newButton = getPrimaryNewNoteButton();
    await user.click(newButton);

    const contentArea = screen.getByPlaceholderText(/start writing/i);
    await user.type(contentArea, 'Saved content');

    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(setItemSpy).toHaveBeenCalledWith(
      'notes_list',
      expect.stringContaining('Saved content')
    );

    setItemSpy.mockRestore();
    jest.useRealTimers();
  });

  it('toggles mobile view between list and edit', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    });

    const user = userEvent.setup();
    render(<NotesPage />);

    const newButton = getPrimaryNewNoteButton();
    await user.click(newButton);

    expect(
      screen.queryByPlaceholderText('Search notes...')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /back to list/i })
    ).toBeInTheDocument();

    const backButton = screen.getByRole('button', { name: /back to list/i });
    await user.click(backButton);

    expect(screen.getByPlaceholderText('Search notes...')).toBeInTheDocument();
  });
});
