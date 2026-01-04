export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'void';

export interface InvoiceItemInput {
  instrument_id: string | null;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  image_url: string | null;
  display_order: number;
}

export interface CreateInvoiceInput {
  client_id: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax: number | null;
  total: number;
  currency?: string;
  status?: InvoiceStatus;
  notes: string | null;
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
  items?: InvoiceItemInput[];
}
