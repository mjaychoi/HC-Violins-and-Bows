// Database Types
export interface Instrument {
  id: string;
  status: 'Available' | 'Booked' | 'Sold' | 'Reserved' | 'Maintenance';
  maker: string | null;
  type: string | null;
  subtype: string | null;
  year: number | null;
  certificate: boolean;
  size: string | null;
  weight: string | null;
  price: number | null;
  ownership: string | null;
  note: string | null;
  serial_number: string | null; // 악기 고유 번호
  created_at: string;
  updated_at?: string; // Optional: automatically updated by database trigger
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
}

// Relationship types
export type RelationshipType = 'Interested' | 'Sold' | 'Booked' | 'Owned';

export interface ClientInstrument {
  id: string;
  client_id: string;
  instrument_id: string;
  relationship_type: RelationshipType;
  notes: string | null;
  created_at: string;
  client?: Client;
  instrument?: Instrument;
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
  instrument_id: string;
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

// Calendar Event Types
export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  tasks: MaintenanceTask[];
  count: number;
}

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
