/**
 * Local-only deterministic fixture identities for `seed-fixtures.ts`.
 * Hosted CI must generate unique runtime IDs — never reuse these.
 * These values are not secrets.
 */

export const AUTH_MATRIX_ORG_A_ID = '11111111-1111-4111-8111-111111111111';
export const AUTH_MATRIX_ORG_B_ID = '22222222-2222-4222-8222-222222222222';

export const AUTH_MATRIX_ORG_A_SERIAL = 'MX-A-001';
export const AUTH_MATRIX_ORG_B_SERIAL = 'MX-B-001';

export const AUTH_MATRIX_ORG_A_CLIENT_NUMBER = 'CL901';
export const AUTH_MATRIX_ORG_B_CLIENT_NUMBER = 'CL902';

export const AUTH_MATRIX_ORG_A_COST_PRICE = 11111.11;
export const AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE = 22222.22;
export const AUTH_MATRIX_ORG_B_COST_PRICE = 33333.33;
export const AUTH_MATRIX_ORG_B_CONSIGNMENT_PRICE = 44444.44;

export type AuthMatrixRole = 'admin' | 'member';

export type AuthMatrixActor =
  | 'orgAAdmin'
  | 'orgAMember'
  | 'orgBAdmin'
  | 'orgBMember';

export const AUTH_MATRIX_ACTORS: readonly AuthMatrixActor[] = [
  'orgAAdmin',
  'orgAMember',
  'orgBAdmin',
  'orgBMember',
] as const;

export function actorDisplayLabel(
  actor: AuthMatrixActor | 'anonymous'
): string {
  if (actor === 'anonymous') return 'anonymous';
  if (actor === 'orgAAdmin') return 'orgA-admin';
  if (actor === 'orgAMember') return 'orgA-member';
  if (actor === 'orgBAdmin') return 'orgB-admin';
  return 'orgB-member';
}
