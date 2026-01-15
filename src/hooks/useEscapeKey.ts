// src/hooks/useEscapeKey.ts
import { useEffect } from 'react';

export function useEscapeKey(onEscape: () => void, isActive: boolean = true) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape();
      }
    };

    const listener = handleKeyDown as EventListener;
    const options: AddEventListenerOptions = { passive: true };

    document.addEventListener('keydown', listener, options);
    return () => document.removeEventListener('keydown', listener, options);
  }, [onEscape, isActive]);
}
