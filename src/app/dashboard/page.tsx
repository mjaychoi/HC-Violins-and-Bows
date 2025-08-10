"use client"

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Item {
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

interface ItemImage {
  id: string
  item_id: string
  image_url: string
  file_name: string
  file_size: number
  mime_type: string
  display_order: number
  created_at: string
}

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

interface ClientItem {
  id: string
  client_id: string
  item_id: string
  relationship_type: 'Interested' | 'Sold' | 'Booked' | 'Owned'
  notes: string | null
  created_at: string
  client?: Client
}

export default function DashboardPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  
  // Enhanced filtering state
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    status: [] as string[],
    maker: [] as string[],
    type: [] as string[],
    subtype: [] as string[],
    ownership: [] as string[],
    certificate: [] as boolean[],
    priceRange: {
      min: '',
      max: ''
    },
    hasClients: [] as string[]
  })
  
  const [formData, setFormData] = useState<{
    status: string
    maker: string
    category: string
    subtype: string
    year: string | number
    certificate: boolean
    size: string
    weight: string
    price: string | number
    ownership: string
    note: string
  }>({
    status: 'Available',
    maker: '',
    category: 'Instrument',
    subtype: 'Violin',
    year: '',
    certificate: false,
    size: '',
    weight: '',
    price: '',
    ownership: '',
    note: ''
  })
  const [priceInput, setPriceInput] = useState('')
  
  const [viewFormData, setViewFormData] = useState<{
    status: string
    maker: string
    category: string
    subtype: string
    year: string | number
    certificate: boolean
    size: string
    weight: string
    price: string | number
    ownership: string
    note: string
  }>({
    status: 'Available',
    maker: '',
    category: 'Instrument',
    subtype: 'Violin',
    year: '',
    certificate: false,
    size: '',
    weight: '',
    price: '',
    ownership: '',
    note: ''
  })
  const [viewPriceInput, setViewPriceInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [itemImages, setItemImages] = useState<ItemImage[]>([])
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([])

  // Client relationship states
  const [clientRelationships, setClientRelationships] = useState<ClientItem[]>([])
  const [showClientSearch, setShowClientSearch] = useState(false)
  const [clientSearchTerm, setClientSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Client[]>([])
  const [isSearchingClients, setIsSearchingClients] = useState(false)
  const [itemsWithClients, setItemsWithClients] = useState<Set<string>>(new Set())

  // New item - connected clients (creation time)
  const [showClientSearchForNew, setShowClientSearchForNew] = useState(false)
  const [clientSearchTermForNew, setClientSearchTermForNew] = useState('')
  const [searchResultsForNew, setSearchResultsForNew] = useState<Client[]>([])
  const [isSearchingClientsForNew, setIsSearchingClientsForNew] = useState(false)
  const [selectedClientsForNew, setSelectedClientsForNew] = useState<Array<{ client: Client, relationshipType: ClientItem['relationship_type'] }>>([])

  // New item - ownership client (creation time)
  const [showOwnershipSearch, setShowOwnershipSearch] = useState(false)
  const [ownershipSearchTerm, setOwnershipSearchTerm] = useState('')
  const [ownershipSearchResults, setOwnershipSearchResults] = useState<Client[]>([])
  const [isSearchingOwnership, setIsSearchingOwnership] = useState(false)
  const [selectedOwnershipClient, setSelectedOwnershipClient] = useState<Client | null>(null)

  // Add ref for filter panel
  const filterPanelRef = useRef<HTMLDivElement>(null)

  // Handle click outside filter panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if clicking on the filter button
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
    fetchItems()
  }, [])

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setItems(data || [])
      
      // Fetch which items have clients
      await fetchItemsWithClients()
    } catch (error) {
      console.error('Error fetching items:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchItemsWithClients = async () => {
    try {
      const { data, error } = await supabase
        .from('client_instruments')
        .select('instrument_id')
      
      if (error) throw error
      
      const itemIds = new Set(data?.map(item => item.instrument_id) || [])
      setItemsWithClients(itemIds)
    } catch (error) {
      console.error('Error fetching items with clients:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Form submission started')
    
    // Validate required fields
    const needsSubtype = formData.category !== 'Other'
    const needsSize = formData.category === 'Instrument'
    const needsWeight = formData.category === 'Bow'
    
    let missingFields = []
    if (!formData.maker) missingFields.push('Maker')
    if (!formData.category) missingFields.push('Type')
    if (needsSubtype && !formData.subtype) missingFields.push('Subtype')
    if (needsSize && !formData.size) missingFields.push('Size')
    if (needsWeight && !formData.weight) missingFields.push('Weight')
    if (!selectedOwnershipClient) missingFields.push('Ownership')
    
    if (missingFields.length > 0) {
      alert(`Please fill in all required fields: ${missingFields.join(', ')}`)
      console.log('Validation failed - missing required fields:', missingFields)
      return
    }
    
    if (formData.price <= 0) {
      alert('Please enter a valid price greater than 0')
      console.log('Validation failed - invalid price')
      return
    }
    
    console.log('Validation passed, form data:', formData)
    setSubmitting(true)
    
    try {
      // Test Supabase connection first
      console.log('Testing Supabase connection...')
      const { data: testData, error: testError } = await supabase
        .from('instruments')
        .select('count', { count: 'exact', head: true })
      
      if (testError) {
        console.error('Supabase connection test failed:', testError)
        alert('Database connection failed. Please check your Supabase configuration.')
        return
      }
      
      console.log('Supabase connection successful, current count:', testData)
      
      // Prepare data for insertion
      const insertData = {
        status: formData.status,
        maker: formData.maker,
          type: formData.category === 'Other' ? 'Other' : `${formData.category} / ${formData.subtype}`,
        year: formData.year,
        certificate: formData.certificate,
          size: formData.category === 'Instrument' ? formData.size : null,
          weight: formData.category === 'Bow' ? formData.weight : null,
        price: formData.price,
          ownership: selectedOwnershipClient ? `${selectedOwnershipClient.first_name} ${selectedOwnershipClient.last_name}` : null,
      note: formData.note
      }
      
      console.log('Attempting to insert data:', insertData)
      
      const { data, error } = await supabase
        .from('instruments')
        .insert([insertData])
        .select()

      if (error) {
        console.error('Supabase insert error:', error)
          alert(`Failed to add item: ${error.message}`)
        return
      }
      
        console.log('Successfully added item:', data)
      
      // Upload images if any
      if (selectedFiles.length > 0) {
        try {
          await uploadImages(data[0].id)
        } catch (error) {
          console.error('Error uploading images:', error)
            alert(`Item added successfully, but there was an error uploading images: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
        
         // If creation-time client selections exist, insert relationships
         if (selectedClientsForNew.length > 0 && data && data[0]) {
           const itemId = data[0].id
           const rows = selectedClientsForNew.map(sc => ({
             client_id: sc.client.id,
             instrument_id: itemId,
             relationship_type: sc.relationshipType
           }))
           const { error: relErr } = await supabase.from('client_instruments').insert(rows)
           if (relErr) {
             console.error('Failed to add connected clients for new item:', relErr)
        }
      }
      
      // Reset form and close modal
         resetNewItemForm()
      setShowModal(false)
      
        // Refresh the items list
        console.log('Refreshing items list...')
        await fetchItems()
      
      // Show success message
        alert('Item added successfully!')
      console.log('Form submission completed successfully')
    } catch (error) {
      console.error('Unexpected error during form submission:', error)
      alert('An unexpected error occurred. Please check the console for details.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem) return
    
    console.log('Update submission started')
    
    // Validate required fields
    const needsSubtype = viewFormData.category !== 'Other'
    const needsSize = viewFormData.category === 'Instrument'
    const needsWeight = viewFormData.category === 'Bow'
    
    let missingFields = []
    if (!viewFormData.maker) missingFields.push('Maker')
    if (!viewFormData.category) missingFields.push('Type')
    if (needsSubtype && !viewFormData.subtype) missingFields.push('Subtype')
    if (needsSize && !viewFormData.size) missingFields.push('Size')
    if (needsWeight && !viewFormData.weight) missingFields.push('Weight')
    if (!viewFormData.ownership) missingFields.push('Ownership')
    
    if (missingFields.length > 0) {
      alert(`Please fill in all required fields: ${missingFields.join(', ')}`)
      return
    }
    
    if (!viewFormData.price || Number(viewFormData.price) <= 0) {
      alert('Please enter a valid price greater than 0')
      return
    }
    
    setSubmitting(true)
    
    try {
      // Update item data
      const updateData = {
        status: viewFormData.status,
        maker: viewFormData.maker,
        type: viewFormData.category === 'Other' ? 'Other' : `${viewFormData.category} / ${viewFormData.subtype}`,
        year: viewFormData.year,
        certificate: viewFormData.certificate,
        size: viewFormData.category === 'Instrument' ? viewFormData.size : null,
        weight: viewFormData.category === 'Bow' ? viewFormData.weight : null,
        price: Number(viewFormData.price),
              ownership: viewFormData.ownership,
      note: viewFormData.note
      }
      
      console.log('Attempting to update item:', selectedItem.id, updateData)
      
      const { data, error } = await supabase
        .from('instruments')
        .update(updateData)
        .eq('id', selectedItem.id)
        .select()

      if (error) {
        console.error('Supabase update error:', error)
        alert(`Failed to update item: ${error.message}`)
        return
      }
      
      console.log('Successfully updated item:', data)
      
      // Delete images
      for (const imageId of imagesToDelete) {
        // Get image record
        const img = itemImages.find(img => img.id === imageId)
        if (img) {
          // Remove from storage
          const fileName = img.image_url.split('/').pop()?.split('?')[0]
          if (fileName) {
            await supabase.storage.from('instrument-images').remove([fileName])
          }
          // Remove from DB
          await supabase.from('instrument_images').delete().eq('id', imageId)
        }
      }
      // Upload new images
      if (selectedFiles.length > 0) {
        await uploadImages(selectedItem.id)
      }
      // Refresh images
      await fetchItemImages(selectedItem.id)
      setImagesToDelete([])
      setSelectedFiles([])
      setIsEditing(false)
      
      // Refresh the items list
      await fetchItems()
      
      // Show success message
      alert('Item updated successfully!')
    } catch (error) {
      console.error('Unexpected error during update:', error)
      alert('An unexpected error occurred. Please check the console for details.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteItem = async () => {
    if (!selectedItem) return
    
    const confirmed = window.confirm('Are you sure you want to delete this item? This action cannot be undone.')
    if (!confirmed) return
    
    setSubmitting(true)
    
    try {
      // Delete all images first
      for (const image of itemImages) {
        try {
          await supabase.storage.from('instrument-images').remove([image.file_name])
          await supabase.from('instrument_images').delete().eq('id', image.id)
        } catch (error) {
          console.error('Error deleting image:', error)
        }
      }
      
      // Delete client relationships
      await supabase.from('client_instruments').delete().eq('instrument_id', selectedItem.id)
      
      // Delete the item
      const { error } = await supabase
        .from('instruments')
        .delete()
        .eq('id', selectedItem.id)

      if (error) throw error

      // Close modal and refresh
      setShowViewModal(false)
      setSelectedItem(null)
      await fetchItems()
      
      alert('Item deleted successfully!')
    } catch (error) {
      console.error('Error deleting item:', error)
      alert('Failed to delete item')
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
              type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleViewInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setViewFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
              type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setSelectedFiles(prev => [...prev, ...files])
  }

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    setSelectedFiles(prev => [...prev, ...files])
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const uploadImages = async (itemId: string): Promise<string[]> => {
    if (selectedFiles.length === 0) return []
    
    setUploadingImages(true)
    const uploadedUrls: string[] = []
    
    try {
      // First, let's test if the bucket exists and we have access
      console.log('Testing storage access...')
      const { data: bucketData, error: bucketError } = await supabase.storage.listBuckets()
      console.log('Available buckets:', bucketData)
      
      if (bucketError) {
        console.error('Error listing buckets:', bucketError)
        throw new Error(`Storage access error: ${bucketError.message}`)
      }
      
      const bucketExists = bucketData?.some(bucket => bucket.name === 'instrument-images')
      console.log('Looking for bucket "instrument-images"')
      console.log('Available buckets:', bucketData?.map(b => b.name))
      
      if (!bucketExists) {
        throw new Error(`Storage bucket "instrument-images" does not exist. Available buckets: ${bucketData?.map(b => b.name).join(', ') || 'none'}`)
      }
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        console.log(`Uploading file ${i + 1}/${selectedFiles.length}:`, file.name, file.size, 'bytes')
        
        // Create a unique filename
        const fileExt = file.name.split('.').pop()
        const fileName = `${itemId}_${Date.now()}_${i}.${fileExt}`
        
        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('instrument-images')
          .upload(fileName, file)
        
        if (error) {
          console.error('Error uploading image:', error)
          throw new Error(`Upload failed for ${file.name}: ${error.message}`)
        }
        
        console.log('File uploaded successfully:', fileName)
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('instrument-images')
          .getPublicUrl(fileName)
        
        uploadedUrls.push(urlData.publicUrl)
        
        // Save image record to database
        const { error: dbError } = await supabase
          .from('instrument_images')
          .insert({
            instrument_id: itemId,
            image_url: urlData.publicUrl,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            display_order: i
          })
        
        if (dbError) {
          console.error('Error saving image record to database:', dbError)
          throw new Error(`Database error for ${file.name}: ${dbError.message}`)
        }
        
        console.log('Image record saved to database')
      }
    } catch (error) {
      console.error('Error uploading images:', error)
      throw error
    } finally {
      setUploadingImages(false)
    }
    
    return uploadedUrls
  }

  const fetchItemImages = async (itemId: string) => {
    try {
      const { data, error } = await supabase
        .from('instrument_images')
        .select('*')
        .eq('instrument_id', itemId)
        .order('display_order', { ascending: true })
      
      if (error) throw error
      setItemImages(data || [])
    } catch (error) {
      console.error('Error fetching item images:', error)
    }
  }

  const fetchClientRelationships = async (itemId: string) => {
    try {
      const { data, error } = await supabase
        .from('client_instruments')
        .select(`
          *,
          client:clients(*)
        `)
        .eq('instrument_id', itemId)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setClientRelationships(data || [])
    } catch (error) {
      console.error('Error fetching client relationships:', error)
    }
  }

  const searchClients = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearchingClients(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .or(`last_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%`)
        .limit(10)
      
      if (error) throw error
      setSearchResults(data || [])
    } catch (error) {
      console.error('Error searching clients:', error)
      setSearchResults([])
    } finally {
      setIsSearchingClients(false)
    }
  }

  // Creation-time client search and selection (Add New Item)
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
      const selectedIds = new Set(selectedClientsForNew.map(sc => sc.client.id))
      const filtered = (data || []).filter(c => !selectedIds.has(c.id))
      setSearchResultsForNew(filtered)
    } catch (error) {
      console.error('Error searching clients (new item):', error)
      setSearchResultsForNew([])
    } finally {
      setIsSearchingClientsForNew(false)
    }
  }

  const addClientForNew = (client: Client, relationshipType: ClientItem['relationship_type'] = 'Interested') => {
    setSelectedClientsForNew(prev => {
      if (prev.some(p => p.client.id === client.id)) return prev
      return [...prev, { client, relationshipType }]
    })
    setShowClientSearchForNew(false)
    setClientSearchTermForNew('')
    setSearchResultsForNew([])
  }

  const removeClientForNew = (clientId: string) => {
    setSelectedClientsForNew(prev => prev.filter(p => p.client.id !== clientId))
  }

  // Ownership client search and selection (Add New Item)
  const searchOwnershipClients = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setOwnershipSearchResults([])
      return
    }
    setIsSearchingOwnership(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .or(`last_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%`)
        .contains('tags', ['Owner'])
        .limit(10)
      if (error) throw error
      const filtered = (data || []).filter(c => c.id !== selectedOwnershipClient?.id)
      setOwnershipSearchResults(filtered)
    } catch (error) {
      console.error('Error searching ownership clients:', error)
      setOwnershipSearchResults([])
    } finally {
      setIsSearchingOwnership(false)
    }
  }

  const addOwnershipClient = (client: Client) => {
    setSelectedOwnershipClient(client)
    setShowOwnershipSearch(false)
    setOwnershipSearchTerm('')
    setOwnershipSearchResults([])
  }

  const removeOwnershipClient = () => {
    setSelectedOwnershipClient(null)
  }

  // Keep subtype valid when switching categories
  useEffect(() => {
    if (formData.category === 'Bow' && formData.subtype === 'Other') {
      setFormData(prev => ({ ...prev, subtype: 'Violin' }))
    }
    // Clear size when category changes (no default values)
    setFormData(prev => ({
      ...prev,
      size: ''
    }))
  }, [formData.category])

  // Close Add New Item panel on Escape
  useEffect(() => {
    if (!showModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        resetNewItemForm()
        setShowModal(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showModal])

  const resetNewItemForm = () => {
    setFormData({
      status: 'Available',
      maker: '',
      category: 'Instrument',
      subtype: 'Violin',
      year: '',
      certificate: false,
      size: '',
      weight: '',
      price: '',
      ownership: '',
      note: ''
    })
    setPriceInput('')
    setSelectedFiles([])
    setSelectedClientsForNew([])
    setShowClientSearchForNew(false)
    setClientSearchTermForNew('')
    setSearchResultsForNew([])
    setSelectedOwnershipClient(null)
    setShowOwnershipSearch(false)
    setOwnershipSearchTerm('')
    setOwnershipSearchResults([])
  }

  const addClientRelationship = async (clientId: string, relationshipType: ClientItem['relationship_type'] = 'Interested') => {
    if (!selectedItem) return

    try {
      const { error } = await supabase
        .from('client_instruments')
        .insert({
          client_id: clientId,
          instrument_id: selectedItem.id,
          relationship_type: relationshipType
        })

      if (error) throw error

      // Refresh relationships
      await fetchClientRelationships(selectedItem.id)
      setShowClientSearch(false)
      setClientSearchTerm('')
      setSearchResults([])
    } catch (error) {
      console.error('Error adding client relationship:', error)
      alert('Failed to add client relationship')
    }
  }

  const removeClientRelationship = async (relationshipId: string) => {
    try {
      const { error } = await supabase
        .from('client_instruments')
        .delete()
        .eq('id', relationshipId)

      if (error) throw error

      // Refresh relationships
      if (selectedItem) {
        await fetchClientRelationships(selectedItem.id)
      }
    } catch (error) {
      console.error('Error removing client relationship:', error)
      alert('Failed to remove client relationship')
    }
  }

  const handleRowClick = (item: Item) => {
    setSelectedItem(item)
    const typeParts = item.type?.split(' / ') || ['Instrument', 'Violin']
    setViewFormData({
      status: item.status,
      maker: item.maker || '',
      category: typeParts[0] || 'Instrument',
      subtype: typeParts[1] || 'Violin',
      year: item.year || '',
      certificate: item.certificate,
      size: item.size || '',
      weight: item.weight || '',
      price: item.price || '',
      ownership: item.ownership || '',
      note: item.note || ''
    })
    setViewPriceInput(item.price ? item.price.toLocaleString('en-US') : '')
    setIsEditing(false)
    setShowViewModal(true)
    
    // Fetch images and client relationships for this item
    fetchItemImages(item.id)
    fetchClientRelationships(item.id)
  }



  // Get unique values for filter options
const getUniqueValues = (field: keyof Item) => {
  const values = items.map(item => item[field]).filter((value): value is string => typeof value === 'string' && value !== null)
  return [...new Set(values)]
}

const getUniqueMakers = () => getUniqueValues('maker')
const getUniqueTypes = () => getUniqueValues('type')
  const getUniqueSubtypes = () => {
    // subtype is encoded in type as "Category / Subtype" except for Other
    const subtypes = items
      .map(i => (i.type || ''))
      .filter(Boolean)
      .map(t => (t.includes('/') ? t.split('/')[1].trim() : (t === 'Other' ? 'Other' : '')))
      .filter(s => s !== '')
    return [...new Set(subtypes)]
  }
const getUniqueOwnership = () => getUniqueValues('ownership')

  // Handle filter changes
  const handleFilterChange = (category: keyof typeof filters, value: string | boolean) => {
    setFilters(prev => {
      if (category === 'priceRange') return prev
      
      const currentValues = prev[category] as (string | boolean)[]
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value]
      
      return {
        ...prev,
        [category]: newValues
      }
    })
  }

  const handlePriceRangeChange = (type: 'min' | 'max', value: string) => {
    setFilters(prev => ({
      ...prev,
      priceRange: {
        ...prev.priceRange,
        [type]: value
      }
    }))
  }

  const clearAllFilters = () => {
    setFilters({
      status: [],
      maker: [],
      type: [],
      subtype: [],
      ownership: [],
      certificate: [],
      priceRange: { min: '', max: '' },
      hasClients: []
    })
  }

  // Enhanced filtering logic
  const filteredItems = items
    .filter(item => {
      // Text search
      const matchesSearch = searchTerm === '' || 
        (item.maker?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        (item.type?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        (item.ownership?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
      
      // Status filter
      const matchesStatus = filters.status.length === 0 || filters.status.includes(item.status)
      
      // Maker filter
      const matchesMaker = filters.maker.length === 0 || (item.maker && filters.maker.includes(item.maker))
      
      // Type filter (matches category part before / or 'Other')
      const itemType = item.type || ''
      const category = itemType.includes('/') ? itemType.split('/')[0].trim() : itemType
      const sub = itemType.includes('/') ? itemType.split('/')[1].trim() : (itemType === 'Other' ? 'Other' : '')
      const matchesType = filters.type.length === 0 || (category && filters.type.includes(category))
      const matchesSubtype = filters.subtype.length === 0 || (sub && filters.subtype.includes(sub))
      
      // Ownership filter
      const matchesOwnership = filters.ownership.length === 0 || (item.ownership && filters.ownership.includes(item.ownership))
      
      // Certificate filter
      const matchesCertificate = filters.certificate.length === 0 || filters.certificate.includes(item.certificate)
      
      // Price range filter
      const price = item.price || 0
      const minPrice = filters.priceRange.min ? parseFloat(filters.priceRange.min) : 0
      const maxPrice = filters.priceRange.max ? parseFloat(filters.priceRange.max) : Infinity
      const matchesPrice = price >= minPrice && price <= maxPrice
      
      // Has clients filter
      const hasClients = itemsWithClients.has(item.id)
      const matchesHasClients = filters.hasClients.length === 0 || 
        (filters.hasClients.includes('Has Clients') && hasClients) ||
        (filters.hasClients.includes('No Clients') && !hasClients)
      
      return matchesSearch && matchesStatus && matchesMaker && matchesType && matchesSubtype && matchesOwnership && matchesCertificate && matchesPrice && matchesHasClients
    })
    .sort((a, b) => {
      const aValue = a[sortBy as keyof Item]
      const bValue = b[sortBy as keyof Item]
      
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

  // Handle column header click for sorting
  const handleColumnSort = (column: string) => {
    if (sortBy === column) {
      // If clicking the same column, toggle sort order
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // If clicking a different column, set it as sort column and default to asc
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  // Get sort direction for a column
  const getSortDirection = (column: string) => {
    if (sortBy !== column) return 'both'
    return sortOrder === 'asc' ? 'asc' : 'desc'
  }

  // Get sort arrow icon
  const getSortArrow = (column: string) => {
    const direction = getSortDirection(column)
    if (direction === 'both') {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    } else if (direction === 'asc') {
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
          <Link href="/dashboard" className={`px-6 py-3 bg-blue-50 border-r-2 border-blue-500 transition-all duration-300 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          } flex items-center`}>
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className={`ml-3 text-blue-700 font-medium transition-opacity duration-300 ${
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

      {/* Main Content - Responsive to form state */}
      <div className={`flex-1 transition-all duration-300 ease-in-out ${
        showModal || showViewModal ? 'mr-96' : 'mr-0'
      } bg-white`}>
        <div className="p-6">
                  {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Items</h2>
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
                  placeholder="Search items..."
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
                  {/* Status Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Status</h4>
                    <div className="space-y-2">
                      {['Available', 'Booked', 'Sold'].map(status => (
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
                  
                  {/* Maker Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Maker</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {getUniqueMakers().map(maker => (
                        <label key={maker} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.maker.includes(maker)}
                            onChange={() => handleFilterChange('maker', maker)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{maker}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Type Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Type</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {getUniqueTypes().map(type => (
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

                  {/* Subtype Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Subtype</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {getUniqueSubtypes().map(sub => (
                        <label key={sub} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.subtype.includes(sub)}
                            onChange={() => handleFilterChange('subtype', sub)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{sub}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Ownership Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Ownership</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {getUniqueOwnership().map(ownership => (
                        <label key={ownership} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.ownership.includes(ownership)}
                            onChange={() => handleFilterChange('ownership', ownership)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">{ownership}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* Certificate Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Certificate</h4>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={filters.certificate.includes(true)}
                          onChange={() => handleFilterChange('certificate', true)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Has Certificate</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={filters.certificate.includes(false)}
                          onChange={() => handleFilterChange('certificate', false)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">No Certificate</span>
                      </label>
                    </div>
                  </div>
                  
                  {/* Has Clients Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Client Connections</h4>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={filters.hasClients.includes('Has Clients')}
                          onChange={() => handleFilterChange('hasClients', 'Has Clients')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Has Clients</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={filters.hasClients.includes('No Clients')}
                          onChange={() => handleFilterChange('hasClients', 'No Clients')}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">No Clients</span>
                      </label>
                    </div>
                  </div>
                  
                  {/* Price Range Filter */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Price Range</h4>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Min Price</label>
                        <input
                          type="number"
                          value={filters.priceRange.min}
                          onChange={(e) => handlePriceRangeChange('min', e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Max Price</label>
                        <input
                          type="number"
                          value={filters.priceRange.max}
                          onChange={(e) => handlePriceRangeChange('max', e.target.value)}
                          placeholder="∞"
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
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

          {/* Items Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('status')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Status</span>
                        {getSortArrow('status')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('maker')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Maker</span>
                        {getSortArrow('maker')}
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
                      onClick={() => handleColumnSort('type')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Subtype</span>
                        {getSortArrow('type')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('year')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Year</span>
                        {getSortArrow('year')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('certificate')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Certificate</span>
                        {getSortArrow('certificate')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('price')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Price</span>
                        {getSortArrow('price')}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors group"
                      onClick={() => handleColumnSort('ownership')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Ownership</span>
                        {getSortArrow('ownership')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">Loading items...</td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">No items found.</td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr 
                        key={item.id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleRowClick(item)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(item.status)}`}>{item.status}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.maker || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.type?.includes('/') ? item.type.split('/')[0].trim() : item.type || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.type?.includes('/') ? item.type.split('/')[1].trim() : (item.type === 'Other' ? 'Other' : '-')}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.year || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${item.certificate ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{item.certificate ? 'Yes' : 'No'}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${item.price ? item.price.toLocaleString() : '0'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.ownership || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Add Instrument Side Panel */}
      {showModal && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-40 border-l border-gray-200">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">Add New Item</h3>
                <button
                  onClick={() => { resetNewItemForm(); setShowModal(false) }}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    >
                      <option value="Available">Available</option>
                      <option value="Booked">Booked</option>
                      <option value="Sold">Sold</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Maker</label>
                    <input
                      type="text"
                      name="maker"
                      value={formData.maker}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder=""
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <div className="grid grid-cols-1 gap-3">
                      <select
                        name="category"
                        value={formData.category}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      >
                        <option value="Instrument">Instrument</option>
                        <option value="Bow">Bow</option>
                        <option value="Other">Other</option>
                      </select>

                      {formData.category !== 'Other' && (
                        <select
                          name="subtype"
                          value={formData.subtype}
                          onChange={handleInputChange}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                        >
                          <option value="Violin">Violin</option>
                          <option value="Viola">Viola</option>
                          <option value="Cello">Cello</option>
                          <option value="Bass">Bass</option>
                          {formData.category !== 'Bow' && (
                            <option value="Other">Other</option>
                          )}
                        </select>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <input
                      type="text"
                      name="year"
                      value={formData.year}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        setFormData(prev => ({ ...prev, year: raw === '' ? '' : Number(raw) }))
                      }}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder=""
                    />
                  </div>
                  
                  {formData.category === 'Instrument' && (
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Size (mm)</label>
                    <input
                      type="text"
                      name="size"
                      value={formData.size}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                        placeholder=""
                    />
                  </div>
                  )}
                  
                  {formData.category === 'Bow' && (
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Weight (g)</label>
                    <input
                      type="text"
                      name="weight"
                      value={formData.weight}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                        placeholder=""
                    />
                  </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                    <input
                      type="text"
                      name="price"
                      value={priceInput}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        setPriceInput(raw === '' ? '' : Number(raw).toLocaleString('en-US'))
                        setFormData(prev => ({ ...prev, price: raw === '' ? 0 : Number(raw) }))
                      }}
                      onBlur={() => setPriceInput(formData.price ? formData.price.toLocaleString('en-US') : '0')}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder=""
                    />
                  </div>
                  
                  {/* Ownership Section */}
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <label className="block text-sm font-medium text-gray-700">Ownership</label>
                      <button
                        type="button"
                        onClick={() => setShowOwnershipSearch(true)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Add
                      </button>
                    </div>

                    {showOwnershipSearch && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-sm font-medium text-gray-700">Search Owner Clients</h4>
                          <button
                            type="button"
                            onClick={() => {
                              setShowOwnershipSearch(false)
                              setOwnershipSearchTerm('')
                              setOwnershipSearchResults([])
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
                              value={ownershipSearchTerm}
                              onChange={(e) => {
                                setOwnershipSearchTerm(e.target.value)
                                searchOwnershipClients(e.target.value)
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                          </div>

                          {isSearchingOwnership && (
                            <div className="text-center text-gray-500 text-sm">Searching...</div>
                          )}

                          {ownershipSearchResults.length > 0 && (
                            <div className="space-y-2">
                              <h5 className="text-xs font-medium text-gray-600">Results:</h5>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {ownershipSearchResults.map((client) => (
                                  <div
                                    key={client.id}
                                    className="p-2 border border-gray-200 rounded-md hover:bg-white cursor-pointer bg-white"
                                    onClick={() => addOwnershipClient(client)}
                                  >
                                    <div className="font-medium text-gray-900 text-sm">
                                      {client.first_name} {client.last_name}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {client.email} • {client.contact_number}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                      {client.tags && client.tags.length > 0 ? sortTags([...client.tags]).join(', ') : 'No tags'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {ownershipSearchTerm.length >= 2 && ownershipSearchResults.length === 0 && !isSearchingOwnership && (
                            <div className="text-center text-gray-500 text-sm">No owner clients found</div>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedOwnershipClient ? (
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {selectedOwnershipClient.first_name} {selectedOwnershipClient.last_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {selectedOwnershipClient.email} • {selectedOwnershipClient.contact_number}
                          </div>
                          <div className="text-xs text-gray-400">
                            {selectedOwnershipClient.tags && selectedOwnershipClient.tags.length > 0 ? sortTags([...selectedOwnershipClient.tags]).join(', ') : 'No tags'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={removeOwnershipClient}
                          className="text-red-500 hover:text-red-700"
                          title="Remove owner"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-4 text-sm border-2 border-dashed border-gray-200 rounded-md">
                        No owner selected for this item
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                    <textarea
                      name="note"
                      value={formData.note}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 resize-none"
                      placeholder="Add notes, condition details, or any other information..."
                    />
                  </div>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="certificate"
                    checked={formData.certificate}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="ml-2 block text-sm text-gray-900">Has Certificate</label>
                </div>
                
                {/* Image Upload Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Images</label>
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors bg-gray-50"
                    onDrop={handleFileDrop}
                    onDragOver={handleDragOver}
                  >
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="image-upload"
                    />
                    <label htmlFor="image-upload" className="cursor-pointer">
                      <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="mt-2 text-sm text-gray-600">
                        <span className="font-medium text-blue-600 hover:text-blue-500">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 10MB each</p>
                    </label>
                  </div>
                  
                  {/* Selected Files Preview */}
                  {selectedFiles.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Images ({selectedFiles.length})</h4>
                      <div className="space-y-2">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-2">
                              <img
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                className="w-8 h-8 object-cover rounded"
                              />
                              <span className="text-sm text-gray-700">{file.name}</span>
                              <span className="text-xs text-gray-500">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="text-red-500 hover:text-red-700"
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

                {/* Connected Clients (Creation-time) */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-medium text-gray-700">Interested</label>
                    <button
                      type="button"
                      onClick={() => setShowClientSearchForNew(true)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Add
                    </button>
            </div>
            
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
                              {searchResultsForNew.map((client) => (
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
                                     {client.tags && client.tags.length > 0 ? sortTags([...client.tags]).join(', ') : 'No tags'}
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

                  {selectedClientsForNew.length > 0 ? (
                    <div className="space-y-2">
                      {selectedClientsForNew.map((sel) => (
                        <div key={sel.client.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {sel.client.first_name} {sel.client.last_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {sel.client.email} • {sel.client.contact_number}
                            </div>
                                                         <div className="text-xs text-gray-400">
                               {sel.client.tags && sel.client.tags.length > 0 ? sortTags([...sel.client.tags]).join(', ') : 'No tags'}
                             </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <select
                              value={sel.relationshipType}
                              onChange={(e) => {
                                const value = e.target.value as ClientItem['relationship_type']
                                setSelectedClientsForNew(prev => prev.map(p => p.client.id === sel.client.id ? { ...p, relationshipType: value } : p))
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
                              onClick={() => removeClientForNew(sel.client.id)}
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
                    <div className="text-center text-gray-500 py-4 text-sm border-2 border-dashed border-gray-200 rounded-md">
                      No clients connected to this item
                    </div>
                  )}
                </div>
              </form>
            </div>
            
            {/* Submit Button */}
            <div className="p-6 border-t border-gray-200">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || uploadingImages}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                {submitting ? 'Adding...' : uploadingImages ? 'Uploading Images...' : 'Add Item'}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* View/Edit Item Side Panel */}
      {showViewModal && selectedItem && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-40 border-l border-gray-200">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  {isEditing ? 'Edit Item' : 'Item Details'}
                </h3>
                <button
                  onClick={() => {
                    setShowViewModal(false)
                    setSelectedItem(null)
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
                {/* Image Gallery */}
                {itemImages.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Images</label>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {itemImages.map((image) => (
                        <img
                          key={image.id}
                          src={image.image_url}
                          alt={image.file_name}
                          className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
                          onClick={() => window.open(image.image_url, '_blank')}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {/* Info Card */}
                <div className="bg-white rounded-lg p-4 shadow border border-gray-200 space-y-3">
                                      <div className="flex justify-between">
                      <span className="font-semibold text-gray-700">Status:</span>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(viewFormData.status)}`}>{viewFormData.status}</span>
                    </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Maker:</span>
                    <span className="text-gray-900">{viewFormData.maker || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Type:</span>
                    <span className="text-gray-900">{viewFormData.type || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Year:</span>
                    <span className="text-gray-900">{viewFormData.year || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Certificate:</span>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${viewFormData.certificate ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{viewFormData.certificate ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Size:</span>
                    <span className="text-gray-900">{viewFormData.size || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Weight:</span>
                    <span className="text-gray-900">{viewFormData.weight || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Price:</span>
                    <span className="text-gray-900">${viewFormData.price ? viewFormData.price.toLocaleString() : '0'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-700">Ownership:</span>
                    <span className="text-gray-900">{viewFormData.ownership || '-'}</span>
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
                  
                  {/* Client Relationships Section */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold text-gray-700">Connected Clients</span>
                      <button
                        onClick={() => setShowClientSearch(true)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Add Client
                      </button>
                    </div>
                    
                    {/* Client Search Section */}
                    {showClientSearch && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-sm font-medium text-gray-700">Search Clients</h4>
                          <button
                            onClick={() => {
                              setShowClientSearch(false)
                              setClientSearchTerm('')
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
                              placeholder="Search by first or last name..."
                              value={clientSearchTerm}
                              onChange={(e) => {
                                setClientSearchTerm(e.target.value)
                                searchClients(e.target.value)
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                          </div>
                          
                          {isSearchingClients && (
                            <div className="text-center text-gray-500 text-sm">Searching...</div>
                          )}
                          
                          {searchResults.length > 0 && (
                            <div className="space-y-2">
                              <h5 className="text-xs font-medium text-gray-600">Results:</h5>
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {searchResults.map((client) => (
                                  <div
                                    key={client.id}
                                    className="p-2 border border-gray-200 rounded-md hover:bg-white cursor-pointer bg-white"
                                    onClick={() => addClientRelationship(client.id)}
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
                          
                          {clientSearchTerm.length >= 2 && searchResults.length === 0 && !isSearchingClients && (
                            <div className="text-center text-gray-500 text-sm">No clients found</div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Connected Clients List */}
                    {clientRelationships.length > 0 ? (
                      <div className="space-y-2">
                        {clientRelationships.map((relationship) => (
                          <div key={relationship.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {relationship.client?.first_name} {relationship.client?.last_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {relationship.client?.email} • {relationship.client?.contact_number}
                              </div>
                              <div className="text-xs text-gray-400">
                                {relationship.client?.type} • {relationship.client?.status}
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
                                onClick={() => removeClientRelationship(relationship.id)}
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
                      <div className="text-center text-gray-500 py-4">
                        No clients connected to this item
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Edit Mode */}
            {isEditing && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-6">
                  <form className="space-y-6">
                                         {/* Basic Information */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      name="status"
                      value={viewFormData.status}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    >
                      <option value="Available">Available</option>
                      <option value="Booked">Booked</option>
                      <option value="Sold">Sold</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Maker</label>
                    <input
                      type="text"
                      name="maker"
                      value={viewFormData.maker}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                           placeholder=""
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                         <div className="grid grid-cols-1 gap-3">
                           <select
                             name="category"
                             value={viewFormData.category}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                           >
                             <option value="Instrument">Instrument</option>
                             <option value="Bow">Bow</option>
                             <option value="Other">Other</option>
                           </select>

                           {viewFormData.category !== 'Other' && (
                             <select
                               name="subtype"
                               value={viewFormData.subtype}
                               onChange={handleViewInputChange}
                               required
                               className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                             >
                               <option value="Violin">Violin</option>
                               <option value="Viola">Viola</option>
                               <option value="Cello">Cello</option>
                               <option value="Bass">Bass</option>
                               {viewFormData.category !== 'Bow' && (
                                 <option value="Other">Other</option>
                               )}
                             </select>
                           )}
                         </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <input
                           type="text"
                      name="year"
                      value={viewFormData.year}
                           onChange={(e) => {
                             const raw = e.target.value.replace(/[^0-9]/g, '')
                             setViewFormData(prev => ({ ...prev, year: raw === '' ? '' : Number(raw) }))
                           }}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                           placeholder=""
                    />
                  </div>
                  
                       {viewFormData.category === 'Instrument' && (
                  <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Size (mm)</label>
                    <input
                      type="text"
                      name="size"
                      value={viewFormData.size}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                             placeholder=""
                    />
                  </div>
                       )}
                  
                       {viewFormData.category === 'Bow' && (
                  <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Weight (g)</label>
                    <input
                      type="text"
                      name="weight"
                      value={viewFormData.weight}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                             placeholder=""
                    />
                  </div>
                       )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                    <input
                           type="text"
                      name="price"
                           value={viewPriceInput}
                           onChange={(e) => {
                             const raw = e.target.value.replace(/[^0-9]/g, '')
                             setViewPriceInput(raw === '' ? '' : Number(raw).toLocaleString('en-US'))
                             setViewFormData(prev => ({ ...prev, price: raw === '' ? 0 : Number(raw) }))
                           }}
                           onBlur={() => setViewPriceInput(viewFormData.price ? Number(viewFormData.price).toLocaleString('en-US') : '0')}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                           placeholder=""
                    />
                  </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                    <textarea
                      name="note"
                      value={viewFormData.note}
                      onChange={handleViewInputChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 resize-none"
                        placeholder=""
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Certificate</label>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        name="certificate"
                        checked={viewFormData.certificate}
                        onChange={handleViewInputChange}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label className="ml-2 block text-sm text-gray-900">Has Certificate</label>
                    </div>
                  </div>
                  
                     {/* Ownership Section */}
                     <div className="mt-6 pt-6 border-t border-gray-200">
                       <div className="flex justify-between items-center mb-3">
                         <label className="block text-sm font-medium text-gray-700">Ownership</label>
                         <button
                           type="button"
                           onClick={() => setShowOwnershipSearch(true)}
                           className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                         >
                           Add
                         </button>
                       </div>

                       {showOwnershipSearch && (
                         <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                           <div className="flex justify-between items-center mb-3">
                             <h4 className="text-sm font-medium text-gray-700">Search Owner Clients</h4>
                             <button
                               type="button"
                               onClick={() => {
                                 setShowOwnershipSearch(false)
                                 setOwnershipSearchTerm('')
                                 setOwnershipSearchResults([])
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
                                 value={ownershipSearchTerm}
                                 onChange={(e) => {
                                   setOwnershipSearchTerm(e.target.value)
                                   searchOwnershipClients(e.target.value)
                                 }}
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                               />
                             </div>

                             {isSearchingOwnership && (
                               <div className="text-center text-gray-500 text-sm">Searching...</div>
                             )}

                             {ownershipSearchResults.length > 0 && (
                               <div className="space-y-2">
                                 <h5 className="text-xs font-medium text-gray-600">Results:</h5>
                                 <div className="max-h-32 overflow-y-auto space-y-1">
                                   {ownershipSearchResults.map((client) => (
                                     <div
                                       key={client.id}
                                       className="p-2 border border-gray-200 rounded-md hover:bg-white cursor-pointer bg-white"
                                       onClick={() => addOwnershipClient(client)}
                                     >
                                       <div className="font-medium text-gray-900 text-sm">
                                         {client.first_name} {client.last_name}
                                       </div>
                                       <div className="text-xs text-gray-500">
                                         {client.email} • {client.contact_number}
                                       </div>
                                       <div className="text-xs text-gray-400">
                                         {client.tags && client.tags.length > 0 ? sortTags([...client.tags]).join(', ') : 'No tags'}
                                       </div>
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             )}

                             {ownershipSearchTerm.length >= 2 && ownershipSearchResults.length === 0 && !isSearchingOwnership && (
                               <div className="text-center text-gray-500 text-sm">No owner clients found</div>
                             )}
                           </div>
                         </div>
                       )}

                       {selectedOwnershipClient ? (
                         <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200">
                           <div className="flex-1">
                             <div className="font-medium text-gray-900">
                               {selectedOwnershipClient.first_name} {selectedOwnershipClient.last_name}
                             </div>
                             <div className="text-sm text-gray-500">
                               {selectedOwnershipClient.email} • {selectedOwnershipClient.contact_number}
                             </div>
                             <div className="text-xs text-gray-400">
                               {selectedOwnershipClient.tags && selectedOwnershipClient.tags.length > 0 ? sortTags([...selectedOwnershipClient.tags]).join(', ') : 'No tags'}
                             </div>
                           </div>
                           <button
                             type="button"
                             onClick={removeOwnershipClient}
                             className="text-red-500 hover:text-red-700"
                             title="Remove owner"
                           >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                             </svg>
                           </button>
                         </div>
                       ) : (
                         <div className="text-center text-gray-500 py-4 text-sm border-2 border-dashed border-gray-200 rounded-md">
                           No owner selected for this item
                         </div>
                       )}
                     </div>

                    {/* Image Upload Section */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Images</label>
                      <div
                        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors bg-gray-50"
                        onDrop={handleFileDrop}
                        onDragOver={handleDragOver}
                      >
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="hidden"
                          id="edit-image-upload"
                        />
                        <label htmlFor="edit-image-upload" className="cursor-pointer">
                          <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                            <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <p className="mt-2 text-sm text-gray-600">
                            <span className="font-medium text-blue-600 hover:text-blue-500">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 10MB each</p>
                        </label>
                      </div>
                      
                      {/* Selected Files Preview */}
                      {selectedFiles.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Images ({selectedFiles.length})</h4>
                          <div className="space-y-2">
                            {selectedFiles.map((file, index) => (
                              <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <div className="flex items-center space-x-2">
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt={file.name}
                                    className="w-8 h-8 object-cover rounded"
                                  />
                                  <span className="text-sm text-gray-700">{file.name}</span>
                                  <span className="text-xs text-gray-500">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                                </div>
                              <button
                                type="button"
                                  onClick={() => removeFile(index)}
                                  className="text-red-500 hover:text-red-700"
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

                    {/* Connected Clients Section */}
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                        <label className="block text-sm font-medium text-gray-700">Interested</label>
                        <button
                          type="button"
                          onClick={() => setShowClientSearch(true)}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                          Add
                        </button>
                      </div>

                      {/* Client Search Section */}
                      {showClientSearch && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-medium text-gray-700">Search Clients</h4>
                            <button
                              onClick={() => {
                                setShowClientSearch(false)
                                setClientSearchTerm('')
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
                                placeholder="Search by first or last name..."
                                value={clientSearchTerm}
                                onChange={(e) => {
                                  setClientSearchTerm(e.target.value)
                                  searchClients(e.target.value)
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              />
                            </div>
                            
                            {isSearchingClients && (
                              <div className="text-center text-gray-500 text-sm">Searching...</div>
                            )}
                            
                            {searchResults.length > 0 && (
                              <div className="space-y-2">
                                <h5 className="text-xs font-medium text-gray-600">Results:</h5>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                  {searchResults.map((client) => (
                                    <div
                                      key={client.id}
                                      className="p-2 border border-gray-200 rounded-md hover:bg-white cursor-pointer bg-white"
                                      onClick={() => addClientRelationship(client.id)}
                                    >
                                      <div className="font-medium text-gray-900 text-sm">
                                        {client.first_name} {client.last_name}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {client.email} • {client.contact_number}
                                      </div>
                                      <div className="text-xs text-gray-400">
                                        {client.tags && client.tags.length > 0 ? sortTags([...client.tags]).join(', ') : 'No tags'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                            
                            {clientSearchTerm.length >= 2 && searchResults.length === 0 && !isSearchingClients && (
                              <div className="text-center text-gray-500 text-sm">No clients found</div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Connected Clients List */}
                      {clientRelationships.length > 0 ? (
                        <div className="space-y-2">
                          {clientRelationships.map((relationship) => (
                            <div key={relationship.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200">
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">
                                  {relationship.client?.first_name} {relationship.client?.last_name}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {relationship.client?.email} • {relationship.client?.contact_number}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {relationship.client?.tags && relationship.client.tags.length > 0 ? sortTags([...relationship.client.tags]).join(', ') : 'No tags'}
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
                                  onClick={() => removeClientRelationship(relationship.id)}
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
                        <div className="text-center text-gray-500 py-4 text-sm border-2 border-dashed border-gray-200 rounded-md">
                          No clients connected to this item
                        </div>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            )}
            
            {/* Footer (Edit button in detail view) */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleDeleteItem}
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
                      Edit Item
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
                        {submitting ? 'Updating...' : 'Update Item'}
                    </button>
                  </>
                )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 