// ✅ FIXED: @testing-library/user-event 타입 선언
// 이 모듈은 자체 타입을 포함하지만, TypeScript가 인식하지 못할 수 있으므로
// 명시적으로 타입을 확장합니다
declare module '@testing-library/user-event' {
  export interface UserEvent {
    click: (element: Element | null) => Promise<void>;
    type: (element: Element | null, text: string) => Promise<void>;
    clear: (element: Element | null) => Promise<void>;
    keyboard: (text: string) => Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }

  export interface UserEventOptions {
    delay?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }

  const userEvent: {
    setup: (options?: UserEventOptions) => UserEvent;
  };

  export default userEvent;
}
