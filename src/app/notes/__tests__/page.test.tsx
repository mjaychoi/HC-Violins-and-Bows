import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import NotesPage from '../page';
import {
  getNotesStorageKeys,
  parseStoredNotes,
  type Note,
} from '../notesStorage';
import * as notesApi from '../notesApi';
import { ApiResponseError } from '@/utils/handleApiResponse';

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
    createNoteDisabledReason: undefined,
  })),
}));

jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

jest.mock('../notesApi', () => ({
  fetchNotes: jest.fn(),
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
  noteFromRecord: jest.requireActual('../notesApi').noteFromRecord,
  legacyNoteMigrationIdempotencyKey:
    jest.requireActual('../notesApi').legacyNoteMigrationIdempotencyKey,
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

const fetchNotesMock = notesApi.fetchNotes as jest.MockedFunction<
  typeof notesApi.fetchNotes
>;
const createNoteMock = notesApi.createNote as jest.MockedFunction<
  typeof notesApi.createNote
>;
const updateNoteMock = notesApi.updateNote as jest.MockedFunction<
  typeof notesApi.updateNote
>;
const deleteNoteMock = notesApi.deleteNote as jest.MockedFunction<
  typeof notesApi.deleteNote
>;

describe('NotesPage', () => {
  const getKeys = () => {
    const keys = getNotesStorageKeys(mockTenantIdentity);
    if (!keys) throw new Error('Expected stable tenant Notes keys');
    return keys;
  };

  const makeNote = (id: string, title: string, content?: string): Note => ({
    id,
    title,
    content: content ?? `${title} content`,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    syncedUpdatedAt: '2026-07-29T00:00:00.000Z',
  });

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
    jest.clearAllMocks();
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
    fetchNotesMock.mockResolvedValue([]);
    createNoteMock.mockImplementation(async input =>
      makeNote(
        `created-${Math.random().toString(16).slice(2, 10)}`,
        input.title,
        input.content
      )
    );
    updateNoteMock.mockImplementation(async input =>
      makeNote(input.id, input.title ?? 'Untitled', input.content ?? '')
    );
    deleteNoteMock.mockResolvedValue(undefined);
  });

  it('renders empty state when no notes exist', async () => {
    render(<NotesPage />);

    expect(screen.getAllByText('Notes').length).toBeGreaterThan(0);
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    expect(screen.getByText('No note selected')).toBeInTheDocument();
    expect(screen.getByText(/saved to your account/i)).toBeInTheDocument();
  });

  it('loads notes from the server API', async () => {
    fetchNotesMock.mockResolvedValue([makeNote('n1', 'Server note')]);
    render(<NotesPage />);

    expect(await screen.findByText('Server note')).toBeInTheDocument();
    expect(fetchNotesMock).toHaveBeenCalled();
  });

  it('creates a new note via the API and selects it', async () => {
    const user = userEvent.setup();
    render(<NotesPage />);
    await screen.findByText('No notes yet');

    await user.click(getPrimaryNewNoteButton());

    await waitFor(() => {
      expect(createNoteMock).toHaveBeenCalledWith({
        title: 'Untitled',
        content: '',
      });
    });
    expect(await screen.findByDisplayValue('Untitled')).toBeInTheDocument();
  });

  it('deletes a note after confirmation via the API', async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([makeNote('n1', 'To delete')]);
    render(<NotesPage />);
    expect(await screen.findByText('To delete')).toBeInTheDocument();

    const deleteButtons = await screen.findAllByRole('button', {
      name: /delete note/i,
    });
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(deleteNoteMock).toHaveBeenCalledWith('n1');
    });
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
  });

  it('filters notes by search query', async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([
      makeNote('a', 'Alpha Note'),
      makeNote('b', 'Beta Note'),
    ]);
    render(<NotesPage />);
    expect(await screen.findByText('Alpha Note')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search notes...'), 'beta');

    expect(await screen.findAllByText('Beta Note')).not.toHaveLength(0);
    await waitFor(() => {
      expect(screen.queryByText('Alpha Note')).not.toBeInTheDocument();
    });
  });

  it('persists edits to the server after debounce', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    fetchNotesMock.mockResolvedValue([makeNote('n1', 'Editable')]);
    render(<NotesPage />);

    const contentArea = await screen.findByPlaceholderText(/start writing/i);
    await user.type(contentArea, ' Saved content');

    act(() => {
      jest.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'n1',
          content: expect.stringContaining('Saved content'),
          updated_at: '2026-07-29T00:00:00.000Z',
        }),
        expect.anything()
      );
    });

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
    await screen.findByText('No notes yet');

    await user.click(getPrimaryNewNoteButton());

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText('Search notes...')
      ).not.toBeInTheDocument();
    });
    expect(
      await screen.findByRole('button', { name: /back to list/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to list/i }));

    expect(
      await screen.findByPlaceholderText('Search notes...')
    ).toBeInTheDocument();
  });

  it('isolates Notes for the same user across organizations', async () => {
    fetchNotesMock.mockResolvedValue([
      makeNote('org-1-note', 'Org 1 private note'),
    ]);
    const { rerender } = render(<NotesPage />);
    expect(await screen.findByText('Org 1 private note')).toBeInTheDocument();

    mockTenantIdentity = {
      ...mockTenantIdentity,
      tenantIdentityKey: 'user-a:org-2:session-a',
      orgId: 'org-2',
    };
    fetchNotesMock.mockResolvedValue([
      makeNote('org-2-note', 'Org 2 private note'),
    ]);
    rerender(<NotesPage />);

    expect(await screen.findByText('Org 2 private note')).toBeInTheDocument();
    expect(screen.queryByText('Org 1 private note')).not.toBeInTheDocument();

    mockTenantIdentity = {
      ...mockTenantIdentity,
      tenantIdentityKey: 'user-a:org-1:session-b',
      orgId: 'org-1',
    };
    fetchNotesMock.mockResolvedValue([
      makeNote('org-1-note', 'Org 1 private note'),
    ]);
    rerender(<NotesPage />);

    expect(await screen.findByText('Org 1 private note')).toBeInTheDocument();
    expect(screen.queryByText('Org 2 private note')).not.toBeInTheDocument();
  });

  it('migrates Phase-1 localStorage notes when the server list is empty', async () => {
    const keys = getKeys();
    localStorage.setItem(
      keys.list,
      JSON.stringify([
        {
          id: 'local-1',
          title: 'Local only note',
          content: 'from device',
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        },
      ])
    );
    fetchNotesMock.mockResolvedValue([]);
    createNoteMock.mockResolvedValue(
      makeNote('server-1', 'Local only note', 'from device')
    );

    render(<NotesPage />);

    expect(await screen.findByText('Local only note')).toBeInTheDocument();
    expect(createNoteMock).toHaveBeenCalledWith(
      {
        title: 'Local only note',
        content: 'from device',
      },
      expect.objectContaining({
        idempotencyKey: 'note-migrate:local-1',
      })
    );
    expect(localStorage.getItem(keys.migrated)).toBe('1');
    expect(localStorage.getItem(keys.list)).toBeNull();
  });

  it('does not re-migrate after the migrated flag is set', async () => {
    const keys = getKeys();
    localStorage.setItem(keys.migrated, '1');
    localStorage.setItem(
      keys.list,
      JSON.stringify([
        {
          id: 'local-1',
          title: 'Should stay local',
          content: 'x',
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        },
      ])
    );
    fetchNotesMock.mockResolvedValue([]);

    render(<NotesPage />);
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    expect(createNoteMock).not.toHaveBeenCalled();
  });

  it('shows a load error when the server fetch fails', async () => {
    fetchNotesMock.mockRejectedValue(new Error('network down'));
    render(<NotesPage />);

    expect(
      await screen.findByText(/failed to load notes from the server/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Unable to load notes')).toBeInTheDocument();
  });

  it('shows a persistent save error on update failure', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    fetchNotesMock.mockResolvedValue([makeNote('n1', 'Editable')]);
    updateNoteMock.mockRejectedValue(new Error('QuotaExceededError'));

    render(<NotesPage />);
    const contentArea = await screen.findByPlaceholderText(/start writing/i);
    await user.type(contentArea, ' Will fail');

    act(() => {
      jest.advanceTimersByTime(600);
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/save failed/i);
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();

    jest.useRealTimers();
  });

  it('flushes a pending edit on pagehide', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    fetchNotesMock.mockResolvedValue([makeNote('n1', 'Editable')]);
    render(<NotesPage />);

    const contentArea = await screen.findByPlaceholderText(/start writing/i);
    await user.type(contentArea, ' Flushed on pagehide');

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalled();
    });

    jest.useRealTimers();
  });

  it('activates a note row via Enter and Space', async () => {
    fetchNotesMock.mockResolvedValue([
      makeNote('a', 'Alpha'),
      makeNote('b', 'Beta'),
    ]);
    render(<NotesPage />);
    expect(await screen.findByText('Alpha')).toBeInTheDocument();

    const alphaRow = screen.getByText('Alpha').closest('[role="button"]');
    if (!alphaRow) throw new Error('Alpha row not found');
    act(() => {
      alphaRow.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      );
    });
    expect(await screen.findByDisplayValue('Alpha')).toBeInTheDocument();

    const betaRow = screen.getByText('Beta').closest('[role="button"]');
    if (!betaRow) throw new Error('Beta row not found');
    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      betaRow.dispatchEvent(spaceEvent);
    });
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(await screen.findByDisplayValue('Beta')).toBeInTheDocument();
  });

  it('does not overwrite an unsaved local edit when focus refresh returns remote data', async () => {
    fetchNotesMock.mockResolvedValue([makeNote('note-x', 'Note X')]);
    render(<NotesPage />);

    const titleInput = await screen.findByDisplayValue('Note X');
    fireEvent.change(titleInput, {
      target: { value: 'Local unsaved title' },
    });

    fetchNotesMock.mockResolvedValue([
      { ...makeNote('note-x', 'Note X'), title: 'Remote conflicting title' },
    ]);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(screen.getByDisplayValue('Local unsaved title')).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue('Remote conflicting title')
    ).not.toBeInTheDocument();
  });

  it('does not let a stale auto-save response overwrite newer local edits', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    let resolveFirst!: (note: Note) => void;
    const firstSave = new Promise<Note>(resolve => {
      resolveFirst = resolve;
    });

    fetchNotesMock.mockResolvedValue([makeNote('n1', 'Editable', 'Hello')]);
    updateNoteMock.mockImplementationOnce(() => firstSave);

    render(<NotesPage />);
    const contentArea = await screen.findByPlaceholderText(/start writing/i);

    await user.type(contentArea, ' first');
    act(() => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledTimes(1);
    });
    expect(updateNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'n1',
        content: 'Hello first',
        updated_at: '2026-07-29T00:00:00.000Z',
      }),
      expect.anything()
    );

    await user.type(contentArea, ' second');
    expect(contentArea).toHaveValue('Hello first second');

    const staleServerNote: Note = {
      ...makeNote('n1', 'Editable', 'Hello first'),
      updatedAt: '2026-07-29T00:00:01.000Z',
      syncedUpdatedAt: '2026-07-29T00:00:01.000Z',
    };

    await act(async () => {
      resolveFirst(staleServerNote);
      await firstSave;
    });

    expect(contentArea).toHaveValue('Hello first second');
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'n1',
          content: 'Hello first second',
          updated_at: '2026-07-29T00:00:01.000Z',
        }),
        expect.anything()
      );
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(contentArea).toHaveValue('Hello first second');

    jest.useRealTimers();
  });

  it('does not discard newer keystrokes when a second flush starts while a save is in flight', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    let resolveFirst!: (note: Note) => void;
    const firstSave = new Promise<Note>(resolve => {
      resolveFirst = resolve;
    });

    fetchNotesMock.mockResolvedValue([makeNote('n1', 'Editable', 'Hello')]);
    updateNoteMock.mockImplementationOnce(() => firstSave);

    render(<NotesPage />);
    const contentArea = await screen.findByPlaceholderText(/start writing/i);

    await user.type(contentArea, ' first');
    act(() => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledTimes(1);
    });

    await user.type(contentArea, ' second');

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
      jest.advanceTimersByTime(600);
    });

    const callsWhileFirstInFlight = updateNoteMock.mock.calls.length;

    await act(async () => {
      resolveFirst({
        ...makeNote('n1', 'Editable', 'Hello first'),
        updatedAt: '2026-07-29T00:00:01.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:01.000Z',
      });
      await firstSave;
    });

    expect(contentArea).toHaveValue('Hello first second');
    expect(screen.queryByDisplayValue('Hello first')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(updateNoteMock.mock.calls.length).toBeGreaterThan(
        callsWhileFirstInFlight
      );
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello first second',
          updated_at: '2026-07-29T00:00:01.000Z',
        }),
        expect.anything()
      );
    });

    expect(contentArea).toHaveValue('Hello first second');
    expect(await screen.findByText('Saved')).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('reloads from the server on a genuine NOTES_CONFLICT', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    fetchNotesMock
      .mockResolvedValueOnce([makeNote('n1', 'Editable', 'Hello')])
      .mockResolvedValue([makeNote('n1', 'From other tab', 'Remote')]);
    updateNoteMock.mockRejectedValue(
      new ApiResponseError('Note was updated elsewhere', {
        status: 409,
        error_code: 'NOTES_CONFLICT',
      })
    );

    render(<NotesPage />);
    const contentArea = await screen.findByPlaceholderText(/start writing/i);
    await user.type(contentArea, ' local');

    act(() => {
      jest.advanceTimersByTime(600);
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/updated elsewhere/i);
    expect(
      await screen.findByDisplayValue('From other tab')
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Remote')).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('treats a delete 404 as already-deleted success and does not resurrect the note', async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([makeNote('n1', 'To delete')]);
    deleteNoteMock.mockRejectedValue(
      new ApiResponseError('Note not found', { status: 404 })
    );

    render(<NotesPage />);
    expect(await screen.findByText('To delete')).toBeInTheDocument();

    const deleteButtons = await screen.findAllByRole('button', {
      name: /delete note/i,
    });
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(deleteNoteMock).toHaveBeenCalledWith('n1');
    });
    expect(screen.queryByText('To delete')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
  });

  it('rolls back an optimistic delete on a transient failure', async () => {
    const user = userEvent.setup();
    fetchNotesMock.mockResolvedValue([makeNote('n1', 'To delete')]);
    deleteNoteMock.mockRejectedValue(
      new ApiResponseError('Server error', { status: 500 })
    );

    render(<NotesPage />);
    expect(await screen.findByText('To delete')).toBeInTheDocument();

    const deleteButtons = await screen.findAllByRole('button', {
      name: /delete note/i,
    });
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(deleteNoteMock).toHaveBeenCalledWith('n1');
    });
    expect(await screen.findByText('To delete')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/save failed/i);
  });

  it('resumes interrupted legacy migration without duplicating already-migrated notes', async () => {
    const keys = getKeys();
    localStorage.setItem(
      keys.list,
      JSON.stringify([
        {
          id: 'local-1',
          title: 'First',
          content: 'a',
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        },
        {
          id: 'local-2',
          title: 'Second',
          content: 'b',
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        },
        {
          id: 'local-3',
          title: 'Third',
          content: 'c',
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        },
      ])
    );

    let resolveSecond!: (note: Note) => void;
    const hungSecond = new Promise<Note>(resolve => {
      resolveSecond = resolve;
    });

    fetchNotesMock.mockResolvedValueOnce([]);
    createNoteMock
      .mockResolvedValueOnce(makeNote('server-1', 'First', 'a'))
      .mockReturnValueOnce(hungSecond);

    const { unmount } = render(<NotesPage />);

    await waitFor(() => {
      expect(createNoteMock).toHaveBeenCalledTimes(2);
    });
    expect(createNoteMock).toHaveBeenNthCalledWith(
      1,
      {
        title: 'First',
        content: 'a',
      },
      expect.objectContaining({
        idempotencyKey: 'note-migrate:local-1',
      })
    );
    expect(createNoteMock).toHaveBeenNthCalledWith(
      2,
      {
        title: 'Second',
        content: 'b',
      },
      expect.objectContaining({
        idempotencyKey: 'note-migrate:local-2',
      })
    );
    expect(localStorage.getItem(keys.migrated)).toBeNull();
    expect(
      parseStoredNotes(localStorage.getItem(keys.list)).map(note => note.id)
    ).toEqual(['local-2', 'local-3']);

    unmount();

    fetchNotesMock.mockResolvedValue([makeNote('server-1', 'First', 'a')]);
    createNoteMock.mockImplementation(async input =>
      makeNote(`server-${input.title}`, input.title, input.content)
    );

    render(<NotesPage />);

    expect(await screen.findByText('First')).toBeInTheDocument();
    expect(await screen.findByText('Second')).toBeInTheDocument();
    expect(await screen.findByText('Third')).toBeInTheDocument();

    const callsAfterResume = createNoteMock.mock.calls.length;
    const createdTitlesAfterResume = createNoteMock.mock.calls.map(
      call => call[0].title
    );
    expect(
      createdTitlesAfterResume.filter(title => title === 'First')
    ).toHaveLength(1);
    expect(
      createdTitlesAfterResume.filter(title => title === 'Third')
    ).toHaveLength(1);
    expect(localStorage.getItem(keys.migrated)).toBe('1');
    expect(localStorage.getItem(keys.list)).toBeNull();

    await act(async () => {
      resolveSecond(makeNote('server-2-stale-loop', 'Second', 'b'));
      await hungSecond;
    });

    expect(createNoteMock).toHaveBeenCalledTimes(callsAfterResume);
    expect(createNoteMock.mock.calls.map(call => call[0].title)).toEqual(
      createdTitlesAfterResume
    );
    expect(localStorage.getItem(keys.migrated)).toBe('1');
    expect(localStorage.getItem(keys.list)).toBeNull();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
    expect(screen.queryByText('server-2-stale-loop')).not.toBeInTheDocument();

    const secondKeys = createNoteMock.mock.calls
      .filter(call => call[0].title === 'Second')
      .map(call => call[1]?.idempotencyKey);
    expect(secondKeys.length).toBeGreaterThanOrEqual(1);
    expect(secondKeys.every(key => key === 'note-migrate:local-2')).toBe(true);
  });

  it('dedupes a retried legacy note that already exists on the server', async () => {
    const keys = getKeys();
    const replayed = makeNote('server-1', 'First', 'a');
    localStorage.setItem(
      keys.list,
      JSON.stringify([
        {
          id: 'local-1',
          title: 'First',
          content: 'a',
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        },
      ])
    );

    fetchNotesMock.mockResolvedValue([replayed]);
    createNoteMock.mockResolvedValue(replayed);

    render(<NotesPage />);

    expect(await screen.findByText('First')).toBeInTheDocument();
    expect(screen.getAllByText('First')).toHaveLength(1);
    await waitFor(() => {
      expect(createNoteMock).toHaveBeenCalledWith(
        {
          title: 'First',
          content: 'a',
        },
        expect.objectContaining({
          idempotencyKey: 'note-migrate:local-1',
        })
      );
    });
    expect(localStorage.getItem(keys.migrated)).toBe('1');
    expect(localStorage.getItem(keys.list)).toBeNull();
  });

  it('does not resurrect a deleted note when a stale save response arrives later', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    let resolveSave!: (note: Note) => void;
    const pendingSave = new Promise<Note>(resolve => {
      resolveSave = resolve;
    });

    fetchNotesMock.mockResolvedValue([makeNote('n1', 'To delete', 'Hello')]);
    updateNoteMock.mockImplementationOnce(() => pendingSave);
    deleteNoteMock.mockResolvedValue(undefined);

    render(<NotesPage />);
    const contentArea = await screen.findByPlaceholderText(/start writing/i);
    await user.type(contentArea, ' edit');

    act(() => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledTimes(1);
    });

    const deleteButtons = await screen.findAllByRole('button', {
      name: /delete note/i,
    });
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(deleteNoteMock).toHaveBeenCalledWith('n1');
    });
    expect(screen.queryByText('To delete')).not.toBeInTheDocument();

    await act(async () => {
      resolveSave({
        ...makeNote('n1', 'To delete', 'Hello edit'),
        updatedAt: '2026-07-29T00:00:01.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:01.000Z',
      });
      await pendingSave;
    });

    expect(screen.queryByText('To delete')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Hello edit')).not.toBeInTheDocument();
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('still persists newer text when unmount overlaps an in-flight save', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    let resolveFirst!: (note: Note) => void;
    const firstSave = new Promise<Note>(resolve => {
      resolveFirst = resolve;
    });

    fetchNotesMock.mockResolvedValue([makeNote('n1', 'Editable', 'Hello')]);
    updateNoteMock.mockImplementationOnce(() => firstSave);

    const { unmount } = render(<NotesPage />);
    const contentArea = await screen.findByPlaceholderText(/start writing/i);

    await user.type(contentArea, ' first');
    act(() => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledTimes(1);
    });

    await user.type(contentArea, ' second');
    unmount();

    await act(async () => {
      resolveFirst({
        ...makeNote('n1', 'Editable', 'Hello first'),
        updatedAt: '2026-07-29T00:00:01.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:01.000Z',
      });
      await firstSave;
    });

    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello first second',
          updated_at: '2026-07-29T00:00:01.000Z',
        }),
        expect.objectContaining({ keepalive: true })
      );
    });

    jest.useRealTimers();
  });

  it('ignores a second New Note click while create is already in flight', async () => {
    let resolveCreate!: (note: Note) => void;
    const pendingCreate = new Promise<Note>(resolve => {
      resolveCreate = resolve;
    });
    createNoteMock.mockImplementationOnce(() => pendingCreate);

    render(<NotesPage />);
    await screen.findByText('No notes yet');

    const button = getPrimaryNewNoteButton();
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(createNoteMock).toHaveBeenCalledTimes(1);
    });
    expect(getPrimaryNewNoteButton()).toBeDisabled();

    await act(async () => {
      resolveCreate(makeNote('created-1', 'Untitled', ''));
      await pendingCreate;
    });

    expect(await screen.findByDisplayValue('Untitled')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Untitled')).toHaveLength(1);
    expect(getPrimaryNewNoteButton()).not.toBeDisabled();
  });

  it('re-enables New Note after a failed create', async () => {
    const user = userEvent.setup();
    createNoteMock.mockRejectedValueOnce(new Error('create failed'));

    render(<NotesPage />);
    await screen.findByText('No notes yet');

    await user.click(getPrimaryNewNoteButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/save failed/i);
    expect(getPrimaryNewNoteButton()).not.toBeDisabled();
    expect(createNoteMock).toHaveBeenCalledTimes(1);
  });

  const notesConflictError = () =>
    new ApiResponseError('Note was updated elsewhere', {
      status: 409,
      error_code: 'NOTES_CONFLICT',
    });

  const noteRow = (title: string) => {
    const row = screen
      .getAllByText(title)
      .map(node => node.closest('[role="button"]'))
      .find((node): node is HTMLElement => node instanceof HTMLElement);
    if (!row) {
      throw new Error(`${title} row not found`);
    }
    return row;
  };

  const selectNote = (title: string) => {
    fireEvent.click(noteRow(title));
  };

  const contentArea = () => screen.getByPlaceholderText(/start writing/i);

  describe('V3-001 conflict draft isolation', () => {
    it('preserves an unrelated dirty draft when another note hits NOTES_CONFLICT', async () => {
      jest.useFakeTimers();

      const noteA0 = makeNote('note-a', 'Note A', 'A0');
      const noteB0 = makeNote('note-b', 'Note B', 'B0');
      const noteAServer = {
        ...makeNote('note-a', 'Note A remote', 'A-server-new'),
        updatedAt: '2026-07-29T00:00:05.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:05.000Z',
      };

      let resolveA!: (error: Error) => void;
      const pendingA = new Promise<Note>((_resolve, reject) => {
        resolveA = reject;
      });

      fetchNotesMock
        .mockResolvedValueOnce([noteA0, noteB0])
        .mockResolvedValue([noteAServer, noteB0]);
      updateNoteMock.mockImplementation(input => {
        if (input.id === 'note-a') {
          return pendingA;
        }
        return Promise.resolve(
          makeNote(input.id, input.title ?? 'Untitled', input.content ?? '')
        );
      });

      render(<NotesPage />);
      expect(await screen.findByDisplayValue('Note A')).toBeInTheDocument();

      fireEvent.change(contentArea(), { target: { value: 'A-local' } });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledTimes(1);
      });

      selectNote('Note B');
      fireEvent.change(contentArea(), { target: { value: 'B-local' } });
      expect(contentArea()).toHaveValue('B-local');

      await act(async () => {
        resolveA(notesConflictError());
        await pendingA.catch(() => undefined);
      });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/updated elsewhere/i);
      expect(await screen.findByText('Note A remote')).toBeInTheDocument();

      selectNote('Note A remote');
      expect(contentArea()).toHaveValue('A-server-new');

      selectNote('Note B');
      expect(contentArea()).toHaveValue('B-local');
      expect(screen.queryByDisplayValue('B0')).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'note-b',
            content: 'B-local',
            updated_at: '2026-07-29T00:00:00.000Z',
          }),
          expect.anything()
        );
      });

      jest.useRealTimers();
    });

    it('keeps two dirty notes isolated so only the conflicted note reloads', async () => {
      jest.useFakeTimers();

      const noteA0 = makeNote('note-a', 'Note A', 'A0');
      const noteB0 = makeNote('note-b', 'Note B', 'B0');
      const noteAServer = {
        ...makeNote('note-a', 'Note A remote', 'A-server-new'),
        updatedAt: '2026-07-29T00:00:05.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:05.000Z',
      };
      const noteBSaved = {
        ...makeNote('note-b', 'Note B', 'B-local'),
        updatedAt: '2026-07-29T00:00:02.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:02.000Z',
      };

      fetchNotesMock
        .mockResolvedValueOnce([noteA0, noteB0])
        .mockResolvedValue([noteAServer, noteB0]);
      updateNoteMock.mockImplementation(async input => {
        if (input.id === 'note-a') {
          throw notesConflictError();
        }
        return {
          ...makeNote(input.id, input.title ?? 'Note B', input.content ?? ''),
          updatedAt: '2026-07-29T00:00:02.000Z',
          syncedUpdatedAt: '2026-07-29T00:00:02.000Z',
        };
      });

      render(<NotesPage />);
      expect(await screen.findByDisplayValue('Note A')).toBeInTheDocument();

      fireEvent.change(contentArea(), { target: { value: 'A-local' } });
      selectNote('Note B');
      fireEvent.change(contentArea(), { target: { value: 'B-local' } });

      act(() => {
        jest.advanceTimersByTime(600);
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /updated elsewhere/i
      );
      expect(screen.getByDisplayValue('B-local')).toBeInTheDocument();
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'note-b',
          content: 'B-local',
          updated_at: '2026-07-29T00:00:00.000Z',
        }),
        expect.anything()
      );

      fireEvent.change(contentArea(), { target: { value: 'B-local-2' } });
      act(() => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'note-b',
            content: 'B-local-2',
            updated_at: noteBSaved.syncedUpdatedAt,
          }),
          expect.anything()
        );
      });
      expect(contentArea()).toHaveValue('B-local-2');
      expect(screen.queryByText('Saved')).not.toBeInTheDocument();

      jest.useRealTimers();
    });

    it('preserves multiple unrelated drafts while still refreshing a clean note', async () => {
      jest.useFakeTimers();

      const noteA0 = makeNote('note-a', 'Note A', 'A0');
      const noteB0 = makeNote('note-b', 'Note B', 'B0');
      const noteC0 = makeNote('note-c', 'Note C', 'C0');
      const noteD0 = makeNote('note-d', 'Note D', 'D0');
      const noteAServer = {
        ...makeNote('note-a', 'Note A remote', 'A-server-new'),
        updatedAt: '2026-07-29T00:00:05.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:05.000Z',
      };
      const noteDServer = {
        ...makeNote('note-d', 'Note D remote', 'D-server-new'),
        updatedAt: '2026-07-29T00:00:04.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:04.000Z',
      };

      let resolveA!: (error: Error) => void;
      const pendingA = new Promise<Note>((_resolve, reject) => {
        resolveA = reject;
      });

      fetchNotesMock
        .mockResolvedValueOnce([noteA0, noteB0, noteC0, noteD0])
        .mockResolvedValue([noteAServer, noteB0, noteC0, noteDServer]);
      updateNoteMock.mockImplementation(input => {
        if (input.id === 'note-a') {
          return pendingA;
        }
        return Promise.resolve(
          makeNote(input.id, input.title ?? 'Untitled', input.content ?? '')
        );
      });

      render(<NotesPage />);
      expect(await screen.findByDisplayValue('Note A')).toBeInTheDocument();

      fireEvent.change(contentArea(), { target: { value: 'A-local' } });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledTimes(1);
      });

      selectNote('Note B');
      fireEvent.change(contentArea(), { target: { value: 'B-local' } });
      selectNote('Note C');
      fireEvent.change(contentArea(), { target: { value: 'C-local' } });

      await act(async () => {
        resolveA(notesConflictError());
        await pendingA.catch(() => undefined);
      });

      expect(await screen.findByText('Note D remote')).toBeInTheDocument();
      expect(screen.getByText('D-server-new')).toBeInTheDocument();

      selectNote('Note B');
      expect(contentArea()).toHaveValue('B-local');
      selectNote('Note C');
      expect(contentArea()).toHaveValue('C-local');
      selectNote('Note D remote');
      expect(contentArea()).toHaveValue('D-server-new');

      jest.useRealTimers();
    });

    it('lets a pending unrelated autosave persist the local draft after a conflict', async () => {
      jest.useFakeTimers();

      const noteA0 = makeNote('note-a', 'Note A', 'A0');
      const noteB0 = makeNote('note-b', 'Note B', 'B0');
      const noteAServer = {
        ...makeNote('note-a', 'Note A remote', 'A-server-new'),
        updatedAt: '2026-07-29T00:00:05.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:05.000Z',
      };

      let resolveA!: (error: Error) => void;
      const pendingA = new Promise<Note>((_resolve, reject) => {
        resolveA = reject;
      });

      fetchNotesMock
        .mockResolvedValueOnce([noteA0, noteB0])
        .mockResolvedValue([noteAServer, noteB0]);
      updateNoteMock.mockImplementation(input => {
        if (input.id === 'note-a') {
          return pendingA;
        }
        return Promise.resolve({
          ...makeNote(input.id, input.title ?? 'Note B', input.content ?? ''),
          updatedAt: '2026-07-29T00:00:02.000Z',
          syncedUpdatedAt: '2026-07-29T00:00:02.000Z',
        });
      });

      render(<NotesPage />);
      expect(await screen.findByDisplayValue('Note A')).toBeInTheDocument();

      fireEvent.change(contentArea(), { target: { value: 'A-local' } });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'note-a', content: 'A-local' }),
          expect.anything()
        );
      });

      selectNote('Note B');
      fireEvent.change(contentArea(), { target: { value: 'B-local' } });

      await act(async () => {
        resolveA(notesConflictError());
        await pendingA.catch(() => undefined);
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /updated elsewhere/i
      );
      expect(contentArea()).toHaveValue('B-local');

      const callsAfterConflict = updateNoteMock.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(updateNoteMock.mock.calls.length).toBeGreaterThan(
          callsAfterConflict
        );
        expect(updateNoteMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'note-b',
            content: 'B-local',
            updated_at: '2026-07-29T00:00:00.000Z',
          }),
          expect.anything()
        );
      });
      expect(
        updateNoteMock.mock.calls.some(call => call[0].content === 'A0')
      ).toBe(false);
      expect(
        updateNoteMock.mock.calls.some(
          call => call[0].content === 'A-server-new'
        )
      ).toBe(false);

      jest.useRealTimers();
    });

    it('does not let a stale conflict refresh revert a successful in-flight B save', async () => {
      jest.useFakeTimers();

      const noteA0 = makeNote('note-a', 'Note A', 'A0');
      const noteB0 = makeNote('note-b', 'Note B', 'B0');
      const noteAServer = {
        ...makeNote('note-a', 'Note A remote', 'A-server-new'),
        updatedAt: '2026-07-29T00:00:05.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:05.000Z',
      };
      const noteBSaved = {
        ...makeNote('note-b', 'Note B', 'B-local'),
        updatedAt: '2026-07-29T00:00:08.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:08.000Z',
      };

      let resolveB!: (note: Note) => void;
      const pendingB = new Promise<Note>(resolve => {
        resolveB = resolve;
      });
      let resolveRefresh!: (notes: Note[]) => void;
      const pendingRefresh = new Promise<Note[]>(resolve => {
        resolveRefresh = resolve;
      });

      fetchNotesMock
        .mockResolvedValueOnce([noteA0, noteB0])
        .mockImplementationOnce(() => pendingRefresh);
      updateNoteMock.mockImplementation(input => {
        if (input.id === 'note-a') {
          return Promise.reject(notesConflictError());
        }
        return pendingB;
      });

      render(<NotesPage />);
      expect(await screen.findByDisplayValue('Note A')).toBeInTheDocument();

      fireEvent.change(contentArea(), { target: { value: 'A-local' } });
      selectNote('Note B');
      fireEvent.change(contentArea(), { target: { value: 'B-local' } });

      act(() => {
        jest.advanceTimersByTime(600);
      });
      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledTimes(2);
      });

      await act(async () => {
        resolveB(noteBSaved);
        await pendingB;
      });

      await waitFor(() => {
        expect(fetchNotesMock).toHaveBeenCalledTimes(2);
      });

      await act(async () => {
        resolveRefresh([noteAServer, noteB0]);
        await pendingRefresh;
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /updated elsewhere/i
      );
      expect(contentArea()).toHaveValue('B-local');
      expect(screen.queryByDisplayValue('B0')).not.toBeInTheDocument();

      jest.useRealTimers();
    });

    it('does not auto-resubmit a conflicted note using only a refreshed CAS token', async () => {
      jest.useFakeTimers();

      const noteA0 = makeNote('note-a', 'Note A', 'A0');
      const noteAServer = {
        ...makeNote('note-a', 'Note A remote', 'A-server-new'),
        updatedAt: '2026-07-29T00:00:05.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:05.000Z',
      };

      fetchNotesMock
        .mockResolvedValueOnce([noteA0])
        .mockResolvedValue([noteAServer]);
      updateNoteMock.mockRejectedValue(notesConflictError());

      render(<NotesPage />);
      fireEvent.change(await screen.findByPlaceholderText(/start writing/i), {
        target: { value: 'A-local' },
      });

      act(() => {
        jest.advanceTimersByTime(600);
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /updated elsewhere/i
      );
      expect(screen.getByDisplayValue('A-server-new')).toBeInTheDocument();
      expect(screen.queryByText('Saved')).not.toBeInTheDocument();

      const saveCallsAfterConflict = updateNoteMock.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(updateNoteMock).toHaveBeenCalledTimes(saveCallsAfterConflict);
      expect(updateNoteMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'note-a',
          content: 'A-local',
          updated_at: noteAServer.syncedUpdatedAt,
        }),
        expect.anything()
      );

      jest.useRealTimers();
    });
  });

  describe('V3-002 mutation recovery', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    const confirmDeleteForTitle = (title: string) => {
      const row = screen.getByText(title).closest('[role="button"]');
      if (!row) {
        throw new Error(`${title} row not found`);
      }
      const deleteButton = row.querySelector(
        'button[aria-label="Delete note"]'
      );
      if (!deleteButton) {
        throw new Error(`Delete button for ${title} not found`);
      }
      fireEvent.click(deleteButton);
      fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    };

    it('restores a clean note without marking it dirty after a failed delete', async () => {
      jest.useFakeTimers();
      fetchNotesMock.mockResolvedValue([makeNote('n1', 'Clean note', 'Hello')]);
      deleteNoteMock.mockRejectedValue(
        new ApiResponseError('Server error', { status: 500 })
      );

      render(<NotesPage />);
      expect(await screen.findByDisplayValue('Clean note')).toBeInTheDocument();

      confirmDeleteForTitle('Clean note');

      expect(await screen.findByDisplayValue('Clean note')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/save failed/i);

      const saveCalls = updateNoteMock.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(updateNoteMock).toHaveBeenCalledTimes(saveCalls);
    });

    it('restores a dirty note draft, dirty flag, and original CAS token after a failed delete', async () => {
      jest.useFakeTimers();
      const noteA = makeNote('note-a', 'Note A', 'A0');
      const noteB = makeNote('note-b', 'Note B', 'B0');
      fetchNotesMock.mockResolvedValue([noteA, noteB]);
      deleteNoteMock.mockRejectedValue(
        new ApiResponseError('Server error', { status: 500 })
      );
      updateNoteMock.mockImplementation(async input =>
        makeNote(input.id, input.title ?? 'Untitled', input.content ?? '')
      );

      render(<NotesPage />);
      fireEvent.change(await screen.findByPlaceholderText(/start writing/i), {
        target: { value: 'A-local-draft' },
      });
      fireEvent.click(screen.getByText('Note B'));
      fireEvent.change(screen.getByPlaceholderText(/start writing/i), {
        target: { value: 'B-local-draft' },
      });

      confirmDeleteForTitle('Note A');

      expect(await screen.findByText('Note A')).toBeInTheDocument();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/save failed/i);
      expect(screen.queryByText('Saved')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Note A'));
      expect(screen.getByPlaceholderText(/start writing/i)).toHaveValue(
        'A-local-draft'
      );
      fireEvent.click(screen.getByText('Note B'));
      expect(screen.getByPlaceholderText(/start writing/i)).toHaveValue(
        'B-local-draft'
      );

      act(() => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'note-a',
            content: 'A-local-draft',
            updated_at: noteA.syncedUpdatedAt,
          }),
          expect.anything()
        );
        expect(updateNoteMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'note-b',
            content: 'B-local-draft',
            updated_at: noteB.syncedUpdatedAt,
          }),
          expect.anything()
        );
      });
    });

    it('cancels a pending autosave after a successful delete', async () => {
      jest.useFakeTimers();
      fetchNotesMock.mockResolvedValue([makeNote('note-a', 'Note A', 'A0')]);
      deleteNoteMock.mockResolvedValue(undefined);

      render(<NotesPage />);
      fireEvent.change(await screen.findByPlaceholderText(/start writing/i), {
        target: { value: 'A-pending' },
      });

      confirmDeleteForTitle('Note A');

      await waitFor(() => {
        expect(deleteNoteMock).toHaveBeenCalledWith('note-a');
      });
      expect(screen.queryByText('Note A')).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(updateNoteMock).not.toHaveBeenCalled();
      expect(screen.queryByText('Note A')).not.toBeInTheDocument();
      expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    });

    it('does not let a late in-flight save resurrect a successfully deleted note', async () => {
      jest.useFakeTimers();
      let resolveSave!: (note: Note) => void;
      const pendingSave = new Promise<Note>(resolve => {
        resolveSave = resolve;
      });

      fetchNotesMock.mockResolvedValue([makeNote('note-a', 'Note A', 'Hello')]);
      updateNoteMock.mockImplementationOnce(() => pendingSave);
      deleteNoteMock.mockResolvedValue(undefined);

      render(<NotesPage />);
      fireEvent.change(await screen.findByPlaceholderText(/start writing/i), {
        target: { value: 'Hello edit' },
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledTimes(1);
      });

      confirmDeleteForTitle('Note A');
      await waitFor(() => {
        expect(deleteNoteMock).toHaveBeenCalledWith('note-a');
      });
      expect(screen.queryByText('Note A')).not.toBeInTheDocument();

      const saveCallsAfterDelete = updateNoteMock.mock.calls.length;
      await act(async () => {
        resolveSave({
          ...makeNote('note-a', 'Note A', 'Hello edit'),
          updatedAt: '2026-07-29T00:00:01.000Z',
          syncedUpdatedAt: '2026-07-29T00:00:01.000Z',
        });
        await pendingSave;
      });

      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(updateNoteMock).toHaveBeenCalledTimes(saveCallsAfterDelete);
      expect(screen.queryByText('Note A')).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue('Hello edit')).not.toBeInTheDocument();
      expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    });

    it('keeps a non-conflict autosave failure dirty and retries the newest draft after a later edit', async () => {
      jest.useFakeTimers();
      let rejectFirst!: (error: Error) => void;
      const firstSave = new Promise<Note>((_resolve, reject) => {
        rejectFirst = reject;
      });

      fetchNotesMock.mockResolvedValue([makeNote('note-b', 'Note B', 'C0')]);
      updateNoteMock
        .mockImplementationOnce(() => firstSave)
        .mockImplementation(async input => ({
          ...makeNote(input.id, input.title ?? 'Note B', input.content ?? ''),
          updatedAt: '2026-07-29T00:00:02.000Z',
          syncedUpdatedAt: '2026-07-29T00:00:02.000Z',
        }));

      render(<NotesPage />);
      fireEvent.change(await screen.findByPlaceholderText(/start writing/i), {
        target: { value: 'C1' },
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        rejectFirst(new Error('network down'));
        await firstSave.catch(() => undefined);
      });

      expect(screen.getByPlaceholderText(/start writing/i)).toHaveValue('C1');
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/save failed/i);
      expect(screen.queryByText('Saved')).not.toBeInTheDocument();

      const callsAfterFailure = updateNoteMock.mock.calls.length;
      act(() => {
        jest.advanceTimersByTime(8000);
      });
      expect(updateNoteMock).toHaveBeenCalledTimes(callsAfterFailure);

      fireEvent.change(screen.getByPlaceholderText(/start writing/i), {
        target: { value: 'C2' },
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'note-b',
            content: 'C2',
            updated_at: '2026-07-29T00:00:00.000Z',
          }),
          expect.anything()
        );
      });
      expect(await screen.findByText('Saved')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/start writing/i)).toHaveValue('C2');
      expect(
        updateNoteMock.mock.calls.filter(call => call[0].content === 'C1')
      ).toHaveLength(1);
    });

    it('does not let an older failed save erase a newer local edit', async () => {
      jest.useFakeTimers();
      let rejectFirst!: (error: Error) => void;
      const firstSave = new Promise<Note>((_resolve, reject) => {
        rejectFirst = reject;
      });

      fetchNotesMock.mockResolvedValue([makeNote('note-b', 'Note B', 'Hello')]);
      updateNoteMock.mockImplementationOnce(() => firstSave);

      render(<NotesPage />);
      fireEvent.change(await screen.findByPlaceholderText(/start writing/i), {
        target: { value: 'C1' },
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      await waitFor(() => {
        expect(updateNoteMock).toHaveBeenCalledTimes(1);
      });

      fireEvent.change(screen.getByPlaceholderText(/start writing/i), {
        target: { value: 'C2' },
      });

      await act(async () => {
        rejectFirst(new Error('save failed'));
        await firstSave.catch(() => undefined);
      });

      expect(screen.getByPlaceholderText(/start writing/i)).toHaveValue('C2');
      expect(screen.queryByDisplayValue('C1')).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue('Hello')).not.toBeInTheDocument();
    });
  });

  describe('H6-002 load error recovery', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('clears a load error after a successful focus refresh', async () => {
      fetchNotesMock
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue([makeNote('n1', 'Recovered note', 'Hello')]);

      render(<NotesPage />);
      expect(
        await screen.findByText(/failed to load notes from the server/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Unable to load notes')).toBeInTheDocument();
      expect(getPrimaryNewNoteButton()).toBeDisabled();

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      expect(await screen.findByText('Recovered note')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
      expect(
        screen.queryByText(/failed to load notes from the server/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Unable to load notes')
      ).not.toBeInTheDocument();
      expect(getPrimaryNewNoteButton()).not.toBeDisabled();
    });

    it('restores the notes UI after a successful visibility refresh', async () => {
      fetchNotesMock
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValue([makeNote('n1', 'Visible again', 'Body')]);

      render(<NotesPage />);
      expect(
        await screen.findByText('Unable to load notes')
      ).toBeInTheDocument();

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(await screen.findByText('Visible again')).toBeInTheDocument();
      expect(
        screen.queryByText(/failed to load notes from the server/i)
      ).not.toBeInTheDocument();
    });

    it('does not let a late failed fetch relatch load error after a newer success', async () => {
      let rejectFirst!: (error: Error) => void;
      let resolveSecond!: (notes: Note[]) => void;
      const firstFetch = new Promise<Note[]>((_resolve, reject) => {
        rejectFirst = reject;
      });
      const secondFetch = new Promise<Note[]>(resolve => {
        resolveSecond = resolve;
      });

      fetchNotesMock
        .mockRejectedValueOnce(new Error('initial down'))
        .mockImplementationOnce(() => firstFetch)
        .mockImplementationOnce(() => secondFetch);

      render(<NotesPage />);
      expect(
        await screen.findByText('Unable to load notes')
      ).toBeInTheDocument();

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => {
        expect(fetchNotesMock).toHaveBeenCalledTimes(3);
      });

      await act(async () => {
        resolveSecond([makeNote('n1', 'Newer collection', 'OK')]);
        await secondFetch;
      });

      expect(await screen.findByText('Newer collection')).toBeInTheDocument();
      expect(
        screen.queryByText(/failed to load notes from the server/i)
      ).not.toBeInTheDocument();

      await act(async () => {
        rejectFirst(new Error('stale failure'));
        await firstFetch.catch(() => undefined);
      });

      expect(screen.getByText('Newer collection')).toBeInTheDocument();
      expect(
        screen.queryByText(/failed to load notes from the server/i)
      ).not.toBeInTheDocument();
      expect(getPrimaryNewNoteButton()).not.toBeDisabled();
    });

    it('does not let a late stale success overwrite a newer collection', async () => {
      let resolveFirst!: (notes: Note[]) => void;
      let resolveSecond!: (notes: Note[]) => void;
      const firstFetch = new Promise<Note[]>(resolve => {
        resolveFirst = resolve;
      });
      const secondFetch = new Promise<Note[]>(resolve => {
        resolveSecond = resolve;
      });

      fetchNotesMock
        .mockRejectedValueOnce(new Error('initial down'))
        .mockImplementationOnce(() => firstFetch)
        .mockImplementationOnce(() => secondFetch);

      render(<NotesPage />);
      expect(
        await screen.findByText('Unable to load notes')
      ).toBeInTheDocument();

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => {
        expect(fetchNotesMock).toHaveBeenCalledTimes(3);
      });

      await act(async () => {
        resolveSecond([makeNote('n2', 'Latest note', 'New')]);
        await secondFetch;
      });
      expect(await screen.findByText('Latest note')).toBeInTheDocument();

      await act(async () => {
        resolveFirst([makeNote('n1', 'Stale note', 'Old')]);
        await firstFetch;
      });

      expect(screen.getByText('Latest note')).toBeInTheDocument();
      expect(screen.queryByText('Stale note')).not.toBeInTheDocument();
    });

    it('preserves an unrelated dirty draft across load-error recovery and still refreshes clean notes', async () => {
      jest.useFakeTimers();
      const noteA = makeNote('note-a', 'Note A', 'A0');
      const noteB = makeNote('note-b', 'Note B', 'B0');
      const noteAServer = {
        ...makeNote('note-a', 'Note A remote', 'A-server-new'),
        updatedAt: '2026-07-29T00:00:05.000Z',
        syncedUpdatedAt: '2026-07-29T00:00:05.000Z',
      };

      fetchNotesMock
        .mockResolvedValueOnce([noteA, noteB])
        .mockRejectedValueOnce(new Error('focus failed'))
        .mockResolvedValue([noteAServer, noteB]);

      render(<NotesPage />);
      expect(await screen.findByDisplayValue('Note A')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Note B'));
      fireEvent.change(screen.getByPlaceholderText(/start writing/i), {
        target: { value: 'B-local' },
      });

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      expect(
        await screen.findByText(/failed to load notes from the server/i)
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/start writing/i)).toHaveValue(
        'B-local'
      );

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => {
        expect(
          screen.queryByText(/failed to load notes from the server/i)
        ).not.toBeInTheDocument();
      });
      expect(await screen.findByText('Note A remote')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/start writing/i)).toHaveValue(
        'B-local'
      );

      fireEvent.click(screen.getByText('Note A remote'));
      expect(screen.getByPlaceholderText(/start writing/i)).toHaveValue(
        'A-server-new'
      );
    });
  });
});
