'use client';

import { Instrument } from '@/types';
import { useUnifiedDashboard } from '@/hooks/useUnifiedData';
import { useDashboardFilters, useDashboardForm } from './hooks';
import { ItemForm, ItemList, ItemFilters } from './components';
import { useModalState } from '@/hooks/useModalState';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/common';

export default function DashboardPage() {
  // Error handling
  const { ErrorToasts, handleError } = useErrorHandler();

  // Custom hooks for state management
  const {
    instruments,
    loading,
    submitting,
    clientRelationships,
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
    selectedItem,
  } = useModalState<Instrument>();

  // Loading states
  const { withSubmitting } = useLoadingState();

  // 데이터는 useUnifiedDashboard에서 자동으로 로드됨
  // 추가로 fetchInstruments()를 호출할 필요 없음

  // Handle item creation
  const handleCreateItem = async (
    formData: Omit<Instrument, 'id' | 'created_at'>
  ) => {
    try {
      await withSubmitting(async () => {
        await createInstrument(formData);
        closeModal();
        resetForm();
      });
    } catch (error) {
      handleError(error, 'Failed to create item');
    }
  };

  // Handle item update
  const handleUpdateItem = async (
    formData: Omit<Instrument, 'id' | 'created_at'>
  ) => {
    if (!selectedItem) return;

    try {
      await withSubmitting(async () => {
        await updateInstrument(selectedItem.id, formData);
        closeModal();
        resetForm();
      });
    } catch (error) {
      handleError(error, 'Failed to update item');
    }
  };

  // Handle item deletion
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      await deleteInstrument(itemId);
    } catch (error) {
      handleError(error, 'Failed to delete item');
    }
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
            onDeleteClick={item => handleDeleteItem(item.id)}
            onUpdateItem={async (
              itemId: string,
              updates: Partial<Instrument>
            ) => {
              try {
                const result = await updateInstrument(itemId, updates);
                if (!result) {
                  throw new Error('Failed to update item');
                }
              } catch (error) {
                handleError(error, 'Failed to update item');
                throw error; // Re-throw to prevent saveEditing from closing editing mode
              }
            }}
            clientRelationships={clientRelationships}
            getSortArrow={getSortArrow}
            onSort={handleSort}
          />
        </div>

        {/* Item Form Modal - Show when editing or creating */}
        <ItemForm
          isOpen={showModal}
          onClose={closeModal}
          onSubmit={isEditing ? handleUpdateItem : handleCreateItem}
          submitting={submitting.any}
          selectedItem={selectedItem}
          isEditing={isEditing}
        />

        {/* Error Toasts */}
        <ErrorToasts />
      </AppLayout>
    </ErrorBoundary>
  );
}
