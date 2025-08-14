"use client"

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Client {
  id: string
  last_name: string | null
  first_name: string | null
  contact_number: string | null
  email: string | null
  tags: string[]
  interest: string | null
  note: string | null
  created_at: string
}

interface Instrument {
  id: string
  status: 'Available' | 'Booked' | 'Sold'
  maker: string | null
  type: string | null
  year: number | null
  certificate: boolean
  size: string | null
  weight: string | null
  price: number | null
  ownership: string | null
  note: string | null
  created_at: string
}

interface ClientInstrument {
  id: string
  client_id: string
  instrument_id: string
  relationship_type: 'Interested' | 'Sold' | 'Booked' | 'Owned'
  notes: string | null
  created_at: string
  instrument?: Instrument
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  
  // Form states
  const [formData, setFormData] = useState({
    last_name: '',
    first_name: '',
    contact_number: '',
    email: '',
    tags: [] as string[],
    interest: '',
    note: ''
  })

  // Tagging system states
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showInterestDropdown, setShowInterestDropdown] = useState(false)

  // New client instrument connection states
  const [showInstrumentSearchForNew, setShowInstrumentSearchForNew] = useState(false)
  const [instrumentSearchTermForNew, setInstrumentSearchTermForNew] = useState('')
  const [searchResultsForNew, setSearchResultsForNew] = useState<Instrument[]>([])
  const [isSearchingInstrumentsForNew, setIsSearchingInstrumentsForNew] = useState(false)
  const [selectedInstrumentsForNew, setSelectedInstrumentsForNew] = useState<Array<{instrument: Instrument, relationshipType: ClientInstrument['relationship_type']}>>([])

  const [viewFormData, setViewFormData] = useState({
    last_name: '',
    first_name: '',
    contact_number: '',
    email: '',
    tags: [] as string[],
    interest: '',
    note: ''
  })

  const [submitting, setSubmitting] = useState(false)

  // Instrument relationship states
  const [instrumentRelationships, setInstrumentRelationships] = useState<ClientInstrument[]>([])
  const [showInstrumentSearch, setShowInstrumentSearch] = useState(false)
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Instrument[]>([])
  const [isSearchingInstruments, setIsSearchingInstruments] = useState(false)
  const [clientsWithInstruments, setClientsWithInstruments] = useState<Set<string>>(new Set())

  // Owned items state
  const [ownedItems, setOwnedItems] = useState<Instrument[]>([])
  const [loadingOwnedItems, setLoadingOwnedItems] = useState(false)

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    last_name: [] as string[],
    first_name: [] as string[],
    contact_number: [] as string[],
    email: [] as string[],
    tags: [] as string[],
    interest: [] as string[],
    hasInstruments: [] as string[]
  })

  // Add ref for filter panel
  const filterPanelRef = useRef<HTMLDivElement>(null)

  // Handle click outside filter panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const filterButton = document.querySelector('[data-filter-button]')
      if (filterButton && filterButton.contains(target)) {
        return
      }
      
      if (filterPanelRef.current && !filterPanelRef.current.contains(target)) {
        setShowFilters(false)
      }
    }

    if (showFilters) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFilters])

  // Check if interest dropdown should be shown
  useEffect(() => {
    const shouldShowInterest = selectedTags.some(tag => ['Musician', 'Dealer', 'Collector'].includes(tag))
    setShowInterestDropdown(shouldShowInterest)
  }, [selectedTags])

  // Check if interest dropdown should be shown for edit window
  useEffect(() => {
    if (isEditing) {
      const shouldShowInterest = viewFormData.tags.some(tag => ['Musician', 'Dealer', 'Collector'].includes(tag))
      setShowInterestDropdown(shouldShowInterest)
    }
  }, [viewFormData.tags, isEditing])

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setClients(data || [])
      
      // Fetch which clients have instruments
      await fetchClientsWithInstruments()
    } catch (error) {
      console.error('Error fetching clients:', error)
      if (error instanceof Error) {
        alert(`Error fetching clients: ${error.message}`)
      } else {
        alert('Error fetching clients: Unknown error')
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchClientsWithInstruments = async () => {
    try {
      const { data, error } = await supabase
        .from('client_instruments')
        .select('client_id')
      
      if (error) throw error
      
      const clientIds = new Set(data?.map(item => item.client_id) || [])
      setClientsWithInstruments(clientIds)
    } catch (error) {
      console.error('Error fetching clients with instruments:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([formData])
        .select()

      if (error) {
        console.error('Supabase error:', error)
        throw error
      }

      // Add instrument connections if any were selected
      if (selectedInstrumentsForNew.length > 0 && data && data[0]) {
        const clientId = data[0].id
        const connections = selectedInstrumentsForNew.map(item => ({
          client_id: clientId,
          instrument_id: item.instrument.id,
          relationship_type: item.relationshipType
        }))

        const { error: connectionError } = await supabase
          .from('client_instruments')
          .insert(connections)

        if (connectionError) {
          console.error('Error adding instrument connections:', connectionError)
          // Don't throw here, client was created successfully
        }
      }
      
      // Reset form and close modal
      setFormData({
        last_name: '',
        first_name: '',
        contact_number: '',
        email: '',
        tags: [],
        interest: '',
        note: ''
      })
      setSelectedTags([])
      setShowInterestDropdown(false)
      setSelectedInstrumentsForNew([])
      setShowInstrumentSearchForNew(false)
      setInstrumentSearchTermForNew('')
      setSearchResultsForNew([])
      setShowModal(false)
      
      // Refresh the clients list
      await fetchClients()
    } catch (error) {
      console.error('Error adding client:', error)
      if (error instanceof Error) {
        alert(`Failed to add client: ${error.message}`)
      } else {
        alert('Failed to add client')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClient) return
    
    setSubmitting(true)
    
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          last_name: viewFormData.last_name,
          first_name: viewFormData.first_name,
          contact_number: viewFormData.contact_number,
          email: viewFormData.email,
          tags: viewFormData.tags,
          interest: viewFormData.interest,
          note: viewFormData.note
        })
        .eq('id', selectedClient.id)

      if (error) throw error
      
      setIsEditing(false)
      await fetchClients()
    } catch (error) {
      console.error('Error updating client:', error)
      alert('Failed to update client')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteClient = async () => {
    if (!selectedClient) return
    
    const confirmed = window.confirm('Are you sure you want to delete this client? This action cannot be undone.')
    if (!confirmed) return
    
    setSubmitting(true)
    
    try {
      // Delete client relationships first
      await supabase.from('client_instruments').delete().eq('client_id', selectedClient.id)
      
      // Delete the client
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', selectedClient.id)

      if (error) throw error

      // Close modal and refresh
      setShowViewModal(false)
      setSelectedClient(null)
      await fetchClients()
      
      alert('Client deleted successfully!')
    } catch (error) {
      console.error('Error deleting client:', error)
      alert('Failed to delete client')
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleViewInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setViewFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleRowClick = (client: Client) => {
    setSelectedClient(client)
    setViewFormData({
      last_name: client.last_name || '',
      first_name: client.first_name || '',
      contact_number: client.contact_number || '',
      email: client.email || '',
      tags: client.tags || [],
      interest: client.interest || '',
      note: client.note || ''
    })
    setIsEditing(false)
    setShowViewModal(true)
    
    // Fetch instrument relationships for this client
    fetchInstrumentRelationships(client.id)
    
    // Fetch owned items if client has Owner tag
    if (client.tags && client.tags.includes('Owner')) {
      fetchOwnedItems(client)
    } else {
      setOwnedItems([])
    }
  }

  const fetchInstrumentRelationships = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('client_instruments')
        .select(`
          *,
          instrument:instruments(*)
        `)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setInstrumentRelationships(data || [])
    } catch (error) {
      console.error('Error fetching instrument relationships:', error)
    }
  }

  const fetchOwnedItems = async (client: Client) => {
    try {
      setLoadingOwnedItems(true)
      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .eq('ownership', `${client.first_name} ${client.last_name}`)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setOwnedItems(data || [])
    } catch (error) {
      console.error('Error fetching owned items:', error)
      setOwnedItems([])
    } finally {
      setLoadingOwnedItems(false)
    }
  }

  const searchInstruments = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearchingInstruments(true)
    try {
      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .or(`maker.ilike.%${searchTerm}%,type.ilike.%${searchTerm}%`)
        .limit(10)
      
      if (error) throw error
      setSearchResults(data || [])
    } catch (error) {
      console.error('Error searching instruments:', error)
      setSearchResults([])
    } finally {
      setIsSearchingInstruments(false)
    }
  }

  const searchInstrumentsForNew = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResultsForNew([])
      return
    }

    setIsSearchingInstrumentsForNew(true)
    try {
      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .or(`maker.ilike.%${searchTerm}%,type.ilike.%${searchTerm}%`)
        .limit(10)
      
      if (error) throw error
      // Filter out instruments already selected to prevent duplicates
      const selectedIds = new Set(selectedInstrumentsForNew.map(si => si.instrument.id))
      const filtered = (data || []).filter(inst => !selectedIds.has(inst.id))
      setSearchResultsForNew(filtered)
    } catch (error) {
      console.error('Error searching instruments:', error)
      setSearchResultsForNew([])
    } finally {
      setIsSearchingInstrumentsForNew(false)
    }
  }

  const addInstrumentForNew = (instrument: Instrument, relationshipType: ClientInstrument['relationship_type'] = 'Interested') => {
    setSelectedInstrumentsForNew(prev => {
      if (prev.some(p => p.instrument.id === instrument.id)) return prev
      return [...prev, { instrument, relationshipType }]
    })
    setShowInstrumentSearchForNew(false)
    setInstrumentSearchTermForNew('')
    setSearchResultsForNew([])
  }

  const removeInstrumentForNew = (instrumentId: string) => {
    setSelectedInstrumentsForNew(prev => prev.filter(item => item.instrument.id !== instrumentId))
  }

  const addInstrumentRelationship = async (instrumentId: string, relationshipType: ClientInstrument['relationship_type'] = 'Interested') => {
    if (!selectedClient) return

    try {
      const { error } = await supabase
        .from('client_instruments')
        .insert({
          client_id: selectedClient.id,
          instrument_id: instrumentId,
          relationship_type: relationshipType
        })

      if (error) throw error

      // Refresh relationships
      await fetchInstrumentRelationships(selectedClient.id)
      setShowInstrumentSearch(false)
      setInstrumentSearchTerm('')
      setSearchResults([])
    } catch (error) {
      console.error('Error adding instrument relationship:', error)
      alert('Failed to add instrument relationship')
    }
  }

  const removeInstrumentRelationship = async (relationshipId: string) => {
    try {
      const { error } = await supabase
        .from('client_instruments')
        .delete()
        .eq('id', relationshipId)

      if (error) throw error

      // Refresh relationships
      if (selectedClient) {
        await fetchInstrumentRelationships(selectedClient.id)
      }
    } catch (error) {
      console.error('Error removing instrument relationship:', error)
      alert('Failed to remove instrument relationship')
    }
  }

  // Get unique values for filter options
  const getUniqueValues = (field: keyof Client) => {
    const values = clients.map(client => client[field]).filter((value): value is string => typeof value === 'string' && value !== null)
    return [...new Set(values)]
  }

  const getUniqueLastNames = () => getUniqueValues('last_name')
  const getUniqueFirstNames = () => getUniqueValues('first_name')
  const getUniqueContactNumbers = () => getUniqueValues('contact_number')
  const getUniqueEmails = () => getUniqueValues('email')

  // Handle filter changes
  const handleFilterChange = (category: keyof typeof filters, value: string) => {
    setFilters(prev => {
      const currentValues = prev[category]
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value]
      
      return {
        ...prev,
        [category]: newValues
      }
    })
  }

  const clearAllFilters = () => {
    setFilters({
      last_name: [],
      first_name: [],
      contact_number: [],
      email: [],
      tags: [],
      interest: [],
      hasInstruments: []
    })
  }

  // Handle column header click for sorting
  const handleColumnSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  // Get sort arrow icon
  const getSortArrow = (column: string) => {
    if (sortBy !== column) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    } else if (sortOrder === 'asc') {
      return (
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      )
    } else {
      return (
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )
    }
  }

  // Enhanced filtering logic
  const filteredClients = clients
    .filter(client => {
      // Text search
      const matchesSearch = searchTerm === '' || 
        (client.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        (client.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        (client.email?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        (client.contact_number?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
      
      // Last name filter
      const matchesLastName = filters.last_name.length === 0 || (client.last_name && filters.last_name.includes(client.last_name))
      
      // First name filter
      const matchesFirstName = filters.first_name.length === 0 || (client.first_name && filters.first_name.includes(client.first_name))
      
      // Contact number filter
      const matchesContactNumber = filters.contact_number.length === 0 || (client.contact_number && filters.contact_number.includes(client.contact_number))
      
      // Email filter
      const matchesEmail = filters.email.length === 0 || (client.email && filters.email.includes(client.email))
      
      // Tags filter
      const matchesTags = filters.tags.length === 0 || 
        (client.tags && client.tags.some(tag => filters.tags.includes(tag)))
      
      // Interest filter
      const matchesInterest = filters.interest.length === 0 || 
        (client.interest && filters.interest.includes(client.interest))
      
      // Has instruments filter
      const hasInstruments = clientsWithInstruments.has(client.id)
      const matchesHasInstruments = filters.hasInstruments.length === 0 || 
        (filters.hasInstruments.includes('Has Instruments') && hasInstruments) ||
        (filters.hasInstruments.includes('No Instruments') && !hasInstruments)
      
      return matchesSearch && matchesLastName && matchesFirstName && matchesContactNumber && matchesEmail && matchesTags && matchesInterest && matchesHasInstruments
    })
    .sort((a, b) => {
      // Custom sorting for interest field
      if (sortBy === 'interest') {
        const interestOrder = ['Active', 'Passive', '', 'Inactive']
        const aValue = a.interest || ''
        const bValue = b.interest || ''
        const aIndex = interestOrder.indexOf(aValue)
        const bIndex = interestOrder.indexOf(bValue)
        
        if (sortOrder === 'asc') {
          return aIndex - bIndex
        } else {
          return bIndex - aIndex
        }
      }
      
      // Custom sorting for tags field
      if (sortBy === 'tags') {
        const aHasOwner = a.tags && a.tags.includes('Owner')
        const bHasOwner = b.tags && b.tags.includes('Owner')
        
        if (sortOrder === 'asc') {
          // Owners first, then others
          if (aHasOwner && !bHasOwner) return -1
          if (!aHasOwner && bHasOwner) return 1
          return 0
        } else {
          // Non-owners first, then owners
          if (aHasOwner && !bHasOwner) return 1
          if (!aHasOwner && bHasOwner) return -1
          return 0
        }
      }
      
      // Default sorting for other fields
      const aValue = a[sortBy as keyof Client]
      const bValue = b[sortBy as keyof Client]
      
      const aVal = aValue ?? 0
      const bVal = bValue ?? 0
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })

  // Tag management functions
  const addTag = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag])
      setFormData(prev => ({ ...prev, tags: [...prev.tags, tag] }))
    }
  }

  const removeTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag))
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))
  }

  // Tag color function
  const getTagColor = (tag: string) => {
    switch (tag) {
      case 'Musician': return 'bg-blue-100 text-blue-800'
      case 'Dealer': return 'bg-green-100 text-green-800'
      case 'Collector': return 'bg-purple-100 text-purple-800'
      case 'Owner': return 'bg-orange-100 text-orange-800'
      case 'Other': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // Status color function
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available': return 'bg-green-100 text-green-800'
      case 'Booked': return 'bg-yellow-100 text-yellow-800'
      case 'Sold': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const sortTags = (tags: string[]) => {
    return tags.sort((a, b) => {
      if (a === 'Owner') return -1
      if (b === 'Owner') return 1
      return a.localeCompare(b)
    })
  }



  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading clients...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* Collapsible Sidebar */}
      <div
        className={`bg-white shadow-lg transition-all duration-300 ease-in-out ${
          sidebarExpanded ? 'w-64' : 'w-1'
        } overflow-hidden`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div className="p-4">
          <div className="flex items-center mb-6">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className={`ml-3 text-lg font-semibold text-gray-900 transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Inventory App
            </span>
          </div>
        </div>
        
        <nav className="space-y-1">
          <Link href="/dashboard" className={`px-6 py-3 hover:bg-gray-50 cursor-pointer transition-all duration-300 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          } flex items-center`}>
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className={`ml-3 text-gray-700 transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Items
            </span>
          </Link>

          <Link href="/clients" className={`px-6 py-3 bg-blue-50 border-r-2 border-blue-500 transition-all duration-300 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          } flex items-center`}>
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className={`ml-3 text-blue-700 font-medium transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Clients
            </span>
          </Link>
          <Link href="/form" className={`px-6 py-3 hover:bg-gray-50 cursor-pointer transition-all duration-300 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          } flex items-center`}>
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className={`ml-3 text-gray-700 transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Connected Clients
            </span>
          </Link>
        </nav>
      </div>

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ease-in-out ${
        showModal || showViewModal ? 'mr-96' : 'mr-0'
      } bg-white`}>
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>

          {/* Search and Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-200">
            <div className="flex flex-wrap gap-4 items-center mb-4">
              <div className="flex-1 min-w-64">
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-500"
                />
              </div>
              <button
                data-filter-button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                </svg>
                Filters
              </button>
            </div>
            
            {/* Filter Panel */}
            {showFilters && (
              <div ref={filterPanelRef} className="border-t border-gray-200 pt-4 bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Last Name Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Last Name</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {getUniqueLastNames().map(lastName => (
                        <label key={lastName} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.last_name.includes(lastName)}
                            onChange={() => handleFilterChange('last_name', lastName)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{lastName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* First Name Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">First Name</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {getUniqueFirstNames().map(firstName => (
                        <label key={firstName} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.first_name.includes(firstName)}
                            onChange={() => handleFilterChange('first_name', firstName)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{firstName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Contact Number Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Contact Number</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {getUniqueContactNumbers().map(contactNumber => (
                        <label key={contactNumber} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.contact_number.includes(contactNumber)}
                            onChange={() => handleFilterChange('contact_number', contactNumber)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{contactNumber}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Email Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Email</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {getUniqueEmails().map(email => (
                        <label key={email} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.email.includes(email)}
                            onChange={() => handleFilterChange('email', email)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{email}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Tags Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Tags</h4>
                    <div className="space-y-2">
                      {['Owner', 'Musician', 'Dealer', 'Collector', 'Other'].map(tag => (
                        <label key={tag} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.tags.includes(tag)}
                            onChange={() => handleFilterChange('tags', tag)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{tag}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Interest Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Interest</h4>
                    <div className="space-y-2">
                      {['Active', 'Passive', 'Inactive'].map(interest => (
                        <label key={interest} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.interest.includes(interest)}
                            onChange={() => handleFilterChange('interest', interest)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{interest}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Has Instruments Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Instrument Connections</h4>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={filters.hasInstruments.includes('Has Instruments')}
                          onChange={() => handleFilterChange('hasInstruments', 'Has Instruments')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Has Instruments</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={filters.hasInstruments.includes('No Instruments')}
                          onChange={() => handleFilterChange('hasInstruments', 'No Instruments')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">No Instruments</span>
                      </label>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={clearAllFilters}
                    className="text-sm text-gray-600 hover:text-gray-800 underline"
                  >
                    Clear all filters
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Clients Table */}
          <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleColumnSort('last_name')}
                    >
                      <div className="flex items-center">
                        Last Name
                        {getSortArrow('last_name')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleColumnSort('first_name')}
                    >
                      <div className="flex items-center">
                        First Name
                        {getSortArrow('first_name')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleColumnSort('contact_number')}
                    >
                      <div className="flex items-center">
                        Contact
                        {getSortArrow('contact_number')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleColumnSort('email')}
                    >
                      <div className="flex items-center">
                        Email
                        {getSortArrow('email')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleColumnSort('tags')}
                    >
                      <div className="flex items-center">
                        Tags
                        {getSortArrow('tags')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleColumnSort('interest')}
                    >
                      <div className="flex items-center">
                        Interest
                        {getSortArrow('interest')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                        {searchTerm || Object.values(filters).some(f => f.length > 0) 
                          ? 'No clients match your search criteria' 
                          : 'No clients found'}
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client) => (
                      <tr
                        key={client.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleRowClick(client)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{client.last_name || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{client.first_name || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{client.contact_number || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{client.email || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1">
                            {client.tags && client.tags.length > 0 ? (
                              sortTags([...client.tags]).map((tag, index) => (
                                <span key={index} className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTagColor(tag)}`}>
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {client.interest || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Add Client Side Panel */}
      {showModal && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-40 border-l border-gray-200">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Add New Client</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Form */}
            <div className="flex-1 overflow-y-auto">
              <form onSubmit={handleSubmit} className="p-6 space-y-4 text-gray-900">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="Enter last name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input
                      type="text"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="Enter first name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                    <input
                      type="tel"
                      name="contact_number"
                      value={formData.contact_number}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="Enter contact number"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="Enter email address"
                    />
                  </div>
                  
                  {/* Tags Section */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                    <div className="space-y-2">
                      {['Owner', 'Musician', 'Dealer', 'Collector', 'Other'].map(tag => (
                        <label key={tag} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedTags.includes(tag)}
                            onChange={(e) => e.target.checked ? addTag(tag) : removeTag(tag)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{tag}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Interest Section - Conditional */}
                  {showInterestDropdown && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Interest</label>
                      <select
                        name="interest"
                        value={formData.interest}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      >
                        <option value="">Select Interest</option>
                        <option value="Active">Active</option>
                        <option value="Passive">Passive</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                    <textarea
                      name="note"
                      value={formData.note}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 resize-none"
                      placeholder="Add notes or additional information..."
                    />
                  </div>

                  {/* Instrument Connections Section */}
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <label className="block text-sm font-medium text-gray-700">Connect Instruments (Optional)</label>
                      <button
                        type="button"
                        onClick={() => setShowInstrumentSearchForNew(true)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Add Instrument
                      </button>
                    </div>
                    
                    {/* Instrument Search Section */}
                    {showInstrumentSearchForNew && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-sm font-medium text-gray-700">Search Instruments</h4>
                          <button
                            type="button"
                            onClick={() => {
                              setShowInstrumentSearchForNew(false)
                              setInstrumentSearchTermForNew('')
                              setSearchResultsForNew([])
                            }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <input
                              type="text"
                              placeholder="Search by maker or type..."
                              value={instrumentSearchTermForNew}
                              onChange={(e) => {
                                setInstrumentSearchTermForNew(e.target.value)
                                searchInstrumentsForNew(e.target.value)
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                          </div>
                          
                          {isSearchingInstrumentsForNew && (
                            <div className="text-center text-gray-500 text-sm">Searching...</div>
                          )}
                          
                          {searchResultsForNew.length > 0 && (
                            <div className="space-y-2">
                              <h5 className="text-xs font-medium text-gray-600">Results:</h5>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {searchResultsForNew.map((instrument) => (
                                  <div
                                    key={instrument.id}
                                    className="p-2 border border-gray-200 rounded-md hover:bg-white cursor-pointer bg-white"
                                    onClick={() => addInstrumentForNew(instrument)}
                                  >
                                    <div className="text-sm font-medium text-gray-900">
                                      {instrument.maker || 'Unknown Maker'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {instrument.type || 'Unknown Type'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Selected Instruments */}
                    {selectedInstrumentsForNew.length > 0 && (
                      <div className="mt-3">
                        <h5 className="text-xs font-medium text-gray-600 mb-2">Selected Instruments:</h5>
                        <div className="space-y-2">
                          {selectedInstrumentsForNew.map((item) => (
                            <div key={item.instrument.id} className="flex items-center justify-between p-2 bg-blue-50 rounded-md">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900">
                                  {item.instrument.maker || 'Unknown Maker'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {item.instrument.type || 'Unknown Type'}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeInstrumentForNew(item.instrument.id)}
                                className="ml-2 text-red-500 hover:text-red-700"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Submit Button */}
                <div className="pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Adding Client...' : 'Add Client'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* View/Edit Client Side Panel */}
      {showViewModal && selectedClient && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-40 border-l border-gray-200">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  {isEditing ? 'Edit Client' : 'Client Details'}
                </h3>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {isEditing ? (
                <div className="flex-1 overflow-y-auto">
                  <form className="p-6 space-y-4 text-gray-900">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                        <input
                          type="text"
                          name="last_name"
                          value={viewFormData.last_name}
                          onChange={handleViewInputChange}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                          placeholder="Enter last name"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                        <input
                          type="text"
                          name="first_name"
                          value={viewFormData.first_name}
                          onChange={handleViewInputChange}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                          placeholder="Enter first name"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                        <input
                          type="tel"
                          name="contact_number"
                          value={viewFormData.contact_number}
                          onChange={handleViewInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                          placeholder="Enter contact number"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          name="email"
                          value={viewFormData.email}
                          onChange={handleViewInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                          placeholder="Enter email address"
                        />
                      </div>
                      
                      {/* Tags Section */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                        <div className="space-y-2">
                          {['Owner', 'Musician', 'Dealer', 'Collector', 'Other'].map(tag => (
                            <label key={tag} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={viewFormData.tags.includes(tag)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    if (!viewFormData.tags.includes(tag)) {
                                      setViewFormData(prev => ({ ...prev, tags: [...prev.tags, tag] }))
                                    }
                                  } else {
                                    setViewFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))
                                  }
                                }}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <span className="ml-2 text-sm text-gray-700">{tag}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      
                      {/* Interest Section - Conditional */}
                      {showInterestDropdown && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Interest</label>
                          <select
                            name="interest"
                            value={viewFormData.interest}
                            onChange={handleViewInputChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                          >
                            <option value="">Select Interest</option>
                            <option value="Active">Active</option>
                            <option value="Passive">Passive</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </div>
                      )}
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                        <textarea
                          name="note"
                          value={viewFormData.note}
                          onChange={handleViewInputChange}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 resize-none"
                          placeholder="Add notes or additional information..."
                        />
                      </div>

                      {/* Instrument Connections Section */}
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <div className="flex justify-between items-center mb-3">
                          <label className="block text-sm font-medium text-gray-700">Connect Instruments (Optional)</label>
                          <button
                            type="button"
                            onClick={() => setShowInstrumentSearch(true)}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                          >
                            Add Instrument
                          </button>
                        </div>
                        
                        {/* Instrument Search Section */}
                        {showInstrumentSearch && (
                          <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-medium text-gray-700">Search Instruments</h4>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowInstrumentSearch(false)
                                  setInstrumentSearchTerm('')
                                  setSearchResults([])
                                }}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            
                            <div className="space-y-3">
                              <div>
                                <input
                                  type="text"
                                  placeholder="Search by maker or type..."
                                  value={instrumentSearchTerm}
                                  onChange={(e) => {
                                    setInstrumentSearchTerm(e.target.value)
                                    searchInstruments(e.target.value)
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                              </div>
                              
                              {isSearchingInstruments && (
                                <div className="text-center text-gray-500 text-sm">Searching...</div>
                              )}
                              
                              {searchResults.length > 0 && (
                                <div className="space-y-2">
                                  <h5 className="text-xs font-medium text-gray-600">Results:</h5>
                                  <div className="max-h-32 overflow-y-auto space-y-1">
                                    {searchResults.map((instrument) => (
                                      <div
                                        key={instrument.id}
                                        className="p-2 border border-gray-200 rounded-md hover:bg-white cursor-pointer bg-white"
                                        onClick={() => addInstrumentRelationship(instrument.id)}
                                      >
                                        <div className="text-sm font-medium text-gray-900">
                                          {instrument.maker || 'Unknown Maker'}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {instrument.type || 'Unknown Type'}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {instrumentSearchTerm.length >= 2 && searchResults.length === 0 && !isSearchingInstruments && (
                                <div className="text-center text-gray-500 text-sm">No instruments found</div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Selected Instruments */}
                        {instrumentRelationships.length > 0 ? (
                          <div className="space-y-2">
                            {instrumentRelationships.map((relationship) => (
                              <div key={relationship.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200">
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-gray-900">
                                    {relationship.instrument?.maker || 'Unknown Maker'}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {relationship.instrument?.type || 'Unknown Type'}
                                  </div>
                                  <div className="text-xs text-blue-600">
                                    {relationship.relationship_type}
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeInstrumentRelationship(relationship.id)}
                                  className="text-red-500 hover:text-red-700"
                                  title="Remove instrument"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-gray-500 py-4 text-sm border-2 border-dashed border-gray-200 rounded-md">
                            No instruments connected to this client
                          </div>
                        )}
                      </div>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  {/* Client Details */}
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Last Name:</span>
                      <span className="text-gray-900">{selectedClient.last_name || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">First Name:</span>
                      <span className="text-gray-900">{selectedClient.first_name || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Contact Number:</span>
                      <span className="text-gray-900">{selectedClient.contact_number || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Email:</span>
                      <span className="text-gray-900">{selectedClient.email || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Tags:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedClient.tags && selectedClient.tags.length > 0 ? (
                          sortTags([...selectedClient.tags]).map((tag, index) => (
                            <span key={index} className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTagColor(tag)}`}>
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Interest:</span>
                      <span className="text-gray-900">{selectedClient.interest || '-'}</span>
                    </div>
                    {selectedClient.note && (
                      <div className="flex justify-between">
                        <span className="font-semibold text-gray-700">Note:</span>
                        <span className="text-gray-900 text-sm max-w-xs text-right">{selectedClient.note}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Owned Items Section */}
                  {selectedClient.tags && selectedClient.tags.includes('Owner') && (
                    <div className="pt-4 border-t border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-sm font-medium text-gray-700">Owned Items</h4>
                      </div>
                      
                      {loadingOwnedItems ? (
                        <div className="text-center text-gray-500 text-sm">Loading owned items...</div>
                      ) : ownedItems.length > 0 ? (
                        <div className="space-y-2">
                          {ownedItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-3 bg-green-50 rounded-md border border-green-200">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900">
                                  {item.maker || 'Unknown Maker'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {item.type || 'Unknown Type'}
                                </div>
                                <div className="text-xs text-green-600">
                                  ${item.price ? item.price.toLocaleString() : '0'}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(item.status)}`}>
                                  {item.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-gray-500 py-4 text-sm border-2 border-dashed border-gray-200 rounded-md">
                          No items owned by this client
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Instrument Relationships */}
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-medium text-gray-700">Connected Instruments</h4>
                      <button
                        onClick={() => setShowInstrumentSearch(true)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Add Instrument
                      </button>
                    </div>
                    
                    {/* Instrument Search */}
                    {showInstrumentSearch && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                        <div className="flex justify-between items-center mb-3">
                          <h5 className="text-sm font-medium text-gray-700">Search Instruments</h5>
                          <button
                            onClick={() => {
                              setShowInstrumentSearch(false)
                              setInstrumentSearchTerm('')
                              setSearchResults([])
                            }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        
                        <div className="space-y-3">
                          <input
                            type="text"
                            placeholder="Search by maker or type..."
                            value={instrumentSearchTerm}
                            onChange={(e) => {
                              setInstrumentSearchTerm(e.target.value)
                              searchInstruments(e.target.value)
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                          
                          {isSearchingInstruments && (
                            <div className="text-center text-gray-500 text-sm">Searching...</div>
                          )}
                          
                          {searchResults.length > 0 && (
                            <div className="space-y-2">
                              <h6 className="text-xs font-medium text-gray-600">Results:</h6>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {searchResults.map((instrument) => (
                                  <div
                                    key={instrument.id}
                                    className="p-2 border border-gray-200 rounded-md hover:bg-white cursor-pointer bg-white"
                                    onClick={() => addInstrumentRelationship(instrument.id)}
                                  >
                                    <div className="text-sm font-medium text-gray-900">
                                      {instrument.maker || 'Unknown Maker'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {instrument.type || 'Unknown Type'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Connected Instruments List */}
                    <div className="space-y-2">
                      {instrumentRelationships.length === 0 ? (
                        <p className="text-gray-500 text-sm">No instruments connected to this client.</p>
                      ) : (
                        instrumentRelationships.map((relationship) => (
                          <div key={relationship.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">
                                {relationship.instrument?.maker || 'Unknown Maker'}
                              </div>
                              <div className="text-xs text-gray-500">
                                {relationship.instrument?.type || 'Unknown Type'}
                              </div>
                              <div className="text-xs text-blue-600">
                                {relationship.relationship_type}
                              </div>
                            </div>
                            <button
                              onClick={() => removeInstrumentRelationship(relationship.id)}
                              className="ml-2 text-red-500 hover:text-red-700"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Footer (Edit button in detail view) */}
              <div className="p-6 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={handleDeleteClient}
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    {submitting ? 'Deleting...' : 'Remove'}
                  </button>
                  
                  <div className="flex space-x-3">
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Edit Client
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleUpdate}
                          disabled={submitting}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                          {submitting ? 'Updating...' : 'Update Client'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 