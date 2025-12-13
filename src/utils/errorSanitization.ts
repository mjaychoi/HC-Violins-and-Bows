/**
 * Error Sanitization Utilities
 * 프로덕션 환경에서 민감한 정보를 제거하고 사용자 친화적인 에러 메시지를 제공합니다.
 */

/**
 * 프로덕션 환경인지 확인
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * 개발 환경인지 확인
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * 이메일 마스킹 (더 안전하고 읽기 쉽게)
 */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const maskedUser = user.length > 1 ? `${user[0]}***` : '***';
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return `${maskedUser}@***`;
  const maskedDomain = `${domainParts[0][0]}***.${domainParts.slice(-1)[0]}`;
  return `${maskedUser}@${maskedDomain}`;
}

/**
 * 전화번호 마스킹
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

/**
 * 토큰/키 마스킹 (JWT, Bearer, base64 등 지원)
 */
function maskToken(token: string): string {
  // JWT 형식 (3 parts separated by .)
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    return `${token.substring(0, 10)}***`;
  }
  // Bearer 토큰
  if (token.toLowerCase().startsWith('bearer ')) {
    const actualToken = token.substring(7);
    return `Bearer ${actualToken.substring(0, 8)}***`;
  }
  // 긴 문자열 (토큰/키로 추정)
  if (token.length > 20) {
    return `${token.substring(0, 8)}***${token.substring(token.length - 4)}`;
  }
  // 짧은 토큰
  if (token.length > 5) {
    return `${token[0]}***${token[token.length - 1]}`;
  }
  return '***';
}

/**
 * 파일 경로 마스킹 (Unix + Windows 경로 지원)
 */
function maskFilePath(path: string): string {
  // Windows 경로
  if (/^[A-Z]:\\/.test(path)) {
    const parts = path.split('\\');
    if (parts.length > 2) {
      return `${parts[0]}\\...\\${parts[parts.length - 1]}`;
    }
  }
  // Unix 경로
  const parts = path.split('/');
  if (parts.length > 3) {
    return `/${parts[1]}/.../${parts[parts.length - 1]}`;
  }
  return path.replace(/[^/\\]+/g, (match, index) => (index === 0 ? match : '***'));
}

/**
 * 민감한 정보가 포함된 패턴들 (개선된 버전)
 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; masker: (match: string) => string }> = [
  // API 키, 토큰 (개선: JWT, Bearer, 긴 hex 문자열 포함)
  {
    pattern: /(api[_-]?key|token|secret|password|auth[_-]?token|bearer)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi,
    masker: (match) => {
      const keyValueMatch = match.match(/[:=]\s*['"]?([^\s'"]+)/);
      if (keyValueMatch && keyValueMatch[1]) {
        return match.replace(keyValueMatch[1], maskToken(keyValueMatch[1]));
      }
      return maskToken(match);
    },
  },
  // JWT 토큰 (직접 감지)
  {
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    masker: maskToken,
  },
  // 이메일 (특수 마스커 사용)
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    masker: maskEmail,
  },
  // 전화번호 (특수 마스커 사용)
  {
    pattern: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    masker: maskPhone,
  },
  // 신용카드 번호
  {
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    masker: (match) => `****-****-****-${match.replace(/\D/g, '').slice(-4)}`,
  },
  // 데이터베이스 연결 문자열 (전체 마스킹)
  {
    pattern: /(postgresql|postgres|mysql|mongodb):\/\/[^\s]+/gi,
    masker: () => '***://***',
  },
  // 파일 경로 (Unix + Windows)
  {
    pattern: /([A-Z]:\\|\/)[^\s]*(\.(ts|tsx|js|jsx|json|env|log|config))/gi,
    masker: maskFilePath,
  },
  // 환경 변수 (값만 마스킹)
  {
    pattern: /process\.env\.\w+/gi,
    masker: (match) => match.replace(/(process\.env\.\w+)\s*=\s*['"]?[^'"]+/, '$1=***'),
  },
];

/**
 * 민감한 정보를 마스킹합니다 (패턴별 특화 마스커 사용)
 */
export function maskSensitiveInfo(text: string): string {
  let sanitized = text;

  SENSITIVE_PATTERNS.forEach(({ pattern, masker }) => {
    sanitized = sanitized.replace(pattern, (match) => {
      // 짧은 문자열은 그대로 유지 (false positive 방지)
      if (match.length < 5) return match;
      return masker(match);
    });
  });

  return sanitized;
}

/**
 * 에러 객체에서 민감한 정보를 제거합니다
 * Production에서는 details/stack을 포함하지 않습니다 (보안상 이유)
 */
