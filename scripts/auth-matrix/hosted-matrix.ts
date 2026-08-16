import {
  AUTH_MATRIX_ACTORS,
  actorDisplayLabel,
  type AuthMatrixActor,
} from './constants';
import type { HostedActor } from './hosted-session';
import { buildHostedRequestHeaders } from './hosted-session';
import {
  boundSafeText,
  redactSensitiveText,
  safeErrorMessage,
} from './secret-redact';

export type HostedMatrixFixtures = {
  orgAId: string;
  orgBId: string;
  orgAInstrumentId: string;
  orgBInstrumentId: string;
  orgAClientId: string;
  orgBClientId: string;
  orgACostPrice: number;
  orgAConsignmentPrice: number;
};

export type MatrixFailureReport = {
  actor: string;
  method: string;
  route: string;
  expectedStatus: number;
  actualStatus: number | null;
  errorCode?: string;
  errorMessage?: string;
};

export type MatrixCaseResult = {
  name: string;
  ok: boolean;
  report: MatrixFailureReport;
};

export type HostedCookieJar = Record<AuthMatrixActor, HostedActor>;

type MatrixCase = {
  name: string;
  actor: AuthMatrixActor | 'anonymous';
  method: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: string;
  expectedStatus: number;
  assert?: (body: unknown) => string | null;
};

function asRecord(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function instrumentRows(body: unknown): Record<string, unknown>[] {
  const record = asRecord(body);
  const data = record?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === 'object' && !Array.isArray(row)
  );
}

function findInstrument(
  body: unknown,
  instrumentId: string
): Record<string, unknown> | null {
  return instrumentRows(body).find(row => row.id === instrumentId) ?? null;
}

function safeBodyFields(body: unknown): {
  errorCode?: string;
  errorMessage?: string;
} {
  const record = asRecord(body);
  if (!record) return {};
  const errorCode =
    typeof record.error_code === 'string'
      ? boundSafeText(record.error_code)
      : undefined;
  const errorMessage =
    boundSafeText(record.message) ?? boundSafeText(record.error);
  return { errorCode, errorMessage };
}

function numbersEqual(actual: unknown, expected: number): boolean {
  return typeof actual === 'number' && Number(actual) === expected;
}

export function buildHostedMatrixCases(
  fixtures: HostedMatrixFixtures
): MatrixCase[] {
  const memberCreateBody = JSON.stringify({
    maker: 'Denied',
    type: 'Violin',
    status: 'Available',
  });
  const memberClientBody = JSON.stringify({
    first_name: 'Denied',
    last_name: 'Member',
    name: 'Denied Member',
    links: [],
  });

  return [
    {
      name: 'anonymous instrument list is unauthorized',
      actor: 'anonymous',
      method: 'GET',
      path: '/api/instruments',
      expectedStatus: 401,
      assert: body => {
        const record = asRecord(body);
        if (record?.error_code && record.error_code !== 'UNAUTHORIZED') {
          return `expected error_code UNAUTHORIZED, received ${String(record.error_code)}`;
        }
        if (record?.data ?? record?.success) {
          return 'anonymous response disclosed data or success';
        }
        return null;
      },
    },
    {
      name: 'orgA member same-org instrument list',
      actor: 'orgAMember',
      method: 'GET',
      path: '/api/instruments?all=true',
      expectedStatus: 200,
      assert: body => {
        const rows = instrumentRows(body);
        if (rows.some(row => row.org_id && row.org_id !== fixtures.orgAId)) {
          return 'member list included a row from another org';
        }
        return null;
      },
    },
    {
      name: 'orgA member financial redaction on synthetic instrument',
      actor: 'orgAMember',
      method: 'GET',
      path: `/api/instruments?id=${fixtures.orgAInstrumentId}`,
      expectedStatus: 200,
      assert: body => {
        const row = findInstrument(body, fixtures.orgAInstrumentId);
        if (!row) {
          return 'synthetic Org A instrument missing from member response';
        }
        if (row.org_id && row.org_id !== fixtures.orgAId) {
          return 'member response org_id did not match Org A';
        }
        if ('cost_price' in row || 'consignment_price' in row) {
          return 'member response exposed financial fields';
        }
        return null;
      },
    },
    {
      name: 'orgA member instrument create denied',
      actor: 'orgAMember',
      method: 'POST',
      path: '/api/instruments',
      headers: { 'Content-Type': 'application/json' },
      body: memberCreateBody,
      expectedStatus: 403,
    },
    {
      name: 'orgA member with-connections denied',
      actor: 'orgAMember',
      method: 'POST',
      path: '/api/clients/with-connections',
      headers: { 'Content-Type': 'application/json' },
      body: memberClientBody,
      expectedStatus: 403,
    },
    {
      name: 'orgA member certificate mutation denied',
      actor: 'orgAMember',
      method: 'POST',
      path: `/api/instruments/${fixtures.orgAInstrumentId}/certificates`,
      expectedStatus: 403,
    },
    {
      name: 'orgA admin same-org instrument list',
      actor: 'orgAAdmin',
      method: 'GET',
      path: '/api/instruments?all=true',
      expectedStatus: 200,
      assert: body => {
        const rows = instrumentRows(body);
        if (rows.some(row => row.org_id && row.org_id !== fixtures.orgAId)) {
          return 'admin list included a row from another org';
        }
        if (!findInstrument(body, fixtures.orgAInstrumentId)) {
          return 'synthetic Org A instrument missing from admin list';
        }
        return null;
      },
    },
    {
      name: 'orgA admin financial access on synthetic instrument',
      actor: 'orgAAdmin',
      method: 'GET',
      path: `/api/instruments?id=${fixtures.orgAInstrumentId}`,
      expectedStatus: 200,
      assert: body => {
        const row = findInstrument(body, fixtures.orgAInstrumentId);
        if (!row) {
          return 'synthetic Org A instrument missing from admin response';
        }
        if (!numbersEqual(row.cost_price, fixtures.orgACostPrice)) {
          return 'admin response missing expected cost_price';
        }
        if (
          !numbersEqual(row.consignment_price, fixtures.orgAConsignmentPrice)
        ) {
          return 'admin response missing expected consignment_price';
        }
        return null;
      },
    },
    {
      name: 'orgA admin cannot read Org B instrument',
      actor: 'orgAAdmin',
      method: 'GET',
      path: `/api/instruments?id=${fixtures.orgBInstrumentId}`,
      expectedStatus: 404,
    },
    {
      name: 'orgB admin cannot read Org A instrument',
      actor: 'orgBAdmin',
      method: 'GET',
      path: `/api/instruments?id=${fixtures.orgAInstrumentId}`,
      expectedStatus: 404,
    },
    {
      name: 'orgA admin cannot read Org B client',
      actor: 'orgAAdmin',
      method: 'GET',
      path: `/api/clients?id=${fixtures.orgBClientId}`,
      expectedStatus: 404,
    },
    {
      name: 'orgB admin cannot read Org A client',
      actor: 'orgBAdmin',
      method: 'GET',
      path: `/api/clients?id=${fixtures.orgAClientId}`,
      expectedStatus: 404,
    },
  ];
}

