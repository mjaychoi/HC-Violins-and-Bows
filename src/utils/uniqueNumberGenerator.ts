/**
 * 고유 번호 생성 유틸리티
 */

/**
 * 악기 타입에 따른 접두사 반환
 */
function getInstrumentPrefix(type: string | null): string {
  if (!type) return 'IN'; // Instrument (기본값)

  const normalizedType = type.toLowerCase().trim();

  // Violin 관련
  if (
    normalizedType.includes('violin') ||
    normalizedType.includes('바이올린')
  ) {
    return 'VI';
  }
  // Viola 관련
  if (normalizedType.includes('viola') || normalizedType.includes('비올라')) {
    return 'VA';
  }
  // Cello 관련
  if (normalizedType.includes('cello') || normalizedType.includes('첼로')) {
    return 'CE';
  }
  // Double Bass 관련
  if (normalizedType.includes('bass') || normalizedType.includes('베이스')) {
    return 'DB';
  }
  // Bow 관련
  if (normalizedType.includes('bow') || normalizedType.includes('활')) {
    return 'BO';
  }

  return 'IN'; // 기본값
}

export const INSTRUMENT_SERIAL_REGEX = /^[A-Z]{2}\d{7}$/;

const normalizePrefix = (value: string) => value.trim().toUpperCase();

/**
 * 악기 고유 번호 생성
 * 형식: {접두사}{숫자7자리} (예: VI0000001, BO0000123)
 */
export function generateInstrumentSerialNumber(
  type: string | null,
  existingNumbers: string[] = []
): string {
  const prefix = getInstrumentPrefix(type);

  // 기존 번호에서 같은 접두사를 가진 번호 찾기
  const samePrefixNumbers = existingNumbers
    .filter(num => num && normalizePrefix(num).startsWith(prefix))
    .map(num => {
      const match = normalizeInstrumentSerial(num).match(/\d+$/);
      return match ? parseInt(match[0], 10) : 0;
    });

  const maxNumber =
    samePrefixNumbers.length > 0 ? Math.max(...samePrefixNumbers) : 0;
  const nextNumber = maxNumber + 1;

  const paddedNumber = nextNumber.toString().padStart(7, '0');

  return `${prefix}${paddedNumber}`;
}

/**
 * 악기 고유 번호 정규화
 * - 공백 제거, 대문자 변환
 * - 접두사(2글자)+숫자(1~7자리)면 숫자를 7자리 zero-pad
 */
export function normalizeInstrumentSerial(
  number: string | null | undefined
): string {
  if (!number) return '';
  const trimmed = number.trim().toUpperCase();
  const match = trimmed.match(/^([A-Z]{2})(\d{1,7})$/);
  if (!match) return trimmed;

  const [, prefix, digits] = match;
  return `${prefix}${digits.padStart(7, '0')}`;
}

export interface DuplicateInstrumentInfo {
  serial_number: string;
  id?: string;
  maker?: string | null;
  type?: string | null;
}

export function validateInstrumentSerial(
  serial: string | null | undefined,
  existingNumbers: string[] = [],
  currentNumber?: string | null,
  instruments?: Array<{
    serial_number: string | null;
    id?: string;
    maker?: string | null;
    type?: string | null;
  }>
): {
  valid: boolean;
  error?: string;
  normalizedSerial?: string;
  duplicateInfo?: DuplicateInstrumentInfo;
} {
  const normalized = normalizeInstrumentSerial(serial);

  if (!normalized) {
    return { valid: false, error: 'Serial number is required.' };
  }

  if (!INSTRUMENT_SERIAL_REGEX.test(normalized)) {
    return {
      valid: false,
      error:
        'Serial number must match pattern AA0000000 (2 letters + 7 digits).',
    };
  }

  const normalizedCurrent = normalizeInstrumentSerial(currentNumber);
  const normalizedExisting = existingNumbers.map(n =>
    normalizeInstrumentSerial(n)
  );

  const duplicateIndex = normalizedExisting.findIndex(
    num => num === normalized && num !== normalizedCurrent
  );

  if (duplicateIndex !== -1) {
    // 중복된 악기 정보 찾기
    const duplicateSerial = existingNumbers[duplicateIndex];
    let duplicateInfo: DuplicateInstrumentInfo | undefined;

    if (instruments && duplicateSerial) {
      const duplicateInstrument = instruments.find(
        inst => normalizeInstrumentSerial(inst.serial_number) === normalized
      );

      if (duplicateInstrument) {
        duplicateInfo = {
          serial_number: duplicateSerial,
          id: duplicateInstrument.id,
          maker: duplicateInstrument.maker,
          type: duplicateInstrument.type,
        };
      }
    }

    // 구체적인 에러 메시지 생성
    let errorMessage = `Serial Number '${normalized}'가 이미 사용 중입니다.`;
    if (duplicateInfo?.maker || duplicateInfo?.type) {
      const instrumentName = [duplicateInfo.maker, duplicateInfo.type]
        .filter(Boolean)
        .join(' ');
      errorMessage += ` (악기: ${instrumentName || '알 수 없음'})`;
    }

    return {
      valid: false,
      error: errorMessage,
      duplicateInfo: duplicateInfo || { serial_number: duplicateSerial },
    };
  }

  return { valid: true, normalizedSerial: normalized };
}

/**
 * 클라이언트 고유 번호 생성
 * 형식: CL{숫자} (예: CL001, CL123)
 * 또는 사용자 정의 형식 (예: mj123)
 */
export function generateClientNumber(existingNumbers: string[] = []): string {
  const prefix = 'CL';

  // 기존 번호에서 같은 접두사를 가진 번호 찾기
  const samePrefixNumbers = existingNumbers
    .filter(num => num && num.toUpperCase().startsWith(prefix))
    .map(num => {
      // 숫자 부분 추출
      const match = num.match(/\d+$/);
      return match ? parseInt(match[0], 10) : 0;
    });

  // 다음 번호 계산
  const maxNumber =
    samePrefixNumbers.length > 0 ? Math.max(...samePrefixNumbers) : 0;
  const nextNumber = maxNumber + 1;

  // 3자리 숫자로 포맷팅 (예: 001, 123)
  const paddedNumber = nextNumber.toString().padStart(3, '0');

  return `${prefix}${paddedNumber}`;
}

/**
 * 고유 번호 유효성 검사
 */
export function validateUniqueNumber(
  number: string | null | undefined,
  existingNumbers: string[] = [],
  currentNumber?: string | null
): { valid: boolean; error?: string } {
  if (!number || number.trim() === '') {
    return { valid: true }; // 빈 값은 허용 (선택적 필드)
  }

  const trimmed = number.trim().toUpperCase();

  // 중복 확인 (현재 번호 제외)
  const isDuplicate = existingNumbers.some(
    existing =>
      existing &&
      existing.toUpperCase() === trimmed &&
      existing !== currentNumber
  );

  if (isDuplicate) {
    return {
      valid: false,
      error: '이미 사용 중인 고유 번호입니다.',
    };
  }

  // 형식 검증 (영문자와 숫자 조합, 최대 20자)
  const formatRegex = /^[A-Z0-9]{1,20}$/;
  if (!formatRegex.test(trimmed)) {
    return {
      valid: false,
      error:
        '고유 번호는 영문자와 숫자만 사용할 수 있으며, 최대 20자까지 가능합니다.',
    };
  }

  return { valid: true };
}

/**
 * 고유 번호 포맷팅 (대문자로 변환)
 */
export function formatUniqueNumber(number: string | null | undefined): string {
  if (!number) return '';
  return number.trim().toUpperCase();
}
