"use client"
// src/app/clients/page.tsx
import Link from 'next/link'
import { Client, ClientInstrument } from '@/types'
import { useClients, useClientInstruments, useFilters, useClientView, useInstrumentSearch, useOwnedItems } from './hooks'
import { ClientForm, ClientList, ClientFilters, ClientModal } from './components'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { logError } from '@/utils/logger'
import { useModalState } from '@/hooks/useModalState'
import { useSidebarState } from '@/hooks/useSidebarState'

export default function ClientsPage() {
  // Error handling
  const { ErrorToasts } = useErrorHandler()
  
  // Custom hooks
  const { 
    clients, 
    loading, 
    submitting, 
    createClient, 
    updateClient, 
    removeClient 
  } = useClients()
  
  const { 
    instrumentRelationships, 
    clientsWithInstruments, 
    addInstrumentRelationship: addInstrumentRelationshipHook, 
    removeInstrumentRelationship: removeInstrumentRelationshipHook,
    fetchInstrumentRelationships
  } = useClientInstruments()
  
  const { 
    searchTerm, 
    setSearchTerm, 
    showFilters, 
    setShowFilters, 
    filters, 
    filteredClients, 
    filterOptions, 
    handleFilterChange, 
    clearAllFilters, 
    handleColumnSort, 
    getSortArrow, 
    getActiveFiltersCount 
  } = useFilters(clients, clientsWithInstruments)

  // UI states using common hooks
  const { 
    isOpen: showModal, 
    openModal, 
    closeModal, 
  } = useModalState()
  
  const { 
    isExpanded: sidebarExpanded, 
    toggleSidebar 
  } = useSidebarState()

  // Custom hooks for specific functionality
  const {
    showViewModal,
    selectedClient,
    isEditing,
    showInterestDropdown,
    viewFormData,
    openClientView,
    closeClientView,
    startEditing,
    stopEditing,
    updateViewFormData,
    handleViewInputChange
  } = useClientView()

  const {
    showInstrumentSearch,
    instrumentSearchTerm,
    searchResults,
    isSearchingInstruments,
    openInstrumentSearch,
    closeInstrumentSearch,
    handleInstrumentSearch
  } = useInstrumentSearch()

  const {
    ownedItems,
    loadingOwnedItems,
    fetchOwnedItems,
    clearOwnedItems
  } = useOwnedItems()

  // Toggle instrument search
  const toggleInstrumentSearch = () => {
    if (showInstrumentSearch) closeInstrumentSearch()
    else openInstrumentSearch()
  }



  const handleSubmit = async (clientData: Omit<Client, 'id' | 'created_at'>) => {
    try {
      const newClient = await createClient(clientData)
      
      if (newClient) {
        closeModal()
      }
    } catch (error) {
      logError('Error adding client', error, 'ClientsPage')
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClient) return
    
    try {
      await updateClient(selectedClient.id, {
        last_name: viewFormData.last_name,
        first_name: viewFormData.first_name,
        contact_number: viewFormData.contact_number,
        email: viewFormData.email,
        tags: viewFormData.tags,
        interest: viewFormData.interest,
        note: viewFormData.note
      })
      
      stopEditing()
    } catch (error) {
      logError('Error updating client:', error)
    }
  }

  const handleDeleteClient = async () => {
    if (!selectedClient) return
    
    const confirmed = window.confirm('Are you sure you want to delete this client? This action cannot be undone.')
    if (!confirmed) return
    
    try {
      const success = await removeClient(selectedClient.id)
      
      if (success) {
        // Close modal
        closeClientView()
        // TODO: Replace with toast notification
        // alert('Client deleted successfully!')
      }
    } catch (error) {
      logError('Error deleting client:', error)
    }
  }


  const handleRowClick = (client: Client) => {
    openClientView(client)
    
    // Fetch instrument relationships for this client
    fetchInstrumentRelationships(client.id)
    
    // Fetch owned items if client has Owner tag
    if (client.tags && client.tags.includes('Owner')) {
      fetchOwnedItems(client)
    } else {
      clearOwnedItems()
    }
  }




  const addInstrumentRelationship = async (instrumentId: string, relationshipType: ClientInstrument['relationship_type'] = 'Interested') => {
    if (!selectedClient) return

    try {
      await addInstrumentRelationshipHook(selectedClient.id, instrumentId, relationshipType)
      
      // Refresh relationships
      await fetchInstrumentRelationships(selectedClient.id)
      closeInstrumentSearch()
    } catch (error) {
      logError('Error adding instrument relationship:', error)
    }
  }

  const removeInstrumentRelationship = async (relationshipId: string) => {
    try {
      await removeInstrumentRelationshipHook(relationshipId)
      
      // Refresh relationships
      if (selectedClient) {
        await fetchInstrumentRelationships(selectedClient.id)
      }
    } catch (error) {
      logError('Error removing instrument relationship:', error)
    }
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
        onMouseEnter={() => { if (!sidebarExpanded) toggleSidebar() }}
        onMouseLeave={() => { if (sidebarExpanded) toggleSidebar() }}
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
              onClick={openModal}
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
            <ClientFilters
              isOpen={showFilters}
              onClose={() => setShowFilters(false)}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              filters={filters}
              filterOptions={filterOptions}
              onFilterChange={(category: string, value: string) => handleFilterChange(category as keyof typeof filters, value)}
              onClearAllFilters={clearAllFilters}
              getActiveFiltersCount={getActiveFiltersCount}
            />

          </div>

          {/* Clients Table */}
          <ClientList
            clients={filteredClients}
            clientsWithInstruments={clientsWithInstruments}
            onClientClick={handleRowClick}
            onColumnSort={handleColumnSort}
            getSortArrow={getSortArrow}
          />
        </div>
      </div>

      {/* Add Client Form */}
      <ClientForm
        isOpen={showModal}
        onClose={closeModal}
        onSubmit={handleSubmit}
        submitting={submitting}
      />


      {/* View/Edit Client Modal */}
      <ClientModal
        isOpen={showViewModal}
        onClose={closeClientView}
        client={selectedClient}
        isEditing={isEditing}
        onEdit={startEditing}
        onSave={async (clientData: Partial<Client>) => {
          if (selectedClient) {
            await updateClient(selectedClient.id, clientData)
            stopEditing()
            // Update local view data
            updateViewFormData(clientData as Partial<typeof viewFormData>)
          }
        }}
        onDelete={handleDeleteClient}
        onCancel={stopEditing}
        submitting={submitting}
        instrumentRelationships={instrumentRelationships}
        onAddInstrument={addInstrumentRelationship}
        onRemoveInstrument={removeInstrumentRelationship}
        onSearchInstruments={handleInstrumentSearch}
        searchResults={searchResults as any}
        isSearchingInstruments={isSearchingInstruments}
        showInstrumentSearch={showInstrumentSearch}
        onToggleInstrumentSearch={toggleInstrumentSearch}
        instrumentSearchTerm={instrumentSearchTerm}
        onInstrumentSearchTermChange={handleInstrumentSearch}
      />


      {/* Error Toasts */}
      <ErrorToasts />
    </div>
  )
} 