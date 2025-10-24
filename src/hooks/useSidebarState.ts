// src/hooks/useSidebarState.ts
import { useState, useCallback } from 'react'

// Generic sidebar state management hook
export function useSidebarState(initialExpanded: boolean = false) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)

  const toggleSidebar = useCallback(() => {
    setIsExpanded(prev => !prev)
  }, [])

  const expandSidebar = useCallback(() => {
    setIsExpanded(true)
  }, [])

  const collapseSidebar = useCallback(() => {
    setIsExpanded(false)
  }, [])

  return {
    isExpanded,
    toggleSidebar,
    expandSidebar,
    collapseSidebar,
    setIsExpanded
  }
}
