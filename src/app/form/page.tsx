'use client'

import Link from 'next/link'
import { ClientInstrument } from '@/types'
import { useConnections, useConnectionForm } from './hooks'
import { filterConnections, filterClients, filterInstruments, getRelationshipColor } from './utils'
import { ConnectionModal, ConnectionSearch } from './components'
import { logError } from '@/utils/logger'
// import { classNames } from '@/utils/classNames'
import { useSidebarState } from '@/hooks/useSidebarState'

export default function ConnectedClientsPage() {
  // Custom hooks
  const {
    clients,
    items,
    connections,
    loading,
    submitting,
    createConnection,
    deleteConnection
  } = useConnections()

  const {
    showConnectionModal,
    selectedClient,
    selectedInstrument,
    relationshipType,
    connectionNotes,
    clientSearchTerm,
    instrumentSearchTerm,
    connectionSearchTerm,
    setSelectedClient,
    setSelectedInstrument,
    setRelationshipType,
    setConnectionNotes,
    setClientSearchTerm,
    setInstrumentSearchTerm,
    setConnectionSearchTerm,
    openModal,
    closeModal
  } = useConnectionForm()

  // Filter connections
  const filteredConnections = filterConnections(connections, connectionSearchTerm)
  const filteredClients = filterClients(clients, clientSearchTerm)
  const filteredItems = filterInstruments(items, instrumentSearchTerm)

  const handleCreateConnection = async (clientId: string, itemId: string, relationshipType: 'Booked' | 'Sold' | 'Interested' | 'Owned', notes: string) => {
    try {
      await createConnection(clientId, itemId, relationshipType, notes)
    } catch (error) {
      logError('Error creating connection', error, 'ConnectedClientsPage')
      alert('Failed to create connection')
    }
  }

  const handleDeleteConnection = async (connectionId: string) => {
    try {
      await deleteConnection(connectionId)
    } catch (error) {
      logError('Error deleting connection', error, 'ConnectedClientsPage')
      alert('Failed to delete connection')
    }
  }

  const { 
    isExpanded: sidebarExpanded, 
    toggleSidebar 
  } = useSidebarState()

  return (
    <div className="min-h-screen bg-white flex">
      {/* Collapsible Sidebar */}
      <div 
        className={`bg-white shadow-lg transition-all duration-300 ease-in-out ${
          sidebarExpanded ? 'w-64' : 'w-1'
        } overflow-hidden`}
        onMouseEnter={() => toggleSidebar()}
        onMouseLeave={() => toggleSidebar()}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className={`ml-3 text-gray-700 transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Items
            </span>
          </Link>
          <Link href="/clients" className={`px-6 py-3 hover:bg-gray-50 cursor-pointer transition-all duration-300 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          } flex items-center`}>
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className={`ml-3 text-gray-700 transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Clients
            </span>
          </Link>
          <Link href="/form" className={`px-6 py-3 bg-blue-50 border-r-2 border-blue-500 transition-all duration-300 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          } flex items-center`}>
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className={`ml-3 text-blue-700 font-medium transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Connected Clients
            </span>
          </Link>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-white">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Connected Clients</h2>
            <div className="text-sm text-gray-500">
              Manage client-item relationships
            </div>
          </div>

          {/* Action Bar */}
        <div className="mb-6 flex justify-end">
          <button
            onClick={openModal}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Create Connection
          </button>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <ConnectionSearch
            searchTerm={connectionSearchTerm}
            onSearchChange={setConnectionSearchTerm}
            placeholder="Search connections by client name, item, or relationship type..."
          />
        </div>

        {/* Connections List */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Client-Item Connections
            </h3>
            
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="text-gray-500">Loading connections...</div>
              </div>
            ) : filteredConnections.length === 0 ? (
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No connections</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating your first client-item connection.</p>
                <div className="mt-6">
                  <button
                    onClick={openModal}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Create Connection
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden">
                <ul className="divide-y divide-gray-200">
                  {filteredConnections.map((connection) => (
                    <li key={connection.id} className="px-4 py-4 transition-colors duration-150 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-6">
                          {/* Client Info */}
                          <div className="flex items-center">
                            <div className="flex-shrink-0">
                              <div className="w-8 h-8 rounded-md flex items-center justify-center bg-blue-50">
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {connection.client?.first_name} {connection.client?.last_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {connection.client?.email} • {connection.client?.tags && connection.client.tags.length > 0 ? connection.client.tags.sort((a, b) => {
                                  if (a === 'Owner') return -1
                                  if (b === 'Owner') return 1
                                  return a.localeCompare(b)
                                }).join(', ') : 'No tags'}
                              </div>
                            </div>
                          </div>

                          {/* Connection Arrow */}
                          <div className="flex items-center">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" />
                            </svg>
                          </div>

                          {/* Item Info */}
                          <div className="flex items-center">
                            <div className="flex-shrink-0">
                              <div className="w-8 h-8 rounded-md flex items-center justify-center bg-green-50">
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                </svg>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {connection.instrument?.maker} {connection.instrument?.type}
                              </div>
                              <div className="text-sm text-gray-500">
                                Year: {connection.instrument?.year || '-'} • Type: {connection.instrument?.type || '-'}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          {/* Relationship Type */}
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRelationshipColor(connection.relationship_type)}`}>
                            {connection.relationship_type}
                          </span>

                          {/* Notes */}
                          {connection.notes && (
                            <div className="text-xs text-gray-500 max-w-xs truncate" title={connection.notes}>
                              {connection.notes}
                            </div>
                          )}

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteConnection(connection.id)}
                            className="text-red-500 hover:text-red-700"
                            title="Delete connection"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Connection Modal */}
      {showConnectionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Create New Connection
                </h3>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault()
                if (selectedClient && selectedInstrument) {
                  handleCreateConnection(selectedClient, selectedInstrument, relationshipType, connectionNotes)
                }
              }} className="space-y-4">
                {/* Client Selection */}
                <div>
                  <label htmlFor="client" className="block text-sm font-medium text-gray-700">
                    Select Client
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      placeholder="Search clients..."
                      value={clientSearchTerm}
                      onChange={(e) => setClientSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    id="client"
                    value={selectedClient}
                    onChange={(e) => setSelectedClient(e.target.value)}
                    required
                    className="mt-2 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose a client</option>
                      {filteredClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.first_name} {client.last_name} ({client.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Item Selection */}
                <div>
                  <label htmlFor="instrument" className="block text-sm font-medium text-gray-700">
                    Select Item
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={instrumentSearchTerm}
                      onChange={(e) => setInstrumentSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    id="instrument"
                    value={selectedInstrument}
                    onChange={(e) => setSelectedInstrument(e.target.value)}
                    required
                    className="mt-2 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose an item</option>
                    {filteredItems.map((instrument) => (
                      <option key={instrument.id} value={instrument.id}>
                        {instrument.maker} {instrument.type} ({instrument.year})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Relationship Type */}
                <div>
                  <label htmlFor="relationship" className="block text-sm font-medium text-gray-700">
                    Relationship Type
                  </label>
                  <select
                    id="relationship"
                    value={relationshipType}
                    onChange={(e) => setRelationshipType(e.target.value as ClientInstrument['relationship_type'])}
                    required
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Interested">Interested</option>
                    <option value="Booked">Booked</option>
                    <option value="Sold">Sold</option>
                    <option value="Owned">Owned</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                    Notes (Optional)
                  </label>
                  <textarea
                    id="notes"
                    value={connectionNotes}
                    onChange={(e) => setConnectionNotes(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add any additional notes about this connection..."
                  />
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {submitting ? 'Creating...' : 'Create Connection'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Connection Modal */}
      <ConnectionModal
        isOpen={showConnectionModal}
        onClose={closeModal}
        onSubmit={handleCreateConnection}
        clients={clients}
        items={items}
        selectedClient={selectedClient}
        selectedInstrument={selectedInstrument}
        relationshipType={relationshipType}
        connectionNotes={connectionNotes}
        onClientChange={setSelectedClient}
        onInstrumentChange={setSelectedInstrument}
        onRelationshipTypeChange={setRelationshipType}
        onNotesChange={setConnectionNotes}
        clientSearchTerm={clientSearchTerm}
        onClientSearchChange={setClientSearchTerm}
        instrumentSearchTerm={instrumentSearchTerm}
        onInstrumentSearchChange={setInstrumentSearchTerm}
        submitting={submitting}
      />
    </div>
  )
}