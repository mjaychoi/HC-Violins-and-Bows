// Database Types
export interface Instrument {
  id: string;
  status: 'Available' | 'Booked' | 'Sold' | 'Reserved' | 'Maintenance';
  maker: string | null;
  type: string | null;
  subtype: string | null;
  year: number | null;
  certificate: boolean | null;
  has_certificate?: boolean;
  certificate_name?: string | null;
  cost_price?: number | null;
  consignment_price?: number | null;
  size: string | null;
  weight: string | null;
  price: number | null;
  ownership: string | null;
  note: string | null;
  serial_number: string | null; // 악기 고유 번호
  created_at: string;
  updated_at?: string | null; // Optional: automatically updated by database trigger
}

export interface InstrumentImage {
  id: string;
  instrument_id: string;
  image_url: string;
  alt_text: string | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  display_order: number;
  created_at: string;
}

export interface Client {
  id: string;
  last_name: string | null;
  first_name: string | null;
  contact_number: string | null;
  email: string | null;
  tags: string[];
  interest: string | null;
  note: string | null;
  client_number: string | null; // 클라이언트 고유 번호
  type?: 'Musician' | 'Dealer' | 'Collector' | 'Regular';
  status?: 'Active' | 'Browsing' | 'In Negotiation' | 'Inactive';
  created_at: string;
  address?: string | null;
}

// Relationship types
export type RelationshipType = 'Interested' | 'Sold' | 'Booked' | 'Owned';

export interface ClientInstrument {
  id: string;
  client_id: string;
  instrument_id: string;
  relationship_type: RelationshipType;
  notes: string | null;
  display_order?: number; // Display order for drag & drop sorting
  created_at: string | null;
  client?: Client | null;
  instrument?: Instrument | null;
}

// Form data types
export interface FormData {
  maker: string;
  name: string;
  year: string;
}

// Search and filter types
export interface SearchFilters {
  status?: string;
  maker?: string;
  type?: string;
  year?: string;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  error?: string;
  success: boolean;
}

// Maintenance Task Types
export type TaskType =
  | 'repair' // 수리
  | 'rehair' // 활털 갈기
  | 'maintenance' // 정기 점검
  | 'inspection' // 검사
  | 'setup' // 세팅
  | 'adjustment' // 조정
  | 'restoration'; // 복원

export type TaskStatus =
  | 'pending' // 대기
  | 'in_progress' // 진행중
  | 'completed' // 완료
  | 'cancelled'; // 취소

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface MaintenanceTask {
  id: string;
  instrument_id: string | null;
  client_id: string | null; // 클라이언트 ID (선택사항)
  task_type: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  received_date: string; // YYYY-MM-DD
  due_date: string | null; // YYYY-MM-DD
  personal_due_date: string | null; // YYYY-MM-DD
  scheduled_date: string | null; // YYYY-MM-DD
  completed_date: string | null; // YYYY-MM-DD
  priority: TaskPriority;
  estimated_hours: number | null;
  actual_hours: number | null;
  cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  instrument?: Instrument; // 관계 데이터
  client?: Client; // 관계 데이터
}

export type MaintenanceTaskUpdatePayload = Partial<
  Omit<
    MaintenanceTask,
    'id' | 'created_at' | 'updated_at' | 'instrument' | 'client'
  >
>;

// Calendar Event Types
export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  tasks: MaintenanceTask[];
  count: number;
}

// Sales History Types
export interface SalesHistory {
  id: string;
  instrument_id: string | null;
  client_id: string | null;
  sale_price: number;
  sale_date: string; // YYYY-MM-DD
  notes: string | null;
  created_at: string;
  client?: Client;
  instrument?: Instrument;
}

/**
 * Enriched sale with resolved client and instrument relationships.
 * Used in Sales History page for display and operations.
 */
export type EnrichedSale = SalesHistory & {
  client?: Client;
  instrument?: Instrument;
};

// Task Filter Types
export interface TaskFilters {
  instrument_id?: string;
  status?: TaskStatus;
  task_type?: TaskType;
  priority?: TaskPriority;
  date_from?: string;
  date_to?: string;
  search?: string;
}
// =====================
// Invoice Types (ADD)
// =====================

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'void';

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  instrument_id: string | null;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  image_url: string | null;
  display_order: number;
  created_at: string;
  instrument?: Instrument | null;
}

export interface Invoice {
  id: string;
  invoice_number: string | null;
  status: InvoiceStatus;
  invoice_date: string; // YYYY-MM-DD or ISO; keep consistent in app
  due_date: string | null;
  client_id: string | null;
  items?: InvoiceItem[];
  subtotal: number;
  tax: number | null;
  total: number;
  currency: string;
  notes?: string | null;
  created_at: string;
  updated_at?: string;

  business_name?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  bank_account_holder?: string | null;
  bank_name?: string | null;
  bank_swift_code?: string | null;
  bank_account_number?: string | null;
  default_conditions?: string | null;
  default_exchange_rate?: string | null;

  // optional relationships for UI convenience
  client?: Client | null;
}

// Contact Log Types
export type ContactType = 'email' | 'phone' | 'meeting' | 'note' | 'follow_up';

export type ContactPurpose =
  | 'quote' // 견적
  | 'follow_up' // Follow-up
  | 'maintenance' // 유지보수
  | 'sale' // 판매
  | 'inquiry' // 문의
  | 'other'; // 기타

export interface ContactLog {
  id: string;
  client_id: string;
  instrument_id: string | null;
  contact_type: ContactType;
  subject: string | null;
  content: string;
  contact_date: string; // YYYY-MM-DD
  next_follow_up_date: string | null; // YYYY-MM-DD
  follow_up_completed_at: string | null; // ISO timestamp
  purpose: ContactPurpose | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  instrument?: Instrument;
}

// Re-export sort types
export * from './sort';

// Re-export message template types
export * from './messageTemplates';
