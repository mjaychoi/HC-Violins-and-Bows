import React, { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@/test-utils/render';
import ItemForm from '../ItemForm';
import { ApiResponseError } from '@/utils/handleApiResponse';
import type { Instrument } from '@/types';
import {
  INSTRUMENT_CONFLICT_CODE,
  INSTRUMENT_CONFLICT_MESSAGE,
  INSTRUMENT_RELOAD_LATEST_LABEL,
} from '../../utils/instrumentConflict';

const T0 = '2024-01-01T00:00:00.000Z';
const T1 = '2024-01-01T00:00:01.000Z';

const itemT0: Instrument = {
  id: 'item-1',
  status: 'Available',
  maker: 'M0',
  type: 'Violin',
  subtype: null,
  year: 2020,
  certificate: false,
  size: null,
  weight: null,
  price: 1000,
  cost_price: 400,
  consignment_price: 800,
  ownership: 'Shelf A',
  note: 'Old',
  serial_number: 'VI0000001',
  created_at: '2023-12-01T00:00:00.000Z',
  updated_at: T0,
};

const itemT1: Instrument = {
  ...itemT0,
  ownership: 'Shelf B',
  cost_price: 450,
  updated_at: T1,
};

type CapturedPayload = Omit<Instrument, 'id' | 'created_at'> & {
  updated_at?: string | null;
};

function TokenHarness({
  captured,
  selectedItem = itemT0,
  initialInstruments = [itemT0],
}: {
  captured: CapturedPayload[];
  selectedItem?: Instrument;
  initialInstruments?: Instrument[];
}) {
  const instrumentsRef = useRef(initialInstruments);
  const [instruments, setInstruments] = useState(initialInstruments);

  return (
    <ItemForm
      isOpen
      isEditing
      selectedItem={selectedItem}
      instruments={instruments}
      existingSerialNumbers={[itemT0.serial_number as string]}
      submitting={false}
      onClose={jest.fn()}
      onSubmit={async formData => {
        const cached = instrumentsRef.current.find(
          instrument => instrument.id === selectedItem.id
        );
        const payload: CapturedPayload = {
          ...formData,
          updated_at: Object.prototype.hasOwnProperty.call(
            formData,
            'updated_at'
          )
            ? formData.updated_at
            : cached?.updated_at,
        };
        captured.push(payload);

        if (payload.updated_at === T0) {
          instrumentsRef.current = [itemT1];
          setInstruments([itemT1]);
          throw new ApiResponseError(INSTRUMENT_CONFLICT_MESSAGE, {
            status: 409,
            error_code: INSTRUMENT_CONFLICT_CODE,
          });
        }

        return {
          ...itemT1,
          ...formData,
          id: selectedItem.id,
          created_at: selectedItem.created_at,
          updated_at: T1,
        };
      }}
    />
  );
}

async function editNoteAndSave(note: string) {
  const noteField = await screen.findByPlaceholderText(
    'Enter any additional notes'
  );
  fireEvent.change(noteField, { target: { value: note } });
  fireEvent.click(screen.getByRole('button', { name: 'Update Item' }));
}

describe('ItemForm stale conflict recovery', () => {
  it('TEST-4/7/8/13/35: save-again keeps T0 and cannot apply stale ownership with T1', async () => {
    const captured: CapturedPayload[] = [];
    render(<TokenHarness captured={captured} />);

    expect(await screen.findByDisplayValue('Shelf A')).toBeInTheDocument();
    await editNoteAndSave('A note');

    expect(
      await screen.findByTestId('item-conflict-banner')
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Enter any additional notes')
    ).toHaveValue('A note');
    expect(screen.getByPlaceholderText('Enter ownership info')).toHaveValue(
      'Shelf A'
    );
    expect(screen.queryByText(/Item created successfully/i)).toBeNull();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual(
      expect.objectContaining({
        ownership: 'Shelf A',
        note: 'A note',
        cost_price: 400,
        updated_at: T0,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Update Item' }));

    await waitFor(() => {
      expect(captured).toHaveLength(2);
    });

    expect(captured[1]).toEqual(
      expect.objectContaining({
        ownership: 'Shelf A',
        note: 'A note',
        cost_price: 400,
        updated_at: T0,
      })
    );
    expect(captured[1].updated_at).not.toBe(T1);
    expect(captured[1].ownership).not.toBe('Shelf B');
    expect(screen.getByTestId('item-conflict-banner')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: INSTRUMENT_RELOAD_LATEST_LABEL })
    ).toBeInTheDocument();
  });

  it('TEST-9: background collection refresh cannot upgrade a dirty draft token', async () => {
    const captured: CapturedPayload[] = [];
    const { rerender } = render(
      <ItemForm
        isOpen
        isEditing
        selectedItem={itemT0}
        instruments={[itemT0]}
        existingSerialNumbers={[itemT0.serial_number as string]}
        submitting={false}
        onClose={jest.fn()}
        onSubmit={async formData => {
          captured.push(formData);
          throw new ApiResponseError(INSTRUMENT_CONFLICT_MESSAGE, {
            status: 409,
            error_code: INSTRUMENT_CONFLICT_CODE,
          });
        }}
      />
    );

    const noteField = await screen.findByPlaceholderText(
      'Enter any additional notes'
    );
    fireEvent.change(noteField, { target: { value: 'A note' } });

    rerender(
      <ItemForm
        isOpen
        isEditing
        selectedItem={itemT0}
        instruments={[itemT1]}
        existingSerialNumbers={[itemT0.serial_number as string]}
        submitting={false}
        onClose={jest.fn()}
        onSubmit={async formData => {
          captured.push(formData);
          throw new ApiResponseError(INSTRUMENT_CONFLICT_MESSAGE, {
            status: 409,
            error_code: INSTRUMENT_CONFLICT_CODE,
          });
        }}
      />
    );

    expect(screen.getByPlaceholderText('Enter ownership info')).toHaveValue(
      'Shelf A'
    );
    expect(
      screen.getByPlaceholderText('Enter any additional notes')
    ).toHaveValue('A note');

    fireEvent.click(screen.getByRole('button', { name: 'Update Item' }));

    await waitFor(() => {
      expect(captured).toHaveLength(1);
    });
    expect(captured[0]).toEqual(
      expect.objectContaining({
        ownership: 'Shelf A',
        note: 'A note',
        updated_at: T0,
      })
    );
  });

  it('TEST-10/19/20: a later collection T1 must not erase a newer local edit', async () => {
    const captured: CapturedPayload[] = [];
    const { rerender } = render(<TokenHarness captured={captured} />);

    await editNoteAndSave('A note');
    expect(
      await screen.findByTestId('item-conflict-banner')
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText('Enter any additional notes'),
      { target: { value: 'A note plus more' } }
    );

    rerender(
      <TokenHarness captured={captured} initialInstruments={[itemT1]} />
    );

    expect(
      screen.getByPlaceholderText('Enter any additional notes')
    ).toHaveValue('A note plus more');
    expect(screen.getByPlaceholderText('Enter ownership info')).toHaveValue(
      'Shelf A'
    );
  });

  it('TEST-11/12: explicit reload replaces fields and token together, then a new save can succeed', async () => {
    const captured: CapturedPayload[] = [];
    render(<TokenHarness captured={captured} />);

    await editNoteAndSave('A note');
    expect(
      await screen.findByRole('button', {
        name: INSTRUMENT_RELOAD_LATEST_LABEL,
      })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: INSTRUMENT_RELOAD_LATEST_LABEL })
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter ownership info')).toHaveValue(
        'Shelf B'
      );
    });
    expect(
      screen.getByPlaceholderText('Enter any additional notes')
    ).toHaveValue('Old');
    expect(screen.queryByTestId('item-conflict-banner')).toBeNull();

    fireEvent.change(
      screen.getByPlaceholderText('Enter any additional notes'),
      { target: { value: 'Reviewed note' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update Item' }));

    await waitFor(() => {
      expect(captured).toHaveLength(2);
    });
    expect(captured[1]).toEqual(
      expect.objectContaining({
        ownership: 'Shelf B',
        note: 'Reviewed note',
        cost_price: 450,
        updated_at: T1,
      })
    );
  });

  it('TEST-18: network errors do not upgrade the draft token or show reload', async () => {
    const captured: CapturedPayload[] = [];
    render(
      <ItemForm
        isOpen
        isEditing
        selectedItem={itemT0}
        instruments={[itemT1]}
        existingSerialNumbers={[itemT0.serial_number as string]}
        submitting={false}
        onClose={jest.fn()}
        onSubmit={async formData => {
          captured.push(formData);
          throw new Error('Network error');
        }}
      />
    );

    await editNoteAndSave('A note');

    expect(await screen.findByText('Network error')).toBeInTheDocument();
    expect(screen.queryByTestId('item-conflict-banner')).toBeNull();
    expect(
      screen.queryByRole('button', { name: INSTRUMENT_RELOAD_LATEST_LABEL })
    ).toBeNull();
    expect(captured[0]?.updated_at).toBe(T0);

    fireEvent.click(screen.getByRole('button', { name: 'Update Item' }));
    await waitFor(() => {
      expect(captured).toHaveLength(2);
    });
    expect(captured[1]?.updated_at).toBe(T0);
  });
});
