const PRODUCT_SHA_RE = /^[0-9a-f]{40}$/;

export function readProductShaUnderTest(value: string | undefined): string {
  const candidate = value?.trim() ?? '';
  if (!PRODUCT_SHA_RE.test(candidate)) {
    throw new Error(
      'EXPORT_E2E_PRODUCT_SHA is required when export E2E is requested and must be a full 40-character lowercase hexadecimal Git SHA. This records the product SHA under test. It does not prove the deployed alias serves that SHA.'
    );
  }
  return candidate;
}
