export type EnvMap = Record<string, string | undefined>;

export type StepName =
  | 'allowlist'
  | 'credentials'
  | 'readiness'
  | 'authentication'
  | 'authenticated_read'
  | 'create'
  | 'read_after_write'
  | 'cleanup';

export type StepStatus = 'PASS' | 'FAIL' | 'SKIP';

export type StepResult = {
  name: StepName;
  status: StepStatus;
  durationMs: number;
  httpStatus?: number;
  detail?: string;
  resourceId?: string;
};

export type SyntheticLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export type AuthenticatedSession = {
  cookieHeader: string;
  orgId: string | null;
};

export type AuthenticateFn = (env: EnvMap) => Promise<AuthenticatedSession>;
