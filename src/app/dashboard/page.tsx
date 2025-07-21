"use client"

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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
  created_at: string
}

interface InstrumentImage {
  id: string
  instrument_id: string
  image_url: string
  file_name: string
  file_size: number
  mime_type: string
  display_order: number
  created_at: string
}

export default function DashboardPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  
  // Enhanced filtering state
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    status: [] as string[],
    maker: [] as string[],
    type: [] as string[],
    ownership: [] as string[],
    certificate: [] as boolean[],
    priceRange: {
      min: '',
      max: ''
    }
  })
  
  const [formData, setFormData] = useState({
    status: 'Available' as 'Available' | 'Booked' | 'Sold',
    maker: '',
    type: '',
    year: new Date().getFullYear(),
    certificate: false,
    size: '',
    weight: '',
    price: 0,
    ownership: ''
  })
  
  const [viewFormData, setViewFormData] = useState({
    status: 'Available' as 'Available' | 'Booked' | 'Sold',
    maker: '',
    type: '',
    year: new Date().getFullYear(),
    certificate: false,
    size: '',
    weight: '',
    price: 0,
    ownership: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [instrumentImages, setInstrumentImages] = useState<InstrumentImage[]>([])
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([])

  useEffect(() => {
    fetchInstruments()
  }, [])

  const fetchInstruments = async () => {
    try {
      const { data, error } = await supabase
        .from('instruments')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setInstruments(data || [])
    } catch (error) {
      console.error('Error fetching instruments:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Form submission started')
    
    // Validate required fields
    if (!formData.maker || !formData.type || !formData.size || !formData.weight || !formData.ownership) {
      alert('Please fill in all required fields: Maker, Type, Size, Weight, and Ownership')
      console.log('Validation failed - missing required fields')
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
        type: formData.type,
        year: formData.year,
        certificate: formData.certificate,
        size: formData.size,
        weight: formData.weight,
        price: formData.price,
        ownership: formData.ownership
      }
      
      console.log('Attempting to insert data:', insertData)
      
      const { data, error } = await supabase
        .from('instruments')
        .insert([insertData])
        .select()

      if (error) {
        console.error('Supabase insert error:', error)
        alert(`Failed to add instrument: ${error.message}`)
        return
      }
      
      console.log('Successfully added instrument:', data)
      
      // Upload images if any
      if (selectedFiles.length > 0) {
        try {
          await uploadImages(data[0].id)
        } catch (error) {
          console.error('Error uploading images:', error)
          alert(`Instrument added successfully, but there was an error uploading images: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      
      // Reset form and close modal
      setFormData({
        status: 'Available',
        maker: '',
        type: '',
        year: new Date().getFullYear(),
        certificate: false,
        size: '',
        weight: '',
        price: 0,
        ownership: ''
      })
      setSelectedFiles([])
      setShowModal(false)
      
      // Refresh the instruments list
      console.log('Refreshing instruments list...')
      await fetchInstruments()
      
      // Show success message
      alert('Instrument added successfully!')
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
    if (!selectedInstrument) return
    
    console.log('Update submission started')
    
    // Validate required fields
    if (!viewFormData.maker || !viewFormData.type || !viewFormData.size || !viewFormData.weight || !viewFormData.ownership) {
      alert('Please fill in all required fields: Maker, Type, Size, Weight, and Ownership')
      return
    }
    
    if (viewFormData.price <= 0) {
      alert('Please enter a valid price greater than 0')
      return
    }
    
    setSubmitting(true)
    
    try {
      // Update instrument data
      const updateData = {
        status: viewFormData.status,
        maker: viewFormData.maker,
        type: viewFormData.type,
        year: viewFormData.year,
        certificate: viewFormData.certificate,
        size: viewFormData.size,
        weight: viewFormData.weight,
        price: viewFormData.price,
        ownership: viewFormData.ownership
      }
      
      console.log('Attempting to update instrument:', selectedInstrument.id, updateData)
      
      const { data, error } = await supabase
        .from('instruments')
        .update(updateData)
        .eq('id', selectedInstrument.id)
        .select()

      if (error) {
        console.error('Supabase update error:', error)
        alert(`Failed to update instrument: ${error.message}`)
        return
      }
      
      console.log('Successfully updated instrument:', data)
      
      // Delete images
      for (const imageId of imagesToDelete) {
        // Get image record
        const img = instrumentImages.find(img => img.id === imageId)
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
        await uploadImages(selectedInstrument.id)
      }
      // Refresh images
      await fetchInstrumentImages(selectedInstrument.id)
      setImagesToDelete([])
      setSelectedFiles([])
      setIsEditing(false)
      
      // Refresh the instruments list
      await fetchInstruments()
      
      // Show success message
      alert('Instrument updated successfully!')
    } catch (error) {
      console.error('Unexpected error during update:', error)
      alert('An unexpected error occurred. Please check the console for details.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
              type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleViewInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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

  const uploadImages = async (instrumentId: string): Promise<string[]> => {
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
        const fileName = `${instrumentId}_${Date.now()}_${i}.${fileExt}`
        
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
            instrument_id: instrumentId,
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

  const fetchInstrumentImages = async (instrumentId: string) => {
    try {
      const { data, error } = await supabase
        .from('instrument_images')
        .select('*')
        .eq('instrument_id', instrumentId)
        .order('display_order', { ascending: true })
      
      if (error) throw error
      setInstrumentImages(data || [])
    } catch (error) {
      console.error('Error fetching instrument images:', error)
    }
  }

  const handleRowClick = (instrument: Instrument) => {
    setSelectedInstrument(instrument)
    setViewFormData({
      status: instrument.status,
      maker: instrument.maker || '',
      type: instrument.type || '',
      year: instrument.year || new Date().getFullYear(),
      certificate: instrument.certificate,
      size: instrument.size || '',
      weight: instrument.weight || '',
      price: instrument.price || 0,
      ownership: instrument.ownership || ''
    })
    setIsEditing(false)
    setShowViewModal(true)
    fetchInstrumentImages(instrument.id)
  }

  const handleEditClick = (e: React.MouseEvent, instrument: Instrument) => {
    e.stopPropagation() // Prevent row click
    setSelectedInstrument(instrument)
    setViewFormData({
      status: instrument.status,
      maker: instrument.maker || '',
      type: instrument.type || '',
      year: instrument.year || new Date().getFullYear(),
      certificate: instrument.certificate,
      size: instrument.size || '',
      weight: instrument.weight || '',
      price: instrument.price || 0,
      ownership: instrument.ownership || ''
    })
    setIsEditing(true)
    setShowViewModal(true)
    setImagesToDelete([])
    setSelectedFiles([])
  }

  // Get unique values for filter options
const getUniqueValues = (field: keyof Instrument) => {
  const values = instruments.map(instrument => instrument[field]).filter((value): value is string => typeof value === 'string' && value !== null)
  return [...new Set(values)]
}

const getUniqueMakers = () => getUniqueValues('maker')
const getUniqueTypes = () => getUniqueValues('type')
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
      ownership: [],
      certificate: [],
      priceRange: { min: '', max: '' }
    })
  }

  // Enhanced filtering logic
  const filteredInstruments = instruments
    .filter(instrument => {
      // Text search
      const matchesSearch = searchTerm === '' || 
        (instrument.maker?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        (instrument.type?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
        (instrument.ownership?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
      
      // Status filter
      const matchesStatus = filters.status.length === 0 || filters.status.includes(instrument.status)
      
      // Maker filter
      const matchesMaker = filters.maker.length === 0 || (instrument.maker && filters.maker.includes(instrument.maker))
      
      // Type filter
      const matchesType = filters.type.length === 0 || (instrument.type && filters.type.includes(instrument.type))
      
      // Ownership filter
      const matchesOwnership = filters.ownership.length === 0 || (instrument.ownership && filters.ownership.includes(instrument.ownership))
      
      // Certificate filter
      const matchesCertificate = filters.certificate.length === 0 || filters.certificate.includes(instrument.certificate)
      
      // Price range filter
      const price = instrument.price || 0
      const minPrice = filters.priceRange.min ? parseFloat(filters.priceRange.min) : 0
      const maxPrice = filters.priceRange.max ? parseFloat(filters.priceRange.max) : Infinity
      const matchesPrice = price >= minPrice && price <= maxPrice
      
      return matchesSearch && matchesStatus && matchesMaker && matchesType && matchesOwnership && matchesCertificate && matchesPrice
    })
    .sort((a, b) => {
      const aValue = a[sortBy as keyof Instrument]
      const bValue = b[sortBy as keyof Instrument]
      
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

  return (
    <div className="min-h-screen bg-white flex">
      {/* Collapsible Sidebar */}
      <div 
        className={`bg-white shadow-lg transition-all duration-300 ease-in-out ${
          sidebarExpanded ? 'w-64' : 'w-16'
        }`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div className="p-6">
          <h1 className={`text-xl font-bold text-gray-900 transition-opacity duration-300 ${
            sidebarExpanded ? 'opacity-100' : 'opacity-0'
          }`}>
            Inventory Manager
          </h1>
        </div>
        <nav className="mt-6">
          <div className={`px-6 py-3 bg-blue-50 border-r-2 border-blue-500 transition-all duration-300 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          } flex items-center`}>
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className={`ml-3 text-blue-700 font-medium transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Instruments
            </span>
          </div>
          <div className={`px-6 py-3 hover:bg-gray-50 cursor-pointer transition-all duration-300 ${
            sidebarExpanded ? 'justify-start' : 'justify-center'
          } flex items-center`}>
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className={`ml-3 text-gray-700 transition-opacity duration-300 ${
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            }`}>
              Customers
            </span>
          </div>
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

      {/* Main Content - Responsive to form state */}
      <div className={`flex-1 transition-all duration-300 ease-in-out ${
        showModal || showViewModal ? 'mr-96' : 'mr-0'
      } bg-white`}>
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Instruments</h2>
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
                  placeholder="Search instruments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-500"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                </svg>
                Filters
              </button>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              >
                <option value="created_at">Date Added</option>
                <option value="maker">Maker</option>
                <option value="type">Type</option>
                <option value="year">Year</option>
                <option value="price">Price</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            
                         {/* Filter Panel */}
             {showFilters && (
               <div className="border-t border-gray-200 pt-4 bg-gray-50 rounded-lg p-4">
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

          {/* Instruments Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Maker</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Certificate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ownership</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">Loading instruments...</td>
                    </tr>
                  ) : filteredInstruments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-gray-500">No instruments found.</td>
                    </tr>
                  ) : (
                    filteredInstruments.map((instrument) => (
                      <tr 
                        key={instrument.id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleRowClick(instrument)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(instrument.status)}`}>{instrument.status}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{instrument.maker || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{instrument.type || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{instrument.year || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${instrument.certificate ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{instrument.certificate ? 'Yes' : 'No'}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${instrument.price ? instrument.price.toLocaleString() : '0'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{instrument.ownership || '-'}</td>
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
                <h3 className="text-lg font-medium text-gray-900">Add New Instrument</h3>
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
                      placeholder="e.g., Gibson, Fender"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <input
                      type="text"
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="e.g., Electric Guitar, Piano"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <input
                      type="number"
                      name="year"
                      value={formData.year}
                      onChange={handleInputChange}
                      required
                      min="1900"
                      max={new Date().getFullYear()}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                    <input
                      type="text"
                      name="size"
                      value={formData.size}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="e.g., Full Size, 3/4"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight</label>
                    <input
                      type="text"
                      name="weight"
                      value={formData.weight}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="e.g., 8.5 lbs"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                    <input
                      type="number"
                      name="price"
                      value={formData.price}
                      onChange={handleInputChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ownership</label>
                    <input
                      type="text"
                      name="ownership"
                      value={formData.ownership}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="e.g., Personal, Company"
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
                  disabled={submitting || uploadingImages}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : uploadingImages ? 'Uploading Images...' : 'Add Instrument'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View/Edit Instrument Side Panel */}
      {showViewModal && selectedInstrument && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-40 border-l border-gray-200">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  {isEditing ? 'Edit Instrument' : 'Instrument Details'}
                </h3>
                <button
                  onClick={() => {
                    setShowViewModal(false)
                    setSelectedInstrument(null)
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
                {instrumentImages.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Images</label>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {instrumentImages.map((image) => (
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
                </div>
              </div>
            )}
            
            {/* Edit Mode (leave as-is for now) */}
            {isEditing && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Existing Images */}
                {instrumentImages.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Existing Images</label>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {instrumentImages.filter(img => !imagesToDelete.includes(img.id)).map((image) => (
                        <div key={image.id} className="relative group">
                          <img
                            src={image.image_url}
                            alt={image.file_name}
                            className="w-full h-32 object-cover rounded-lg border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => setImagesToDelete(prev => [...prev, image.id])}
                            className="absolute top-1 right-1 bg-white bg-opacity-80 rounded-full p-1 text-red-600 hover:text-red-800 shadow group-hover:opacity-100 opacity-80"
                            title="Delete image"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Upload New Images */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Add Images</label>
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
                      placeholder="e.g., Gibson, Fender"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <input
                      type="text"
                      name="type"
                      value={viewFormData.type}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="e.g., Electric Guitar, Piano"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <input
                      type="number"
                      name="year"
                      value={viewFormData.year}
                      onChange={handleViewInputChange}
                      required
                      min="1900"
                      max={new Date().getFullYear()}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                    <input
                      type="text"
                      name="size"
                      value={viewFormData.size}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="e.g., Full Size, 3/4"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight</label>
                    <input
                      type="text"
                      name="weight"
                      value={viewFormData.weight}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="e.g., 8.5 lbs"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                    <input
                      type="number"
                      name="price"
                      value={viewFormData.price}
                      onChange={handleViewInputChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ownership</label>
                    <input
                      type="text"
                      name="ownership"
                      value={viewFormData.ownership}
                      onChange={handleViewInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                      placeholder="e.g., Personal, Company"
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
                  
                  {/* Images Display */}
                  {instrumentImages.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Images ({instrumentImages.length})</label>
                      <div className="grid grid-cols-2 gap-2">
                        {instrumentImages.map((image, index) => (
                          <div key={image.id} className="relative group">
                            <img
                              src={image.image_url}
                              alt={image.file_name}
                              className="w-full h-32 object-cover rounded-lg border border-gray-200"
                            />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 rounded-lg flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => window.open(image.image_url, '_blank')}
                                className="opacity-0 group-hover:opacity-100 text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm transition-opacity duration-200"
                              >
                                View Full Size
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Footer (Edit button in detail view) */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex justify-end space-x-3">
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Edit Instrument
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
                      {submitting ? 'Updating...' : 'Update Instrument'}
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