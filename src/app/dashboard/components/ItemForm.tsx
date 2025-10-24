"use client"

import React from 'react'
import { Instrument } from '@/types'
import { useDashboardForm } from '../hooks/useDashboardForm'
import { validateInstrumentData } from '../utils/dashboardUtils'
import { classNames } from '@/utils/classNames'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'

interface ItemFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (formData: Omit<Instrument, 'id' | 'created_at'>) => Promise<void>
  submitting: boolean
  selectedItem?: Instrument | null
  isEditing?: boolean
}

export default function ItemForm({ 
  isOpen, 
  onClose, 
  onSubmit, 
  submitting, 
  selectedItem,
  isEditing = false 
}: ItemFormProps) {
  const {
    formData,
    updateField,
    resetForm,
    priceInput,
    handlePriceChange,
    selectedFiles,
    handleFileChange,
    removeFile
  } = useDashboardForm()

  const [errors, setErrors] = React.useState<string[]>([])

  React.useEffect(() => {
    if (selectedItem && isEditing) {
      // Populate form with selected item data
      Object.keys(selectedItem).forEach(key => {
        if (key in formData) {
          const value = selectedItem[key as keyof Instrument]
          if (value !== null && value !== undefined) {
            updateField(key as keyof typeof formData, value as string | boolean)
          }
        }
      })
    }
  }, [selectedItem, isEditing, updateField, formData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate form data
    const validationErrors = validateInstrumentData(formData as unknown as Partial<Instrument>)
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    try {
      await onSubmit(formData as unknown as Omit<Instrument, 'id' | 'created_at'>)
      resetForm()
      setErrors([])
      onClose()
    } catch {
      setErrors(['Failed to save item. Please try again.'])
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
      if (type === 'checkbox') {
        updateField(name as keyof typeof formData, (e.target as HTMLInputElement).checked as boolean)
      } else {
        updateField(name as keyof typeof formData, value as string)
      }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              {isEditing ? 'Edit Item' : 'Add New Item'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {errors.length > 0 && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              <ul className="list-disc list-inside">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Maker"
                name="maker"
                value={formData.maker}
                onChange={handleInputChange}
                required
                placeholder="Enter maker name"
              />
              
              <Input
                label="Type"
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                required
                placeholder="Enter type"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Subtype"
                name="subtype"
                value={formData.subtype}
                onChange={handleInputChange}
                required
                placeholder="Enter subtype"
              />
              
              <Input
                label="Year"
                name="year"
                type="number"
                value={formData.year}
                onChange={handleInputChange}
                placeholder="Enter year"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className={classNames.input}
                >
                  <option value="Available">Available</option>
                  <option value="Sold">Sold</option>
                  <option value="Reserved">Reserved</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
              </div>
              
              <Input
                label="Price"
                name="price"
                type="number"
                value={priceInput}
                onChange={(e) => handlePriceChange(e.target.value)}
                placeholder="Enter price"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Size"
                name="size"
                value={formData.size}
                onChange={handleInputChange}
                placeholder="Enter size"
              />
              
              <Input
                label="Weight"
                name="weight"
                value={formData.weight}
                onChange={handleInputChange}
                placeholder="Enter weight"
              />
            </div>

            <Input
              label="Ownership"
              name="ownership"
              value={formData.ownership}
              onChange={handleInputChange}
              placeholder="Enter ownership info"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Images</label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleFileChange(e.target.files)}
                className={classNames.input}
              />
              {selectedFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="certificate"
                  checked={formData.certificate}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Has Certificate</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
              <textarea
                name="note"
                value={formData.note}
                onChange={handleInputChange}
                rows={3}
                className={classNames.input}
                placeholder="Enter any additional notes"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={submitting}
              >
                {isEditing ? 'Update Item' : 'Add Item'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
