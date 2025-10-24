// Database Types
export interface Instrument {
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

export interface InstrumentImage {
  id: string
  instrument_id: string
  image_url: string
  alt_text: string | null
  file_name: string
  file_size: number
  mime_type: string
  display_order: number
  created_at: string
}

export interface Client {
  id: string
  last_name: string | null
  first_name: string | null
  contact_number: string | null
  email: string | null
  tags: string[]
  interest: string | null
  note: string | null
  type?: 'Musician' | 'Dealer' | 'Collector' | 'Regular'
  status?: 'Active' | 'Browsing' | 'In Negotiation' | 'Inactive'
  created_at: string
}

export interface ClientInstrument {
  id: string
  client_id: string
  instrument_id: string
  relationship_type: 'Interested' | 'Sold' | 'Booked' | 'Owned'
  notes: string | null
  created_at: string
  client?: Client
  instrument?: Instrument
}

// Form data types
export interface FormData {
  maker: string
  name: string
  year: string
}

// Search and filter types
export interface SearchFilters {
  status?: string
  maker?: string
  type?: string
  year?: string
}

// API Response types
export interface ApiResponse<T> {
  data: T
  error?: string
  success: boolean
}