export function sanitizeError(error: unknown): {
  message: string;
  details?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    const maskedMessage = maskSensitiveInfo(error.message);
    const maskedStack = error.stack ? maskSensitiveInfo(error.stack) : undefined;

    return {
      message: maskedMessage,
      // Production에서는 stack-derived fields를 포함하지 않음 (보안)
      details: isProduction() ? undefined : maskedStack,
      stack: isProduction() ? undefined : maskedStack,
    };
  }

  if (typeof error === 'string') {
    return {
      message: maskSensitiveInfo(error),
    };
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;
    const message = errorObj.message
      ? maskSensitiveInfo(String(errorObj.message))
      : 'An error occurred';
    
    // Production에서는 stack-derived fields를 포함하지 않음
    const maskedDetails = errorObj.details ? maskSensitiveInfo(String(errorObj.details)) : undefined;
    const maskedStack = errorObj.stack ? maskSensitiveInfo(String(errorObj.stack)) : undefined;

    return {
      message,
      details: isProduction() ? undefined : maskedDetails,
      stack: isProduction() ? undefined : maskedStack,
    };
  }

  return {
    message: 'An unexpected error occurred',
  };
}

/**
 * 사용자에게 표시할 에러 메시지를 생성합니다
 * Error code 기반 매핑을 우선 사용하여 일관성 확보
 */
export function getUserFriendlyErrorMessage(
  error: unknown,
  defaultMessage: string = 'An error occurred. Please try again.'
): string {
  // 개발 환경에서는 원본 메시지 반환
  if (isDevelopment()) {
    if (error instanceof Error) {
      return error.message || defaultMessage;
    }
    if (typeof error === 'string') {
      return error;
    }
    return defaultMessage;
  }

  // Error code 기반 매핑 (가장 안정적)
  if (error && typeof error === 'object' && 'code' in error) {
    const errorCode = (error as { code: string }).code;
    const errorCodeMessages: Record<string, string> = {
      // ErrorCodes enum 값들에 매핑
      'NETWORK_ERROR': 'Network connection error. Please check your internet connection.',
      'TIMEOUT_ERROR': 'Request timeout. Please try again.',
      'UNAUTHORIZED': 'Authentication required. Please log in.',
      'FORBIDDEN': 'Access denied. You do not have permission.',
      'RECORD_NOT_FOUND': 'The requested resource was not found.',
      'VALIDATION_ERROR': 'Please check your input and try again.',
      'DATABASE_ERROR': 'Database error occurred. Please try again later.',
      'INTERNAL_ERROR': 'Server error occurred. Please try again later.',
      'SESSION_EXPIRED': 'Session expired. Please log in again.',
      'DUPLICATE_RECORD': 'This record already exists.',
      // PostgREST/Supabase 에러 코드
      'PGRST116': 'Access denied.',
      'PGRST301': 'Session expired. Please log in again.',
      '23505': 'This record already exists.',
      '23503': 'Invalid reference to related record.',
    };
    
    if (errorCodeMessages[errorCode]) {
      return errorCodeMessages[errorCode];
    }
  }

  // 프로덕션 환경에서는 일반적인 메시지만 반환
  const sanitized = sanitizeError(error);
  
  // Fallback: 일반적인 에러 메시지 매핑 (substring 기반)
  const commonMessages: Record<string, string> = {
    'network': 'Network connection error. Please check your internet connection.',
    'timeout': 'Request timeout. Please try again.',
    'unauthorized': 'Authentication required. Please log in.',
    'forbidden': 'Access denied. You do not have permission.',
    'not found': 'The requested resource was not found.',
    'validation': 'Please check your input and try again.',
    'database': 'Database error occurred. Please try again later.',
    'server': 'Server error occurred. Please try again later.',
  };

  const lowerMessage = sanitized.message.toLowerCase();
  
  // 일반적인 에러 패턴 매칭 (fallback)
  for (const [key, message] of Object.entries(commonMessages)) {
    if (lowerMessage.includes(key)) {
      return message;
    }
  }

  // 기본 메시지 반환 (민감한 정보 제거됨)
  return defaultMessage;
}

/**
 * API 응답용 에러 객체를 생성합니다
 * Production에서는 details를 포함하지 않습니다 (보안)
 */
export function createSafeErrorResponse(
  error: unknown,
  statusCode: number = 500
): {
  error: string;
  message: string;
  statusCode: number;
  details?: string;
} {
  const sanitized = sanitizeError(error);
  const userMessage = getUserFriendlyErrorMessage(error);

  return {
    error: 'An error occurred',
    message: userMessage,
    statusCode,
    // Production에서는 details를 절대 포함하지 않음 (보안)
    details: isDevelopment() ? sanitized.details : undefined,
  };
}

/**
 * 로깅용 에러 정보를 생성합니다 (상세 정보 포함)
 * 이 함수는 서버 로그에만 사용되며, 클라이언트에 노출되지 않습니다.
 */
export function createLogErrorInfo(error: unknown): {
  message: string;
  details?: string;
  stack?: string;
  type: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack,
      stack: error.stack,
      type: error.constructor.name,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      type: 'string',
    };
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;
    return {
      message: String(errorObj.message || 'Unknown error'),
      details: errorObj.details ? String(errorObj.details) : undefined,
      stack: errorObj.stack ? String(errorObj.stack) : undefined,
      type: errorObj.constructor?.name || 'Object',
    };
  }

  return {
    message: 'Unknown error',
    type: 'unknown',
  };
}
