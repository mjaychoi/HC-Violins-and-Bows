import path from 'path';

export const DEFAULT_E2E_ORG_ID = '00000000-0000-4000-8000-0000000000e2';

export const ADMIN_AUTH_STATE_PATH = path.join(__dirname, '.auth', 'user.json');

export const MEMBER_AUTH_STATE_PATH = path.join(
  __dirname,
  '.auth',
  'member.json'
);

export type E2EIdentity = {
  email: string;
  password: string;
  orgId: string;
  role: 'admin' | 'member';
};

export function getE2EOrgId(): string {
  return process.env.E2E_TEST_ORG_ID?.trim() || DEFAULT_E2E_ORG_ID;
}

export function getE2EAdminIdentity(): E2EIdentity {
  return {
    email: process.env.E2E_TEST_EMAIL?.trim() || 'test@test.com',
    password: process.env.E2E_TEST_PASSWORD || 'test123',
    orgId: getE2EOrgId(),
    role: 'admin',
  };
}

export function getE2EMemberIdentity(): E2EIdentity {
  return {
    email: process.env.E2E_TEST_MEMBER_EMAIL?.trim() || 'e2e-member@test.com',
    password: process.env.E2E_TEST_MEMBER_PASSWORD || 'test123',
    orgId: getE2EOrgId(),
    role: 'member',
  };
}
