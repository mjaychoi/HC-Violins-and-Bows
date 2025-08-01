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
  type: 'Musician' | 'Dealer' | 'Collector' | 'Regular'
  status: 'Active' | 'Browsing' | 'In Negotiation' | 'Inactive'
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
    type: 'Regular' as Client['type'],
    status: 'Active' as Client['status'],
    note: ''
  })

  const [viewFormData, setViewFormData] = useState({
    last_name: '',
    first_name: '',
    contact_number: '',
    email: '',
    type: 'Regular' as Client['type'],
    status: 'Active' as Client['status'],
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
    type: [] as string[],
    status: [] as string[],
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
      
      // Reset form and close modal
      setFormData({
        last_name: '',
        first_name: '',
        contact_number: '',
        email: '',
        type: 'Regular',
        status: 'Active',
        note: ''
      })
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
          type: viewFormData.type,
          status: viewFormData.status,
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
      type: client.type,
      status: client.status,
      note: client.note || ''
    })
    setIsEditing(false)
    setShowViewModal(true)
    
    // Fetch instrument relationships for this client
    fetchInstrumentRelationships(client.id)
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
  const getUniqueTypes = () => getUniqueValues('type')
  const getUniqueStatuses = () => getUniqueValues('status')

  // Handle filter changes
  const handleFilterChange = (category: keyof typeof filters, value: string) => {
    setFilters(prev => {
      const currentValues = prev[category] as string[]
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
      type: [],
      status: [],
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
      
      // Type filter
      const matchesType = filters.type.length === 0 || filters.type.includes(client.type)
      
      // Status filter
      const matchesStatus = filters.status.length === 0 || filters.status.includes(client.status)
      
      // Has instruments filter
      const hasInstruments = clientsWithInstruments.has(client.id)
      const matchesHasInstruments = filters.hasInstruments.length === 0 || 
        (filters.hasInstruments.includes('Has Instruments') && hasInstruments) ||
        (filters.hasInstruments.includes('No Instruments') && !hasInstruments)
      
      return matchesSearch && matchesLastName && matchesFirstName && matchesContactNumber && matchesEmail && matchesType && matchesStatus && matchesHasInstruments
    })
    .sort((a, b) => {
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-800'
      case 'Browsing': return 'bg-blue-100 text-blue-800'
      case 'In Negotiation': return 'bg-yellow-100 text-yellow-800'
      case 'Inactive': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Musician': return 'bg-purple-100 text-purple-800'
      case 'Dealer': return 'bg-indigo-100 text-indigo-800'
      case 'Collector': return 'bg-orange-100 text-orange-800'
      case 'Regular': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
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
        <div className="p-6">
          <h1 className={`text-xl font-bold text-gray-900 transition-opacity duration-300 ${
            sidebarExpanded ? 'opacity-100' : 'opacity-0'
          }`}>
            Menu
          </h1>
        </div>
        <nav className="mt-6">
          <Link href="/dashboard" className={`px-6 py-3 hover:bg-gray-50 cursor-pointer transition-all duration-300 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          } flex items-center`}>
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className={`ml-3 text-gray-700 transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Instruments
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
          <div className={`px-6 py-3 hover:bg-gray-50 cursor-pointer transition-all duration-300 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          } flex items-center`}>
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className={`ml-3 text-gray-700 transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Forms
            </span>
          </div>
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
                  
                  {/* Type Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Type</h4>
                    <div className="space-y-2">
                      {['Musician', 'Dealer', 'Collector', 'Regular'].map(type => (
                        <label key={type} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.type.includes(type)}
                            onChange={() => handleFilterChange('type', type)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Status Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Status</h4>
                    <div className="space-y-2">
                      {['Active', 'Browsing', 'In Negotiation', 'Inactive'].map(status => (
                        <label key={status} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.status.includes(status)}
                            onChange={() => handleFilterChange('status', status)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{status}</span>
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
                
                {/* Clear Filters Button */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={clearAllFilters}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    Clear All Filters
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Customers Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('last_name')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Last Name</span>
                        {getSortArrow('last_name')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('first_name')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>First Name</span>
                        {getSortArrow('first_name')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('contact_number')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Contact Number</span>
                        {getSortArrow('contact_number')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('email')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Email</span>
                        {getSortArrow('email')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('type')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Type</span>
                        {getSortArrow('type')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('status')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Status</span>
                        {getSortArrow('status')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">Loading clients...</td>
                    </tr>
                  ) : filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">No clients found.</td>
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
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(client.type)}`}>{client.type}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(client.status)}`}>{client.status}</span>
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

      {/* Add Customer Side Panel */}
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
              <form className="p-6 space-y-4 text-gray-900">
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
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    >
                      <option value="Regular">Regular</option>
                      <option value="Musician">Musician</option>
                      <option value="Dealer">Dealer</option>
                      <option value="Collector">Collector</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    >
                      <option value="Active">Active</option>
                      <option value="Browsing">Browsing</option>
                      <option value="In Negotiation">In Negotiation</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  
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
                </div>
              </form>
            </div>
            
            {/* Footer */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Client'}
                </button>
              </div>
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
                  onClick={() => {
                    setShowViewModal(false)
                    setSelectedClient(null)
                    setIsEditing(false)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Detail View (not edit mode) */}
            {!isEditing && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Info Card */}
                <div className="bg-white rounded-lg p-4 shadow border border-gray-200 space-y-3">
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Last Name:</span>
                    <span className="text-gray-900">{viewFormData.last_name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">First Name:</span>
                    <span className="text-gray-900">{viewFormData.first_name || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Contact Number:</span>
                    <span className="text-gray-900">{viewFormData.contact_number || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Email:</span>
                    <span className="text-gray-900">{viewFormData.email || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Type:</span>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(viewFormData.type)}`}>{viewFormData.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Status:</span>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(viewFormData.status)}`}>{viewFormData.status}</span>
                  </div>
                  {viewFormData.note && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="space-y-2">
                        <span className="font-semibold text-gray-700">Note:</span>
                        <div className="text-gray-900 bg-gray-50 p-3 rounded-md text-sm whitespace-pre-wrap">
                          {viewFormData.note}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Instrument Relationships Section */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold text-gray-700">Connected Instruments</span>
                      <button
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
                                    <div className="font-medium text-gray-900 text-sm">
                                      {instrument.maker} {instrument.type}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      Year: {instrument.year} • Price: ${instrument.price?.toLocaleString() || '0'}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                      Status: {instrument.status} • Size: {instrument.size}
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
                    
                    {/* Connected Instruments List */}
                    {instrumentRelationships.length > 0 ? (
                      <div className="space-y-2">
                        {instrumentRelationships.map((relationship) => (
                          <div key={relationship.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {relationship.instrument?.maker} {relationship.instrument?.type}
                              </div>
                              <div className="text-sm text-gray-500">
                                Year: {relationship.instrument?.year} • Price: ${relationship.instrument?.price?.toLocaleString() || '0'}
                              </div>
                              <div className="text-xs text-gray-400">
                                Status: {relationship.instrument?.status} • Size: {relationship.instrument?.size}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                relationship.relationship_type === 'Interested' ? 'bg-blue-100 text-blue-800' :
                                relationship.relationship_type === 'Sold' ? 'bg-green-100 text-green-800' :
                                relationship.relationship_type === 'Booked' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-purple-100 text-purple-800'
                              }`}>
                                {relationship.relationship_type}
                              </span>
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
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-4">
                        No instruments connected to this client
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Edit Mode */}
            {isEditing && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      name="type"
                      value={viewFormData.type}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    >
                      <option value="Regular">Regular</option>
                      <option value="Musician">Musician</option>
                      <option value="Dealer">Dealer</option>
                      <option value="Collector">Collector</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      name="status"
                      value={viewFormData.status}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    >
                      <option value="Active">Active</option>
                      <option value="Browsing">Browsing</option>
                      <option value="In Negotiation">In Negotiation</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  
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
                </div>
              </div>
            )}
            
            {/* Footer */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex justify-end space-x-3">
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
      )}
    </div>
  )
} 