// src/hooks/useSidebarState.ts
import { useState, useCallback } from 'react';

// Generic sidebar state management hook
// Always start with false to avoid hydration mismatch between server and client
export function useSidebarState() {
  // Always initialize with false to ensure server and client render the same HTML
  // The sidebar will be collapsed by default, and can be expanded via user interaction
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleSidebar = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const expandSidebar = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const collapseSidebar = useCallback(() => {
    setIsExpanded(false);
  }, []);

  return {
    isExpanded,
    toggleSidebar,
    expandSidebar,
    collapseSidebar,
    setIsExpanded,
  };
}
