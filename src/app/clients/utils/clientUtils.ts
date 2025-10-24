// src/app/clients/utils/clientUtils.ts
import { Client } from '@/types'

// Client utility functions
export const formatClientName = (client: Client): string => {
  const firstName = client.first_name || ''
  const lastName = client.last_name || ''
  const fullName = `${firstName} ${lastName}`.trim()
  return fullName || 'Unknown Client'
}

export const formatClientContact = (client: Client): string => {
  const parts = []
  if (client.email) parts.push(client.email)
  if (client.contact_number) parts.push(client.contact_number)
  return parts.length > 0 ? parts.join(' • ') : 'No contact info'
}

export const getClientInitials = (client: Client): string => {
  const firstName = client.first_name || ''
  const lastName = client.last_name || ''
  const firstInitial = firstName.charAt(0).toUpperCase()
  const lastInitial = lastName.charAt(0).toUpperCase()
  const initials = `${firstInitial}${lastInitial}`
  return initials || 'U'
}

export const isClientComplete = (client: Client): boolean => {
  return !!(
    client.first_name &&
    client.last_name &&
    (client.contact_number || client.email)
  )
}

export const getClientDisplayInfo = (client: Client) => {
  return {
    name: formatClientName(client),
    contact: formatClientContact(client),
    initials: getClientInitials(client),
    isComplete: isClientComplete(client)
  }
}

// Search and filter functions
export const filterClients = (
  clients: Client[],
  searchTerm: string,
  filters: Record<string, string[]>,
  opts?: { clientsWithInstruments?: Set<string> }
): Client[] => {
  const withInst = opts?.clientsWithInstruments ?? new Set<string>()
  return clients.filter(client => {
    // Text search
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      const matchesSearch = 
        (client.first_name?.toLowerCase().includes(searchLower)) ||
        (client.last_name?.toLowerCase().includes(searchLower)) ||
        (client.contact_number?.toLowerCase().includes(searchLower)) ||
        (client.email?.toLowerCase().includes(searchLower)) ||
        (client.interest?.toLowerCase().includes(searchLower)) ||
        (client.note?.toLowerCase().includes(searchLower))
      
      if (!matchesSearch) return false
    }

    // Filter by specific fields
    if (filters.last_name.length > 0 && !filters.last_name.includes(client.last_name || '')) {
      return false
    }
    if (filters.first_name.length > 0 && !filters.first_name.includes(client.first_name || '')) {
      return false
    }
    if (filters.contact_number.length > 0 && !filters.contact_number.includes(client.contact_number || '')) {
      return false
    }
    if (filters.email.length > 0 && !filters.email.includes(client.email || '')) {
      return false
    }
    if (filters.tags.length > 0 && !filters.tags.some(tag => client.tags?.includes(tag))) {
      return false
    }
    if (filters.interest.length > 0 && !filters.interest.includes(client.interest || '')) {
      return false
    }

    // hasInstruments filter
    if (filters.hasInstruments && filters.hasInstruments.length > 0) {
      const has = withInst.has(client.id)
      if (filters.hasInstruments.includes('Has Instruments') && !has) return false
      if (filters.hasInstruments.includes('No Instruments') && has) return false
    }

    return true
  })
}

export const sortClients = (
  clients: Client[],
  sortBy: string,
  sortOrder: 'asc' | 'desc'
): Client[] => {
  return [...clients].sort((a, b) => {
    let aValue: unknown = a[sortBy as keyof Client]
    let bValue: unknown = b[sortBy as keyof Client]

    // Handle null/undefined values
    if (aValue === null || aValue === undefined) aValue = ''
    if (bValue === null || bValue === undefined) bValue = ''

    // Handle arrays (like tags)
    if (Array.isArray(aValue)) aValue = aValue.join(', ')
    if (Array.isArray(bValue)) bValue = bValue.join(', ')

    // Convert to strings for comparison
    aValue = String(aValue).toLowerCase()
    bValue = String(bValue).toLowerCase()

    if (sortOrder === 'asc') {
      return (aValue as string).localeCompare(bValue as string)
    } else {
      return (bValue as string).localeCompare(aValue as string)
    }
  })
}
