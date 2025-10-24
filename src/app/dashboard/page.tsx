"use client"

import { useState, useEffect } from 'react'
import { Instrument } from '@/types'
import { useDashboardItems, useDashboardFilters, useDashboardForm } from './hooks'
import { ItemForm, ItemList, ItemFilters } from './components'
import { useModalState } from '@/hooks/useModalState'
import { useSidebarState } from '@/hooks/useSidebarState'
import { logError } from '@/utils/logger'
// import { classNames } from '@/utils/classNames'
import Button from '@/components/common/Button'
import Sidebar from '@/components/common/Sidebar'

export default function DashboardPage() {
  // Custom hooks for state management
  const {
    items,
    loading,
    submitting,
    clientRelationships,
    fetchItems,
    createItem,
    updateItem,
    deleteItem
  } = useDashboardItems()

  const {
    searchTerm,
    setSearchTerm,
    showFilters,
    setShowFilters,
    filters,
    filteredItems,
    handleFilterChange,
    handlePriceRangeChange,
    clearAllFilters,
    handleSort,
    getSortArrow,
    getActiveFiltersCount
  } = useDashboardFilters(items)

  const {
    resetForm,
  } = useDashboardForm()

  // Client search functionality (currently unused but available for future features)
  // const {
  //   showClientSearch,
  //   setShowClientSearch,
  //   clientSearchTerm,
  //   setClientSearchTerm,
  //   isSearchingClients,
  //   searchResults,
  //   selectedClientsForNew,
  //   setSelectedClientsForNew,
  //   showOwnershipSearch,
  //   setShowOwnershipSearch,
  //   ownershipSearchTerm,
  //   setOwnershipSearchTerm,
  //   isSearchingOwnership,
  //   ownershipSearchResults,
  //   selectedOwnershipClient,
  //   handleClientSearch,
  //   handleOwnershipSearch,
  //   addClientForNew,
  //   removeClientForNew,
  //   selectOwnershipClient,
  //   clearOwnershipClient
  // } = useDashboardClients()

  // Modal and sidebar states
  const {
    isOpen: showModal,
    isEditing,
    openModal,
    closeModal,
    openEditModal,
  } = useModalState()

  const {
    isExpanded: sidebarExpanded,
    toggleSidebar
  } = useSidebarState()

  // Additional states
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Instrument | null>(null)

  // Load data on component mount
  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Handle item creation
  const handleCreateItem = async (formData: Omit<Instrument, 'id' | 'created_at'>) => {
    try {
      await createItem(formData)
      closeModal()
      resetForm()
    } catch (error) {
      logError('Failed to create item', error, 'DashboardPage')
    }
  }

  // Handle item update
  const handleUpdateItem = async (formData: Omit<Instrument, 'id' | 'created_at'>) => {
    if (!selectedItem) return
    
    try {
      await updateItem(selectedItem.id, formData)
      closeModal()
      resetForm()
      setSelectedItem(null)
    } catch (error) {
      logError('Failed to update item', error, 'DashboardPage')
    }
  }

  // Handle item deletion
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return
    
    try {
      await deleteItem(itemId)
    } catch (error) {
      logError('Failed to delete item', error, 'DashboardPage')
    }
  }

  // Handle view item
  const handleViewItem = (item: Instrument) => {
    setSelectedItem(item)
    setShowViewModal(true)
  }

  // Handle edit item
  const handleEditItem = (item: Instrument) => {
    setSelectedItem(item)
    openEditModal()
  }

  // Handle add new item
  const handleAddItem = () => {
    setSelectedItem(null)
    openModal()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <button
                onClick={toggleSidebar}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="ml-4 text-2xl font-semibold text-gray-900">Dashboard</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button
                onClick={handleAddItem}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Add Item
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <Sidebar isExpanded={sidebarExpanded} onToggle={toggleSidebar}>
          <div className="p-4">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Stats</h2>
            <div className="space-y-2 text-sm text-gray-600">
              <div>Total Items: {items.length}</div>
              <div>Available: {items.filter(item => item.status === 'Available').length}</div>
              <div>Sold: {items.filter(item => item.status === 'Sold').length}</div>
            </div>
          </div>
        </Sidebar>

        {/* Main Content */}
        <div className={`flex-1 transition-all duration-300 ${sidebarExpanded ? 'ml-64' : 'ml-16'}`}>
          <div className="p-6">
            {/* Filters */}
            <ItemFilters
              items={items}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              filters={filters}
              onFilterChange={(filterType: string, value: string | boolean) => handleFilterChange(filterType as keyof typeof filters, value)}
              onPriceRangeChange={handlePriceRangeChange}
              onClearFilters={clearAllFilters}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters(!showFilters)}
              activeFiltersCount={getActiveFiltersCount()}
            />

            {/* Items List */}
            <ItemList
              items={filteredItems}
              loading={loading}
              onItemClick={handleViewItem}
              onEditClick={handleEditItem}
              onDeleteClick={(item) => handleDeleteItem(item.id)}
              clientRelationships={clientRelationships}
              getSortArrow={getSortArrow}
              onSort={handleSort}
            />
          </div>
        </div>
      </div>

      {/* Item Form Modal */}
      <ItemForm
        isOpen={showModal}
        onClose={closeModal}
        onSubmit={isEditing ? handleUpdateItem : handleCreateItem}
        submitting={submitting}
        selectedItem={selectedItem}
        isEditing={isEditing}
      />

      {/* View Modal */}
      {showViewModal && selectedItem && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Item Details</h3>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Maker</label>
                  <p className="text-sm text-gray-900">{selectedItem.maker}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Type</label>
                  <p className="text-sm text-gray-900">{selectedItem.type}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <p className="text-sm text-gray-900">{selectedItem.status}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Price</label>
                  <p className="text-sm text-gray-900">${selectedItem.price?.toLocaleString() || 'N/A'}</p>
                </div>
                {selectedItem.note && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Note</label>
                    <p className="text-sm text-gray-900">{selectedItem.note}</p>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowViewModal(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setShowViewModal(false)
                    handleEditItem(selectedItem)
                  }}
                >
                  Edit
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}