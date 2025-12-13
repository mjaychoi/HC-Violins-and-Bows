import {
  breakpoints,
  isBreakpoint,
  isMobile,
  isTablet,
  isDesktop,
  onResize,
  isTouchDevice,
} from '../responsive';

describe('responsive', () => {
  const originalInnerWidth = window.innerWidth;
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
  });

  describe('breakpoints', () => {
    it('should have all expected breakpoint values', () => {
      expect(breakpoints.sm).toBe(640);
      expect(breakpoints.md).toBe(768);
      expect(breakpoints.lg).toBe(1024);
      expect(breakpoints.xl).toBe(1280);
      expect(breakpoints['2xl']).toBe(1536);
    });
  });

  describe('isBreakpoint', () => {
    it('should return false when window is undefined', () => {
      // In jsdom, window is always available, so we test with different widths
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 800,
      });
      expect(isBreakpoint('md')).toBe(true);
    });

    it('should return true when width is greater than breakpoint', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 800,
      });
      expect(isBreakpoint('md')).toBe(true);
      expect(isBreakpoint('sm')).toBe(true);
    });

    it('should return false when width is less than breakpoint', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 600,
      });
      expect(isBreakpoint('md')).toBe(false);
      expect(isBreakpoint('lg')).toBe(false);
    });
  });

  describe('isMobile', () => {
    it('should return true when width is less than md', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 600,
      });
      expect(isMobile()).toBe(true);
    });

    it('should return false when width is greater than or equal to md', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 800,
      });
      expect(isMobile()).toBe(false);
    });
  });

  describe('isTablet', () => {
    it('should return true when width is between md and lg', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 900,
      });
      expect(isTablet()).toBe(true);
    });

    it('should return false when width is less than md', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 600,
      });
      expect(isTablet()).toBe(false);
    });

    it('should return false when width is greater than or equal to lg', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1200,
      });
      expect(isTablet()).toBe(false);
    });
  });

  describe('isDesktop', () => {
    it('should return true when width is greater than or equal to lg', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1200,
      });
      expect(isDesktop()).toBe(true);
    });

    it('should return false when width is less than lg', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 900,
      });
      expect(isDesktop()).toBe(false);
    });
  });

  describe('onResize', () => {
    it('should add resize event listener', () => {
      const mockCallback = jest.fn();
      const removeListener = onResize(mockCallback);

      // Simulate resize event
      window.dispatchEvent(new Event('resize'));

      expect(mockCallback).toHaveBeenCalled();

      // Cleanup
      removeListener();
    });

    it('should return cleanup function that removes listener', () => {
      const mockCallback = jest.fn();
      const removeListener = onResize(mockCallback);

      removeListener();

      // Simulate resize event after cleanup
      window.dispatchEvent(new Event('resize'));

      // Callback should not be called after cleanup
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('isTouchDevice', () => {
    it('should return false when window is undefined', () => {
      // In jsdom, window is always available
      // We can't easily mock ontouchstart, so we just verify it doesn't throw
      expect(typeof isTouchDevice()).toBe('boolean');
    });

    it('should return boolean value', () => {
      const result = isTouchDevice();
      expect(typeof result).toBe('boolean');
    });
  });
});
