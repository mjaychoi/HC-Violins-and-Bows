'use client';

import { useEffect } from 'react';
import { Instrument } from '@/types';
import { useUnifiedDashboard } from '@/hooks/useUnifiedData';
import { useDashboardFilters, useDashboardForm } from './hooks';
import { ItemForm, ItemList, ItemFilters } from './components';
import { useModalState } from '@/hooks/useModalState';
import { useLoadingState } from '@/hooks/useLoadingState';
import { logError } from '@/utils/logger';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/common';
import Button from '@/components/common/Button';

export default function DashboardPage() {
  // Custom hooks for state management
  const {
    instruments,
    loading,
    submitting,
    clientRelationships,
    fetchInstruments,
    createInstrument,
    updateInstrument,
    deleteInstrument,
  } = useUnifiedDashboard();

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
    getActiveFiltersCount,
  } = useDashboardFilters(instruments);

  const { resetForm } = useDashboardForm();

  // Modal and sidebar states
  const {
    isOpen: showModal,
    isEditing,
    openModal,
    closeModal,
    openEditModal,
    openViewModal,
    selectedItem,
  } = useModalState<Instrument>();

  // Loading states
  const { withSubmitting } = useLoadingState();

  // Load data on component mount
  useEffect(() => {
    fetchInstruments();
  }, [fetchInstruments]);

  // Handle item creation
  const handleCreateItem = async (
    formData: Omit<Instrument, 'id' | 'created_at'>
  ) => {
    await withSubmitting(async () => {
      await createInstrument(formData);
      closeModal();
      resetForm();
    });
  };

  // Handle item update
  const handleUpdateItem = async (
    formData: Omit<Instrument, 'id' | 'created_at'>
  ) => {
    if (!selectedItem) return;

    await withSubmitting(async () => {
      await updateInstrument(selectedItem.id, formData);
      closeModal();
      resetForm();
    });
  };

  // Handle item deletion
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      await deleteInstrument(itemId);
    } catch (error) {
      logError('Failed to delete item', error, 'DashboardPage');
    }
  };

  // Handle view item
  const handleViewItem = (item: Instrument) => {
    openViewModal(item);
  };

  // Handle edit item
  const handleEditItem = (item: Instrument) => {
    openEditModal(item);
  };

  // Handle add new item
  const handleAddItem = () => {
    openModal();
  };

  return (
    <ErrorBoundary>
      <AppLayout
        title="Dashboard"
        actionButton={{
          label: 'Add Item',
          onClick: handleAddItem,
        }}
      >
        <div className="p-6">
          {/* Filters */}
          <ItemFilters
            items={instruments}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            filters={filters}
            onFilterChange={(filterType: string, value: string | boolean) =>
              handleFilterChange(filterType as keyof typeof filters, value)
            }
            onPriceRangeChange={handlePriceRangeChange}
            onClearFilters={clearAllFilters}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters(!showFilters)}
            activeFiltersCount={getActiveFiltersCount()}
          />

          {/* Items List */}
          <ItemList
            items={filteredItems}
            loading={loading.any}
            onItemClick={handleViewItem}
            onEditClick={handleEditItem}
            onDeleteClick={item => handleDeleteItem(item.id)}
            clientRelationships={clientRelationships}
            getSortArrow={getSortArrow}
            onSort={handleSort}
          />
        </div>

        {/* Item Form Modal */}
        <ItemForm
          isOpen={showModal}
          onClose={closeModal}
          onSubmit={isEditing ? handleUpdateItem : handleCreateItem}
          submitting={submitting.any}
          selectedItem={selectedItem}
          isEditing={isEditing}
        />

        {/* View Modal */}
        {selectedItem && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Item Details
                  </h3>
                  <button
                    onClick={closeModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Maker
                    </label>
                    <p className="text-sm text-gray-900">
                      {selectedItem?.maker || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Type
                    </label>
                    <p className="text-sm text-gray-900">
                      {selectedItem?.type || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Status
                    </label>
                    <p className="text-sm text-gray-900">
                      {selectedItem?.status || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Price
                    </label>
                    <p className="text-sm text-gray-900">
                      ${selectedItem?.price?.toLocaleString() || 'N/A'}
                    </p>
                  </div>
                  {selectedItem?.note && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Note
                      </label>
                      <p className="text-sm text-gray-900">
                        {selectedItem.note}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={closeModal}
                  >
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      closeModal();
                      if (selectedItem) {
                        handleEditItem(selectedItem);
                      }
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </AppLayout>
    </ErrorBoundary>
  );
}
