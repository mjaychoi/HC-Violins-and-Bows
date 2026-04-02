import { NextRequest, NextResponse } from 'next/server';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';
import { validateInstrumentStatusTransition } from '@/app/api/_utils/stateTransitions';
import { validateUUID } from '@/utils/inputValidation';
import { validatePartialInstrument, safeValidate } from '@/utils/typeGuards';
import { errorHandler } from '@/utils/errorHandler';
import type { Instrument } from '@/types';

function buildReservedStateUpdate(
  currentStatus: Instrument['status'],
  currentReservedReason: string | null,
  currentReservedByUserId: string | null,
  currentReservedConnectionId: string | null,
  nextUpdates: Partial<Instrument>,
  userId: string
): { update: Partial<Instrument>; error?: string } {
  const update = { ...nextUpdates };
  const nextStatus = nextUpdates.status;
  const hasReservedReasonPatch = Object.prototype.hasOwnProperty.call(
    nextUpdates,
    'reserved_reason'
  );
  const nextReservedReason = nextUpdates.reserved_reason;

  if (nextStatus === 'Reserved') {
    const normalizedReason =
      typeof nextReservedReason === 'string'
        ? nextReservedReason.trim()
        : currentStatus === 'Reserved'
          ? (currentReservedReason ?? '').trim()
          : '';

    if (!normalizedReason) {
      return {
        update,
        error: 'Reserved status requires a reserved_reason.',
      };
    }

    update.reserved_reason = normalizedReason;
    update.reserved_by_user_id = userId;
    update.reserved_connection_id = null;
    return { update };
  }

  if (hasReservedReasonPatch) {
    if (currentStatus !== 'Reserved' && nextStatus === undefined) {
      return {
        update,
        error:
          'reserved_reason can only be changed while the instrument is Reserved.',
      };
    }

    const normalizedReason =
      typeof nextReservedReason === 'string' ? nextReservedReason.trim() : '';
    if (!normalizedReason) {
      return {
        update,
        error: 'Reserved status requires a reserved_reason.',
      };
    }

    update.reserved_reason = normalizedReason;
    update.reserved_by_user_id = userId;
    update.reserved_connection_id = null;
    return { update };
  }

  if (
    nextStatus === 'Available' ||
    nextStatus === 'Maintenance' ||
    nextStatus === 'Sold'
  ) {
    update.reserved_reason = null;
    update.reserved_by_user_id = null;
    update.reserved_connection_id = null;
    return { update };
  }

  if (currentStatus === 'Reserved' && nextStatus === 'Booked') {
    update.reserved_reason = currentReservedReason;
    update.reserved_by_user_id = currentReservedByUserId;
    update.reserved_connection_id = currentReservedConnectionId;
  }

  return { update };
}

async function patchHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  const orgContextError = requireOrgContext(auth);
  if (orgContextError) {
    return orgContextError;
  }

  const adminError = requireAdmin(auth);
  if (adminError) {
    return adminError;
  }

  if (!validateUUID(id)) {
    return NextResponse.json(
      { error: 'Invalid instrument ID format' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const validationResult = safeValidate(body, validatePartialInstrument);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: `Invalid update data: ${validationResult.error}` },
      { status: 400 }
    );
  }

  if (validationResult.data.status !== undefined) {
    const { data: currentInstrument, error: currentInstrumentError } =
      await auth.userSupabase
        .from('instruments')
        .select(
          'status, reserved_reason, reserved_by_user_id, reserved_connection_id'
        )
        .eq('id', id)
        .single();

    if (currentInstrumentError || !currentInstrument) {
      throw errorHandler.handleSupabaseError(
        currentInstrumentError,
        'Fetch instrument state'
      );
    }

    if (
      currentInstrument.status === 'Sold' &&
      validationResult.data.status !== 'Sold'
    ) {
      return NextResponse.json(
        { error: 'Sold instruments cannot be moved to another status.' },
        { status: 409 }
      );
    }

    if (
      currentInstrument.status !== 'Sold' &&
      validationResult.data.status === 'Sold'
    ) {
      return NextResponse.json(
        {
          error:
            'Instrument status cannot be set to Sold directly. Use the sales API.',
        },
        { status: 409 }
      );
    }

    const transitionError = validateInstrumentStatusTransition(
      currentInstrument.status,
      validationResult.data.status
    );
    if (transitionError) {
      return NextResponse.json({ error: transitionError }, { status: 409 });
    }

    const reservedStateResult = buildReservedStateUpdate(
      currentInstrument.status,
      currentInstrument.reserved_reason,
      currentInstrument.reserved_by_user_id,
      currentInstrument.reserved_connection_id,
      validationResult.data,
      auth.user.id
    );

    if (reservedStateResult.error) {
      return NextResponse.json(
        { error: reservedStateResult.error },
        { status: 400 }
      );
    }

    validationResult.data = reservedStateResult.update;
  } else if (
    Object.prototype.hasOwnProperty.call(
      validationResult.data,
      'reserved_reason'
    )
  ) {
    const { data: currentInstrument, error: currentInstrumentError } =
      await auth.userSupabase
        .from('instruments')
        .select(
          'status, reserved_reason, reserved_by_user_id, reserved_connection_id'
        )
        .eq('id', id)
        .single();

    if (currentInstrumentError || !currentInstrument) {
      throw errorHandler.handleSupabaseError(
        currentInstrumentError,
        'Fetch instrument state'
      );
    }

    const reservedStateResult = buildReservedStateUpdate(
      currentInstrument.status,
      currentInstrument.reserved_reason,
      currentInstrument.reserved_by_user_id,
      currentInstrument.reserved_connection_id,
      validationResult.data,
      auth.user.id
    );

    if (reservedStateResult.error) {
      return NextResponse.json(
        { error: reservedStateResult.error },
        { status: 400 }
      );
    }

    validationResult.data = reservedStateResult.update;
  }

  const { data, error } = await auth.userSupabase
    .from('instruments')
    .update(validationResult.data)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update instrument' },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const p: unknown = context.params;
  const params =
    typeof (p as { then?: unknown })?.then === 'function'
      ? await (p as Promise<{ id: string }>)
      : (p as { id: string });

  const { id } = params;

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return patchHandlerInternal(req, auth, id);
    })
  );

  return handler(request);
}
