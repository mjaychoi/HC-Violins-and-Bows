/**
 * ⚠️ Type augmentation for @testing-library/user-event
 *
 * This type declaration is a workaround for TypeScript not recognizing
 * the library's built-in types. However, this approach has risks:
 *
 * 1. Library updates may change method signatures, causing type conflicts
 * 2. Declared types may be narrower than actual implementation
 * 3. Version-specific differences may not be captured
 *
 * ✅ Recommended alternatives (in order of preference):
 * 1. Fix tsconfig (types/moduleResolution/skipLibCheck) to use official types
 * 2. Pin @testing-library/user-event version and use official types
 * 3. Use minimal augmentation (only methods actually used)
 *
 * ✅ FIXED: Minimal augmentation approach
 * - Only augments setup() return type (most commonly used)
 * - Method signatures kept wide (unknown[]) to avoid conflicts
 * - This file should be in src/types/ (not in app runtime bundle)
 */
declare module '@testing-library/user-event' {
  // ✅ FIXED: Minimal augmentation - only setup() return type
  // Keep method signatures wide to avoid version conflicts
  export interface UserEvent {
    // Keep signatures wide to avoid breaking on library updates
    [key: string]: (...args: unknown[]) => Promise<unknown>;
  }

  export interface UserEventOptions {
    delay?: number;
    [key: string]: unknown;
  }

  // ✅ FIXED: Only augment setup() return type (minimal)
  const userEvent: {
    setup: (options?: UserEventOptions) => UserEvent;
  };

  export default userEvent;
}
