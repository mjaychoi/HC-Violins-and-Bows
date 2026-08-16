/** @jest-environment node */

import {
  AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE,
  AUTH_MATRIX_ORG_A_COST_PRICE,
  AUTH_MATRIX_ORG_A_ID,
} from '../constants';
import {
  createHostedRuntimeIds,
  generateAuthMatrixPassword,
} from '../hosted-fixtures';

describe('hosted fixtures', () => {
  it('generates unique runtime identifiers instead of the local fixed IDs', () => {
    const first = createHostedRuntimeIds('runaaaaaaaaaaaaaaaaaaaa');
    const second = createHostedRuntimeIds('runbbbbbbbbbbbbbbbbbbbb');

    expect(first.orgAId).not.toBe(AUTH_MATRIX_ORG_A_ID);
    expect(first.orgAId).not.toBe(second.orgAId);
    expect(first.orgAName).toMatch(/^AUTH_MATRIX_runaaaaaaaaaaaaaaaaaaaa/);
    expect(first.emails.orgAAdmin).toContain('runaaaaaaaaaaaaaaaaaaaa');
    expect(first.orgASerial).toContain('AUTH_MATRIX_');
    expect(second.emails.orgAAdmin).not.toBe(first.emails.orgAAdmin);
  });

  it('generates ephemeral passwords that are not empty', () => {
    const first = generateAuthMatrixPassword();
    const second = generateAuthMatrixPassword();
    expect(first.length).toBeGreaterThan(20);
    expect(second).not.toBe(first);
  });

  it('keeps known financial fixture values for admin/member assertions', () => {
    expect(AUTH_MATRIX_ORG_A_COST_PRICE).toBeGreaterThan(0);
    expect(AUTH_MATRIX_ORG_A_CONSIGNMENT_PRICE).toBeGreaterThan(
      AUTH_MATRIX_ORG_A_COST_PRICE
    );
  });
});
