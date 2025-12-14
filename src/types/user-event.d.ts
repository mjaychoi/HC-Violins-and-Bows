// ✅ FIXED: @testing-library/user-event 타입 선언
// 이 모듈은 자체 타입을 포함하지만, TypeScript가 인식하지 못할 수 있으므로
// 명시적으로 타입을 확장합니다
declare module '@testing-library/user-event' {
  export interface UserEvent {
    // Core interaction methods
    click: (element: Element | null) => Promise<void>;
    dblClick: (element: Element | null) => Promise<void>;
    type: (
      element: Element | null,
      text: string,
      options?: { delay?: number }
    ) => Promise<void>;
    clear: (element: Element | null) => Promise<void>;
    keyboard: (
      text: string,
      options?: { delay?: number }
    ) => Promise<void>;
    // Pointer methods
    hover: (element: Element | null) => Promise<void>;
    unhover: (element: Element | null) => Promise<void>;
    // Navigation methods
    tab: (options?: { shift?: boolean }) => Promise<void>;
    // File methods
    upload: (
      element: Element | null,
      fileOrFiles: File | File[]
    ) => Promise<void>;
    // Selection methods
    selectOptions: (
      element: Element | null,
      values: string | string[]
    ) => Promise<void>;
    deselectOptions: (
      element: Element | null,
      values: string | string[]
    ) => Promise<void>;
    // Clipboard methods
    paste: (element: Element | null, text: string) => Promise<void>;
    cut: (element: Element | null) => Promise<void>;
    copy: (element: Element | null) => Promise<void>;
    // Complex pointer interactions
    pointer: (actions: Array<{ keys?: string; target?: Element }>) => Promise<void>;
    // Fallback for any other methods not explicitly defined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: ((...args: any[]) => Promise<void>) | any;
  }

  export interface UserEventOptions {
    delay?: number;
    // Additional options that may be used by the library
    advanceTimers?: (delay: number) => Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: number | ((...args: any[]) => Promise<void>) | any;
  }

  const userEvent: {
    setup: (options?: UserEventOptions) => UserEvent;
  };

  export default userEvent;
}