export function formatMatrixFailure(report: MatrixFailureReport): string {
  const parts = [
    `actor=${report.actor}`,
    `method=${report.method}`,
    `route=${report.route}`,
    `expected=${report.expectedStatus}`,
    `actual=${report.actualStatus ?? 'n/a'}`,
  ];
  if (report.errorCode) {
    parts.push(`error_code=${report.errorCode}`);
  }
  if (report.errorMessage) {
    parts.push(`message=${report.errorMessage}`);
  }
  return redactSensitiveText(parts.join(' '));
}

export async function runHostedCookieMatrix(options: {
  baseUrl: string;
  actors: HostedCookieJar;
  fixtures: HostedMatrixFixtures;
  fetchImpl?: typeof fetch;
}): Promise<MatrixCaseResult[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cases = buildHostedMatrixCases(options.fixtures);
  const results: MatrixCaseResult[] = [];

  for (const actor of AUTH_MATRIX_ACTORS) {
    if (!options.actors[actor]?.cookieHeader) {
      throw new Error(
        `Missing cookie-backed session for ${actorDisplayLabel(actor)}.`
      );
    }
  }

  for (const matrixCase of cases) {
    const headers = new Headers(matrixCase.headers);
    if (matrixCase.actor !== 'anonymous') {
      const requestHeaders = buildHostedRequestHeaders(
        options.actors[matrixCase.actor]
      );
      headers.set('Cookie', requestHeaders.Cookie);
    }

    if (headers.has('Authorization')) {
      results.push({
        name: matrixCase.name,
        ok: false,
        report: {
          actor: actorDisplayLabel(matrixCase.actor),
          method: matrixCase.method,
          route: matrixCase.path,
          expectedStatus: matrixCase.expectedStatus,
          actualStatus: null,
          errorMessage:
            'refusing to send Authorization; cookie-backed contract only',
        },
      });
      continue;
    }

    try {
      const response = await fetchImpl(
        new URL(matrixCase.path, options.baseUrl),
        {
          method: matrixCase.method,
          headers,
          body: matrixCase.body,
        }
      );
      const raw = await response.text();
      let body: unknown = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = {};
      }

      const safeFields = safeBodyFields(body);
      const assertionFailure =
        response.status === matrixCase.expectedStatus
          ? (matrixCase.assert?.(body) ?? null)
          : `expected ${matrixCase.expectedStatus}, received ${response.status}`;

      results.push({
        name: matrixCase.name,
        ok: assertionFailure == null,
        report: {
          actor: actorDisplayLabel(matrixCase.actor),
          method: matrixCase.method,
          route: matrixCase.path,
          expectedStatus: matrixCase.expectedStatus,
          actualStatus: response.status,
          errorCode: safeFields.errorCode,
          errorMessage: assertionFailure
            ? (boundSafeText(assertionFailure) ?? safeFields.errorMessage)
            : undefined,
        },
      });
    } catch (error) {
      results.push({
        name: matrixCase.name,
        ok: false,
        report: {
          actor: actorDisplayLabel(matrixCase.actor),
          method: matrixCase.method,
          route: matrixCase.path,
          expectedStatus: matrixCase.expectedStatus,
          actualStatus: null,
          errorMessage: safeErrorMessage(error),
        },
      });
    }
  }

  return results;
}
