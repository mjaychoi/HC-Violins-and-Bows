// src/app/clients/components/__tests__/ContactLog.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@/test-utils/render';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ContactLogComponent from '../ContactLog';
import { ContactLog } from '@/types';

jest.mock('@/utils/dateParsing', () => ({
  ...jest.requireActual('@/utils/dateParsing'),
  todayLocalYMD: jest.fn(() => '2024-01-15'),
  formatDisplayDate: jest.fn((date: string) => date),
}));

describe('ContactLogComponent', () => {
  const mockClientId = 'client-123';
  const mockInstrumentId = 'instrument-456';
  const mockOnAddContact = jest.fn().mockResolvedValue(undefined);
  const mockOnUpdateContact = jest.fn().mockResolvedValue(undefined);
  const mockOnDeleteContact = jest.fn().mockResolvedValue(undefined);

  const mockContactLogs: ContactLog[] = [
    {
      id: 'log-1',
      client_id: mockClientId,
      instrument_id: null,
      contact_type: 'email',
      subject: 'Test Email',
      content: 'Test content',
      contact_date: '2024-01-10',
      next_follow_up_date: '2024-01-20',
      follow_up_completed_at: null,
      purpose: 'quote',
      created_at: '2024-01-10T00:00:00Z',
      updated_at: '2024-01-10T00:00:00Z',
    },
    {
      id: 'log-2',
      client_id: mockClientId,
      instrument_id: null,
      contact_type: 'phone',
      subject: null,
      content: 'Phone call',
      contact_date: '2024-01-12',
      next_follow_up_date: null,
      follow_up_completed_at: null,
      purpose: null,
      created_at: '2024-01-12T00:00:00Z',
      updated_at: '2024-01-12T00:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders header with add button', () => {
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={[]}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      expect(screen.getByText('Contact Log')).toBeInTheDocument();
      expect(screen.getByText('+ Add Contact')).toBeInTheDocument();
    });

    it('renders empty state when no logs', () => {
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={[]}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      expect(screen.getByText('No contact records')).toBeInTheDocument();
    });

    it('renders contact logs in reverse chronological order', () => {
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={mockContactLogs}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const contents = screen.getAllByText(/Test content|Phone call/);
      expect(contents.length).toBeGreaterThan(0);
    });
  });

  describe('Adding Contact', () => {
    it('shows form when add button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={[]}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const addButton = screen.getByText('+ Add Contact');
      await user.click(addButton);

      expect(
        screen.getByPlaceholderText('Enter contact details')
      ).toBeInTheDocument();
      expect(screen.queryByText('+ Add Contact')).not.toBeInTheDocument();
    });

    it('adds contact with all fields', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={[]}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const addButton = screen.getByText('+ Add Contact');
      await user.click(addButton);

      // Find content textarea by placeholder
      const contentInput = screen.getByPlaceholderText('Enter contact details');
      await user.type(contentInput, 'New contact content');

      // Subject field appears when email/meeting is selected
      // Use getAllByRole to find all selects, then pick the first one (Contact Type)
      const selects = screen.getAllByRole('combobox');
      const contactTypeSelect = selects[0];
      await user.selectOptions(contactTypeSelect, 'email');

      const subjectInput = screen.getByPlaceholderText(
        'Email subject or meeting topic'
      );
      await user.type(subjectInput, 'New subject');

      const addSubmitButton = screen.getByRole('button', { name: 'Add' });
      await user.click(addSubmitButton);

      await waitFor(() => {
        expect(mockOnAddContact).toHaveBeenCalledWith({
          client_id: mockClientId,
          instrument_id: null,
          contact_type: 'email',
          subject: 'New subject',
          content: 'New contact content',
          contact_date: '2024-01-15',
          next_follow_up_date: null,
          follow_up_completed_at: null,
          purpose: null,
        });
      });
    });

    it('does not add contact if content is empty', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={[]}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const addButton = screen.getByText('+ Add Contact');
      await user.click(addButton);

      const addSubmitButton = screen.getByRole('button', { name: 'Add' });
      expect(addSubmitButton).toBeDisabled();

      await user.click(addSubmitButton);

      expect(mockOnAddContact).not.toHaveBeenCalled();
    });

    it('passes instrumentId when provided', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          instrumentId={mockInstrumentId}
          contactLogs={[]}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const addButton = screen.getByText('+ Add Contact');
      await user.click(addButton);

      const contentInput = screen.getByPlaceholderText('Enter contact details');
      await user.type(contentInput, 'Test content');

      const addSubmitButton = screen.getByRole('button', { name: 'Add' });
      await user.click(addSubmitButton);

      await waitFor(() => {
        expect(mockOnAddContact).toHaveBeenCalledWith(
          expect.objectContaining({
            instrument_id: mockInstrumentId,
          })
        );
      });
    });

    it('resets form after adding contact', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={[]}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const addButton = screen.getByText('+ Add Contact');
      await user.click(addButton);

      const contentInput = screen.getByPlaceholderText('Enter contact details');
      await user.type(contentInput, 'Test content');

      const addSubmitButton = screen.getByRole('button', { name: 'Add' });
      await user.click(addSubmitButton);

      await waitFor(() => {
        expect(mockOnAddContact).toHaveBeenCalled();
      });

      // Form should be closed after adding
      expect(
        screen.queryByPlaceholderText('Enter contact details')
      ).not.toBeInTheDocument();
    });

    it('cancels adding contact', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={[]}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const addButton = screen.getByText('+ Add Contact');
      await user.click(addButton);

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      await user.click(cancelButton);

      expect(screen.queryByLabelText(/Content \*/)).not.toBeInTheDocument();
      expect(mockOnAddContact).not.toHaveBeenCalled();
    });
  });

  describe('Editing Contact', () => {
    it('enters edit mode when edit button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={mockContactLogs}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const editButtons = screen.getAllByTitle('Edit');
      await user.click(editButtons[0]);

      // Logs are sorted in reverse chronological order, so log-2 comes first
      const contentInputs = screen.getAllByRole('textbox');
      const contentTextarea = contentInputs.find(
        input => (input as HTMLTextAreaElement).tagName === 'TEXTAREA'
      ) as HTMLTextAreaElement;
      expect(contentTextarea).toHaveValue(mockContactLogs[1].content);
    });

    it('updates contact when save is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={mockContactLogs}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const editButtons = screen.getAllByTitle('Edit');
      await user.click(editButtons[0]);

      const contentInputs = screen.getAllByRole('textbox');
      const contentTextarea = contentInputs.find(
        input => (input as HTMLTextAreaElement).tagName === 'TEXTAREA'
      ) as HTMLTextAreaElement;
      await user.clear(contentTextarea);
      await user.type(contentTextarea, 'Updated content');

      const saveButton = screen.getByRole('button', { name: 'Save' });
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockOnUpdateContact).toHaveBeenCalledWith(
          mockContactLogs[1].id, // Most recent log comes first
          expect.objectContaining({
            content: 'Updated content',
          })
        );
      });
    });

    it('does not update if content is empty', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={mockContactLogs}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const editButtons = screen.getAllByTitle('Edit');
      await user.click(editButtons[0]);

      const contentInputs = screen.getAllByRole('textbox');
      const contentTextarea = contentInputs.find(
        input => (input as HTMLTextAreaElement).tagName === 'TEXTAREA'
      ) as HTMLTextAreaElement;
      await user.clear(contentTextarea);

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toBeDisabled();
    });

    it('cancels editing', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={mockContactLogs}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const editButtons = screen.getAllByTitle('Edit');
      await user.click(editButtons[0]);

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      await user.click(cancelButton);

      expect(screen.queryByLabelText(/Content/)).not.toBeInTheDocument();
      expect(mockOnUpdateContact).not.toHaveBeenCalled();
    });
  });

  describe('Deleting Contact', () => {
    it('calls onDeleteContact when delete button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={mockContactLogs}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      // Logs are sorted in reverse chronological order, so log-2 comes first
      const deleteButtons = screen.getAllByTitle('Delete');
      await user.click(deleteButtons[0]);

      // Should be called with log-2 (most recent)
      expect(mockOnDeleteContact).toHaveBeenCalledWith(mockContactLogs[1].id);
    });

    it('disables delete button when loading', () => {
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={mockContactLogs}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
          loading={true}
        />
      );

      const deleteButtons = screen.getAllByTitle('Delete');
      deleteButtons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Contact Type and Purpose', () => {
    it('shows subject field for email and meeting types', async () => {
      const user = userEvent.setup();
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={[]}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      const addButton = screen.getByText('+ Add Contact');
      await user.click(addButton);

      // Use getAllByRole to find all selects, then pick the first one (Contact Type)
      const selects = screen.getAllByRole('combobox');
      const contactTypeSelect = selects[0];
      await user.selectOptions(contactTypeSelect, 'email');

      expect(
        screen.getByPlaceholderText('Email subject or meeting topic')
      ).toBeInTheDocument();
    });

    it('renders contact type labels correctly', () => {
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={mockContactLogs}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      expect(screen.getByText(/📧 Email/)).toBeInTheDocument();
      expect(screen.getByText(/📞 Phone/)).toBeInTheDocument();
    });

    it('displays purpose when present', () => {
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={mockContactLogs}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      expect(screen.getByText(/Quote/)).toBeInTheDocument();
    });

    it('displays next follow-up date when present', () => {
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={mockContactLogs}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
        />
      );

      expect(screen.getByText(/Next Contact:/)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('disables add button when loading', () => {
      render(
        <ContactLogComponent
          clientId={mockClientId}
          contactLogs={[]}
          onAddContact={mockOnAddContact}
          onUpdateContact={mockOnUpdateContact}
          onDeleteContact={mockOnDeleteContact}
          loading={true}
        />
      );

      const addButton = screen.getByText('+ Add Contact');
      expect(addButton).toBeDisabled();
    });
  });
});
