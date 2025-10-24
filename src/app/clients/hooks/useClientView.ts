import { useState, useEffect } from 'react'
import { Client } from '@/types'

export function useClientView() {
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showInterestDropdown, setShowInterestDropdown] = useState(false)
  
  const [viewFormData, setViewFormData] = useState({
    last_name: '',
    first_name: '',
    contact_number: '',
    email: '',
    tags: [] as string[],
    interest: '',
    note: ''
  })

  // Check if interest dropdown should be shown for edit window
  useEffect(() => {
    if (isEditing) {
      const shouldShowInterest = viewFormData.tags.some(tag => ['Musician', 'Dealer', 'Collector'].includes(tag))
      setShowInterestDropdown(shouldShowInterest)
    }
  }, [viewFormData.tags, isEditing])

  const openClientView = (client: Client) => {
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
  }

  const closeClientView = () => {
    setShowViewModal(false)
    setSelectedClient(null)
    setIsEditing(false)
  }

  const startEditing = () => setIsEditing(true)
  const stopEditing = () => setIsEditing(false)

  const updateViewFormData = (updates: Partial<typeof viewFormData>) => {
    setViewFormData(prev => ({ ...prev, ...updates }))
  }

  const handleViewInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setViewFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  return {
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
  }
}
