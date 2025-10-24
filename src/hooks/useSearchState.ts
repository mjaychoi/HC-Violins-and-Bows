// src/hooks/useSearchState.ts
import { useState, useCallback, useMemo } from 'react'

// Generic search state management hook
export function useListSearch<T>(items: T[], searchFields: (keyof T)[]) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<keyof T | string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items

    return items.filter(item => 
      searchFields.some(field => {
        const value = item[field]
        if (typeof value === 'string') {
          return value.toLowerCase().includes(searchTerm.toLowerCase())
        }
        if (typeof value === 'number') {
          return value.toString().includes(searchTerm)
        }
        return false
      })
    )
  }, [items, searchTerm, searchFields])

  const sortedItems = useMemo(() => {
    if (!sortBy) return filteredItems

    return [...filteredItems].sort((a, b) => {
      const aValue = a[sortBy as keyof T]
      const bValue = b[sortBy as keyof T]
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredItems, sortBy, sortOrder])

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term)
  }, [])

  const handleSort = useCallback((field: keyof T | string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }, [sortBy])

  const clearSearch = useCallback(() => {
    setSearchTerm('')
    setSortBy('')
    setSortOrder('asc')
  }, [])

  return {
    searchTerm,
    sortBy,
    sortOrder,
    filteredItems: sortedItems,
    handleSearch,
    handleSort,
    clearSearch,
    setSearchTerm,
    setSortBy,
    setSortOrder
  }
}
