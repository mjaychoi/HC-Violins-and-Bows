'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Item {
  id: string
  maker: string
  name: string
  year: number
}

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

interface ClientInstrument {
  id: string
  client_id: string
  instrument_id: string
  relationship_type: 'Interested' | 'Sold' | 'Booked' | 'Owned'
  notes: string | null
  created_at: string
}

export default function InstrumentsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    maker: '',
    name: '',
    year: ''
  })
  const [submitting, setSubmitting] = useState(false)

  // New instrument client connection states
  const [showClientSearchForNew, setShowClientSearchForNew] = useState(false)
  const [clientSearchTermForNew, setClientSearchTermForNew] = useState('')
  const [searchResultsForNew, setSearchResultsForNew] = useState<Client[]>([])
  const [isSearchingClientsForNew, setIsSearchingClientsForNew] = useState(false)
  const [selectedClientsForNew, setSelectedClientsForNew] = useState<Array<{client: Client, relationshipType: ClientInstrument['relationship_type']}>>([])

  useEffect(() => {
    fetchInstruments()
  }, [])

  const fetchInstruments = async () => {
    try {
      const { data, error } = await supabase
        .from('instruments')
        .select('id, maker, name, year')
        .order('created_at', { ascending: false })
      if (error) throw error
      setItems(data || [])
    } catch (error) {
      console.error('Error fetching instruments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    
    try {
      const { data, error } = await supabase
        .from('instruments')
        .insert([
          {
            maker: formData.maker,
            name: formData.name,
            year: parseInt(formData.year)
          }
        ])
        .select()

      if (error) throw error

      // Add client connections if any were selected
      if (selectedClientsForNew.length > 0 && data && data[0]) {
        const instrumentId = data[0].id
        const connections = selectedClientsForNew.map(item => ({
          client_id: item.client.id,
          instrument_id: instrumentId,
          relationship_type: item.relationshipType
        }))

        const { error: connectionError } = await supabase
          .from('client_instruments')
          .insert(connections)

        if (connectionError) {
          console.error('Error adding client connections:', connectionError)
          // Don't throw here, instrument was created successfully
        }
      }
      
      // Reset form and close modal
      setFormData({ maker: '', name: '', year: '' })
      setSelectedClientsForNew([])
      setShowClientSearchForNew(false)
      setClientSearchTermForNew('')
      setSearchResultsForNew([])
      setShowModal(false)
      
      // Refresh the items list
      await fetchInstruments()
    } catch (error) {
      console.error('Error adding instrument:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const searchClientsForNew = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResultsForNew([])
      return
    }

    setIsSearchingClientsForNew(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .or(`last_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%`)
        .limit(10)
      
      if (error) throw error
      // Filter out clients already selected to prevent duplicate display
      const selectedIds = new Set(selectedClientsForNew.map(sc => sc.client.id))
      const filtered = (data || []).filter(c => !selectedIds.has(c.id))
      setSearchResultsForNew(filtered)
    } catch (error) {
      console.error('Error searching clients:', error)
      setSearchResultsForNew([])
    } finally {
      setIsSearchingClientsForNew(false)
    }
  }

  const addClientForNew = (client: Client, relationshipType: ClientInstrument['relationship_type'] = 'Interested') => {
    setSelectedClientsForNew(prev => {
      if (prev.some(p => p.client.id === client.id)) return prev
      return [...prev, { client, relationshipType }]
    })
    setShowClientSearchForNew(false)
    setClientSearchTermForNew('')
    setSearchResultsForNew([])
  }

  const removeClientForNew = (clientId: string) => {
    setSelectedClientsForNew(prev => prev.filter(item => item.client.id !== clientId))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">
              Instruments
            </h1>
            <div className="text-sm text-gray-500">
              Your Instrument Collection
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Action Bar */}
        <div className="mb-6">
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0l6-3m-6 3H6" />
            </svg>
            Add New Instrument
          </button>
        </div>

        {/* Instruments List */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              All Instruments
            </h3>
            
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="text-gray-500">Loading items...</div>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No instruments</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by adding your first instrument.</p>
                <div className="mt-6">
                  <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Instrument
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden">
                <ul className="divide-y divide-gray-200">
                  {items.map((item) => (
                    <li key={item.id} className="px-4 py-4 transition-colors duration-150 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 rounded-md flex items-center justify-center bg-blue-50">
                              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                              </svg>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {item.maker} - {item.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              Year: {item.year}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Link 
                            href={`/instruments/${item.id}`}
                            className="text-blue-600 hover:text-blue-500 text-sm font-medium"
                          >
                            View Details
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Add New Instrument
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="maker" className="block text-sm font-medium text-gray-700">
                    Maker
                  </label>
                  <input
                    type="text"
                    id="maker"
                    name="maker"
                    value={formData.maker}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Gibson, Fender, Yamaha"
                  />
                </div>
                
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Les Paul Standard, Grand Piano, Stradivarius Violin"
                  />
                </div>
                
                <div>
                  <label htmlFor="year" className="block text-sm font-medium text-gray-700">
                    Year
                  </label>
                  <input
                    type="number"
                    id="year"
                    name="year"
                    value={formData.year}
                    onChange={handleInputChange}
                    required
                    min="1900"
                    max={new Date().getFullYear()}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 2020"
                  />
                </div>

                {/* Client Connections Section */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-gray-700">Connect Clients (Optional)</label>
                    <button
                      type="button"
                      onClick={() => setShowClientSearchForNew(true)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Add Client
                    </button>
                  </div>
                  
                  {/* Client Search Section */}
                  {showClientSearchForNew && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-sm font-medium text-gray-700">Search Clients</h4>
                        <button
                          type="button"
                          onClick={() => {
                            setShowClientSearchForNew(false)
                            setClientSearchTermForNew('')
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
                            placeholder="Search by first or last name..."
                            value={clientSearchTermForNew}
                            onChange={(e) => {
                              setClientSearchTermForNew(e.target.value)
                              searchClientsForNew(e.target.value)
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>
                        
                        {isSearchingClientsForNew && (
                          <div className="text-center text-gray-500 text-sm">Searching...</div>
                        )}
                        
                        {searchResultsForNew.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-medium text-gray-600">Results:</h5>
                            <div className="max-h-32 overflow-y-auto space-y-1">
                        {searchResultsForNew
                          .filter(client => !selectedClientsForNew.some(sc => sc.client.id === client.id))
                          .map((client) => (
                                <div
                                  key={client.id}
                                  className="p-2 border border-gray-200 rounded-md hover:bg-white cursor-pointer bg-white"
                                  onClick={() => addClientForNew(client)}
                                >
                                  <div className="font-medium text-gray-900 text-sm">
                                    {client.first_name} {client.last_name}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {client.email} • {client.contact_number}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {client.type} • {client.status}
                                  </div>
                                </div>
                        ))}
                            </div>
                          </div>
                        )}
                        
                        {clientSearchTermForNew.length >= 2 && searchResultsForNew.length === 0 && !isSearchingClientsForNew && (
                          <div className="text-center text-gray-500 text-sm">No clients found</div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Selected Clients List */}
                  {selectedClientsForNew.length > 0 ? (
                    <div className="space-y-2">
                      {selectedClientsForNew.map((item) => (
                        <div key={item.client.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {item.client.first_name} {item.client.last_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {item.client.email} • {item.client.contact_number}
                            </div>
                            <div className="text-xs text-gray-400">
                              {item.client.type} • {item.client.status}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <select
                              value={item.relationshipType}
                              onChange={(e) => {
                                setSelectedClientsForNew(prev => 
                                  prev.map(selected => 
                                    selected.client.id === item.client.id 
                                      ? { ...selected, relationshipType: e.target.value as ClientInstrument['relationship_type'] }
                                      : selected
                                  )
                                )
                              }}
                              className="text-xs border border-gray-300 rounded px-2 py-1"
                            >
                              <option value="Interested">Interested</option>
                              <option value="Booked">Booked</option>
                              <option value="Sold">Sold</option>
                              <option value="Owned">Owned</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => removeClientForNew(item.client.id)}
                              className="text-red-500 hover:text-red-700"
                              title="Remove client"
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
                    <div className="text-center text-gray-500 py-4 text-sm">
                      No clients connected to this instrument
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {submitting ? 'Adding...' : 'Add Instrument'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 