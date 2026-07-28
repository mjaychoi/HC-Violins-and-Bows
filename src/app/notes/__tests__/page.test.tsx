import React from 'react';
import { render, screen, act, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import NotesPage from '../page';
import { getNotesStorageKeys, type Note } from '../notesStorage';

let mockTenantIdentity = {
  tenantIdentityKey: 'user-a:org-1:session-a' as string | null,
  userId: 'user-a' as string | null,
  orgId: 'org-1' as string | null,
  isTenantTransitioning: false,
};

jest.mock('@/hooks/useTenantIdentity', () => ({
  useTenantIdentity: () => mockTenantIdentity,
}));

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: jest.fn(() => ({
    canCreateNote: true,
  })),
}));

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
    disabled,
    title,
  }: {
    onClick?: () => void;
    children: React.ReactNode;
    disabled?: boolean;
    title?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
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
  const getKeys = () => {
    const keys = getNotesStorageKeys(mockTenantIdentity);
    if (!keys) throw new Error('Expected stable tenant Notes keys');
    return keys;
  };

  const makeNote = (id: string, title: string): Note => ({
    id,
    title,
    content: `${title} content`,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  });

  const dispatchStorage = (key: string, newValue: string | null) => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key,
        newValue,
      })
    );
  };

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
    mockTenantIdentity = {
      tenantIdentityKey: 'user-a:org-1:session-a',
      userId: 'user-a',
      orgId: 'org-1',
      isTenantTransitioning: false,
    };
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

    await waitFor(() => {
      expect(screen.getAllByText('Untitled').length).toBeGreaterThan(0);
    });
    expect(await screen.findByDisplayValue('Untitled')).toBeInTheDocument();
  });

  it('deletes a note after confirmation', async () => {
    const user = userEvent.setup();
    render(<NotesPage />);

    const newButton = getPrimaryNewNoteButton();
    await user.click(newButton);

    const deleteButtons = await screen.findAllByRole('button', {
      name: /delete note/i,
    });
    await user.click(deleteButtons[0]);

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirmButton);

    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
  });

  it('filters notes by search query', async () => {
    const user = userEvent.setup();
    render(<NotesPage />);

    const newButton = getPrimaryNewNoteButton();
    await user.click(newButton);

    const titleInput = await screen.findByDisplayValue('Untitled');
    await user.clear(titleInput);
    await user.type(titleInput, 'Alpha Note');

    await user.click(newButton);
    const titleInput2 = await screen.findByDisplayValue('Untitled');
    await user.clear(titleInput2);
    await user.type(titleInput2, 'Beta Note');

    const searchInput = screen.getByPlaceholderText('Search notes...');
    await user.type(searchInput, 'beta');

    expect(await screen.findByText(/Beta\s*Note/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/Alpha\s*Note/i)).not.toBeInTheDocument();
    });
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

    const contentArea = await screen.findByPlaceholderText(/start writing/i);
    await user.type(contentArea, 'Saved content');

    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(setItemSpy).toHaveBeenCalledWith(
      getKeys().list,
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

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText('Search notes...')
      ).not.toBeInTheDocument();
    });
    expect(
      await screen.findByRole('button', { name: /back to list/i })
    ).toBeInTheDocument();

    const backButton = screen.getByRole('button', { name: /back to list/i });
    await user.click(backButton);

    expect(
      await screen.findByPlaceholderText('Search notes...')
    ).toBeInTheDocument();
  });

  it('isolates Notes for the same user across organizations', async () => {
    const org1Keys = getKeys();
    localStorage.setItem(
      org1Keys.list,
      JSON.stringify([makeNote('org-1-note', 'Org 1 private note')])
    );

    const { rerender } = render(<NotesPage />);
    expect(await screen.findByText('Org 1 private note')).toBeInTheDocument();

    mockTenantIdentity = {
      ...mockTenantIdentity,
      tenantIdentityKey: 'user-a:org-2:session-a',
      orgId: 'org-2',
    };
    const org2Keys = getKeys();
    localStorage.setItem(
      org2Keys.list,
      JSON.stringify([makeNote('org-2-note', 'Org 2 private note')])
    );
    rerender(<NotesPage />);

    expect(await screen.findByText('Org 2 private note')).toBeInTheDocument();
    expect(screen.queryByText('Org 1 private note')).not.toBeInTheDocument();
    expect(org2Keys.list).not.toBe(org1Keys.list);

    mockTenantIdentity = {
      ...mockTenantIdentity,
      tenantIdentityKey: 'user-a:org-1:session-b',
      orgId: 'org-1',
    };
    rerender(<NotesPage />);

    expect(await screen.findByText('Org 1 private note')).toBeInTheDocument();
    expect(screen.queryByText('Org 2 private note')).not.toBeInTheDocument();
  });

  it('isolates Notes between accounts and restores the original account', async () => {
    const userAKeys = getKeys();
    localStorage.setItem(
      userAKeys.list,
      JSON.stringify([makeNote('user-a-note', 'User A private note')])
    );

    const { rerender } = render(<NotesPage />);
    expect(await screen.findByText('User A private note')).toBeInTheDocument();

    mockTenantIdentity = {
      tenantIdentityKey: 'user-b:org-1:session-b',
      userId: 'user-b',
      orgId: 'org-1',
      isTenantTransitioning: false,
    };
    const userBKeys = getKeys();
    rerender(<NotesPage />);

    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    expect(screen.queryByText('User A private note')).not.toBeInTheDocument();
    expect(userBKeys.list).not.toBe(userAKeys.list);

    mockTenantIdentity = {
      tenantIdentityKey: 'user-a:org-1:session-c',
      userId: 'user-a',
      orgId: 'org-1',
      isTenantTransitioning: false,
    };
    rerender(<NotesPage />);
    expect(await screen.findByText('User A private note')).toBeInTheDocument();
  });

  it('does not write a pending Tenant A save into Tenant B storage', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const tenantAKeys = getKeys();
    const { rerender } = render(<NotesPage />);

    await user.click(getPrimaryNewNoteButton());
    const contentArea = await screen.findByPlaceholderText(/start writing/i);
    await user.type(contentArea, 'Tenant A pending edit');

    mockTenantIdentity = {
      tenantIdentityKey: 'user-a:org-2:session-a',
      userId: 'user-a',
      orgId: 'org-2',
      isTenantTransitioning: false,
    };
    const tenantBKeys = getKeys();
    rerender(<NotesPage />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(localStorage.getItem(tenantBKeys.list)).toBeNull();
    expect(localStorage.getItem(tenantAKeys.list)).toBeNull();
    jest.useRealTimers();
  });

  it('synchronizes current-tenant storage updates and deletion', async () => {
    const keys = getKeys();
    render(<NotesPage />);

    act(() => {
      dispatchStorage(
        keys.list,
        JSON.stringify([makeNote('remote-note', 'Remote current note')])
      );
    });
    expect(await screen.findByText('Remote current note')).toBeInTheDocument();

    act(() => {
      dispatchStorage(keys.search, 'remote');
    });
    expect(screen.getByPlaceholderText('Search notes...')).toHaveValue(
      'remote'
    );

    act(() => {
      dispatchStorage(keys.list, null);
    });
    expect(await screen.findByText('No notes found')).toBeInTheDocument();
    expect(screen.queryByText('Remote current note')).not.toBeInTheDocument();
  });

  it('ignores other-tenant and legacy storage events and values', async () => {
    const otherKeys = getNotesStorageKeys({
      tenantIdentityKey: 'user-b:org-2:session-b',
      userId: 'user-b',
      orgId: 'org-2',
    });
    if (!otherKeys) throw new Error('Expected other-tenant keys');
    localStorage.setItem(
      'notes_list',
      JSON.stringify([makeNote('legacy', 'Legacy leaked note')])
    );
    localStorage.setItem('notes_search', 'legacy');
    render(<NotesPage />);
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();

    act(() => {
      dispatchStorage(
        otherKeys.list,
        JSON.stringify([makeNote('other', 'Other tenant note')])
      );
      dispatchStorage(
        'notes_list',
        JSON.stringify([makeNote('legacy-2', 'Legacy event note')])
      );
    });

    expect(screen.queryByText('Other tenant note')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy leaked note')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy event note')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search notes...')).toHaveValue('');
  });

  it('renders empty after scoped storage is removed and the page reloads', async () => {
    const keys = getKeys();
    localStorage.setItem(
      keys.list,
      JSON.stringify([makeNote('temporary', 'Temporary note')])
    );
    const firstRender = render(<NotesPage />);
    expect(await screen.findByText('Temporary note')).toBeInTheDocument();
    firstRender.unmount();

    localStorage.removeItem(keys.list);
    render(<NotesPage />);
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    expect(screen.queryByText('Temporary note')).not.toBeInTheDocument();
  });
});
