export const DEPLOYMENT_SERVICE_NAME = 'inventory-app';

export const LIVENESS_PATH = '/api/health';
export const READINESS_PATH = '/api/ready';

/** Overall budget for one readiness HTTP request. */
export const READINESS_TIMEOUT_MS = 8_000;

/** Per-check budget inside a readiness request. */
export const READINESS_CHECK_TIMEOUT_MS = 5_000;
