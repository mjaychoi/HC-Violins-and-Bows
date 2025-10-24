import { useState, useMemo } from 'react'
import { Instrument } from '@/types'

export function useDashboardFilters(items: Instrument[]) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)
  
  const [filters, setFilters] = useState({
    status: [] as string[],
    maker: [] as string[],
    type: [] as string[],
    subtype: [] as string[],
    ownership: [] as string[],
    certificate: [] as boolean[],
    priceRange: {
      min: '',
      max: ''
    },
    hasClients: [] as string[]
  })

  const filteredItems = useMemo(() => {
    let filtered = items

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.maker?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Status filter
    if (filters.status.length > 0) {
      filtered = filtered.filter(item => filters.status.includes(item.status))
    }

    // Maker filter
    if (filters.maker.length > 0) {
      filtered = filtered.filter(item => item.maker && filters.maker.includes(item.maker))
    }

    // Type filter
    if (filters.type.length > 0) {
      filtered = filtered.filter(item => item.type && filters.type.includes(item.type))
    }

    // Ownership filter
    if (filters.ownership.length > 0) {
      filtered = filtered.filter(item => item.ownership && filters.ownership.includes(item.ownership))
    }

    // Certificate filter
    if (filters.certificate.length > 0) {
      filtered = filtered.filter(item => filters.certificate.includes(item.certificate))
    }

    // Price range filter
    if (filters.priceRange.min || filters.priceRange.max) {
      filtered = filtered.filter(item => {
        if (!item.price) return false
        
        const price = item.price
        if (isNaN(price)) return false
        
        const min = filters.priceRange.min ? parseFloat(filters.priceRange.min) : 0
        const max = filters.priceRange.max ? parseFloat(filters.priceRange.max) : Infinity
        
        return price >= min && price <= max
      })
    }

    return filtered
  }, [items, searchTerm, filters])

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let aValue = a[sortBy as keyof Instrument]
      let bValue = b[sortBy as keyof Instrument]

      // Handle null values
      if (aValue === null && bValue === null) return 0
      if (aValue === null) return sortOrder === 'asc' ? 1 : -1
      if (bValue === null) return sortOrder === 'asc' ? -1 : 1

      // Handle different data types
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase()
        bValue = bValue.toLowerCase()
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredItems, sortBy, sortOrder])

  const filterOptions = useMemo(() => {
    const uniqueValues = (field: keyof typeof items[0]) => {
      const values = items.map(item => item[field]).filter(Boolean) as string[]
      return Array.from(new Set(values))
    }

    return {
      status: uniqueValues('status'),
      maker: uniqueValues('maker'),
      type: uniqueValues('type'),
      ownership: uniqueValues('ownership')
    }
  }, [items])

  const handleFilterChange = (filterType: keyof typeof filters, value: string | boolean) => {
    setFilters(prev => {
      const currentFilter = prev[filterType]
      if (Array.isArray(currentFilter)) {
        return {
          ...prev,
          [filterType]: (currentFilter as (string | boolean)[]).includes(value)
            ? (currentFilter as (string | boolean)[]).filter(v => v !== value)
            : [...(currentFilter as (string | boolean)[]), value]
        }
      }
      return prev
    })
  }

  const handlePriceRangeChange = (field: 'min' | 'max', value: string) => {
    setFilters(prev => ({
      ...prev,
      priceRange: {
        ...prev.priceRange,
        [field]: value
      }
    }))
  }

  const clearAllFilters = () => {
    setFilters({
      status: [],
      maker: [],
      type: [],
      subtype: [],
      ownership: [],
      certificate: [],
      priceRange: { min: '', max: '' },
      hasClients: []
    })
    setSearchTerm('')
  }

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const getSortArrow = (field: string) => {
    if (sortBy !== field) return ''
    return sortOrder === 'asc' ? '↑' : '↓'
  }

  const getActiveFiltersCount = () => {
    let count = 0
    Object.entries(filters).forEach(([key, filter]) => {
      if (Array.isArray(filter)) {
        count += filter.length
      } else if (key === 'priceRange' && typeof filter === 'object' && filter !== null) {
        count += Object.values(filter).filter(Boolean).length
      }
    })
    return count
  }

  return {
    searchTerm,
    setSearchTerm,
    sortBy,
    sortOrder,
    showFilters,
    setShowFilters,
    filters,
    filteredItems: sortedItems,
    filterOptions,
    handleFilterChange,
    handlePriceRangeChange,
    clearAllFilters,
    handleSort,
    getSortArrow,
    getActiveFiltersCount
  }
}
