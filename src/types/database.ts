export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '12.2.3 (519615d)';
  };
  public: {
    Tables: {
      client_instruments: {
        Row: {
          client_id: string | null;
          created_at: string | null;
          display_order: number;
          id: string;
          instrument_id: string | null;
          notes: string | null;
          org_id: string | null;
          relationship_type: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string | null;
          display_order?: number;
          id?: string;
          instrument_id?: string | null;
          notes?: string | null;
          org_id?: string | null;
          relationship_type?: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string | null;
          display_order?: number;
          id?: string;
          instrument_id?: string | null;
          notes?: string | null;
          org_id?: string | null;
          relationship_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_instruments_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_instruments_instrument_id_fkey';
            columns: ['instrument_id'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['id'];
          },
        ];
      };
      clients: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          client_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          client_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          client_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      contact_logs: {
        Row: {
          client_id: string | null;
          contact_date: string;
          contact_type: string;
          content: string;
          created_at: string | null;
          follow_up_completed_at: string | null;
          id: string;
          instrument_id: string | null;
          next_follow_up_date: string | null;
          org_id: string | null;
          purpose: string | null;
          subject: string | null;
          updated_at: string | null;
        };
        Insert: {
          client_id?: string | null;
          contact_date: string;
          contact_type: string;
          content: string;
          created_at?: string | null;
          follow_up_completed_at?: string | null;
          id?: string;
          instrument_id?: string | null;
          next_follow_up_date?: string | null;
          org_id?: string | null;
          purpose?: string | null;
          subject?: string | null;
          updated_at?: string | null;
        };
        Update: {
          client_id?: string | null;
          contact_date?: string;
          contact_type?: string;
          content?: string;
          created_at?: string | null;
          follow_up_completed_at?: string | null;
          id?: string;
          instrument_id?: string | null;
          next_follow_up_date?: string | null;
          org_id?: string | null;
          purpose?: string | null;
          subject?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contact_logs_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contact_logs_instrument_id_fkey';
            columns: ['instrument_id'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['id'];
          },
        ];
      };
      instrument_certificates: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          id: string;
          instrument_id: string | null;
          is_primary: boolean | null;
          mime_type: string | null;
          org_id: string | null;
          original_name: string | null;
          size: number | null;
          storage_path: string;
          version: number | null;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          instrument_id?: string | null;
          is_primary?: boolean | null;
          mime_type?: string | null;
          org_id?: string | null;
          original_name?: string | null;
          size?: number | null;
          storage_path: string;
          version?: number | null;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          instrument_id?: string | null;
          is_primary?: boolean | null;
          mime_type?: string | null;
          org_id?: string | null;
          original_name?: string | null;
          size?: number | null;
          storage_path?: string;
          version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'instrument_certificates_instrument_id_fkey';
            columns: ['instrument_id'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['id'];
          },
        ];
      };
      instrument_images: {
        Row: {
          created_at: string | null;
          display_order: number | null;
          file_name: string;
          file_size: number;
          id: string;
          image_url: string;
          instrument_id: string | null;
          mime_type: string;
          org_id: string | null;
          storage_key: string | null;
        };
        Insert: {
          created_at?: string | null;
          display_order?: number | null;
          file_name: string;
          file_size: number;
          id?: string;
          image_url: string;
          instrument_id?: string | null;
          mime_type: string;
          org_id?: string | null;
          storage_key?: string | null;
        };
        Update: {
          created_at?: string | null;
          display_order?: number | null;
          file_name?: string;
          file_size?: number;
          id?: string;
          image_url?: string;
          instrument_id?: string | null;
          mime_type?: string;
          org_id?: string | null;
          storage_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'instrument_images_instrument_id_fkey';
            columns: ['instrument_id'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['id'];
          },
        ];
      };
      instruments: {
        Row: {
          certificate: boolean | null;
          certificate_name: string | null;
          condition: string | null;
          consignment_price: number | null;
          cost_price: number | null;
          created_at: string | null;
          description: string | null;
          id: string;
          image_url: string | null;
          maker: string | null;
          note: string | null;
          notes: string | null;
          org_id: string | null;
          ownership: string | null;
          price: number | null;
          reserved_by_user_id: string | null;
          reserved_connection_id: string | null;
          reserved_reason: string | null;
          serial_number: string | null;
          size: string | null;
          status: string | null;
          subtype: string | null;
          type: string | null;
          updated_at: string | null;
          weight: string | null;
          year: number | null;
        };
        Insert: {
          certificate?: boolean | null;
          certificate_name?: string | null;
          condition?: string | null;
          consignment_price?: number | null;
          cost_price?: number | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          maker?: string | null;
          note?: string | null;
          notes?: string | null;
          org_id?: string | null;
          ownership?: string | null;
          price?: number | null;
          reserved_by_user_id?: string | null;
          reserved_connection_id?: string | null;
          reserved_reason?: string | null;
          serial_number?: string | null;
          size?: string | null;
          status?: string | null;
          subtype?: string | null;
          type?: string | null;
          updated_at?: string | null;
          weight?: string | null;
          year?: number | null;
        };
        Update: {
          certificate?: boolean | null;
          certificate_name?: string | null;
          condition?: string | null;
          consignment_price?: number | null;
          cost_price?: number | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          maker?: string | null;
          note?: string | null;
          notes?: string | null;
          org_id?: string | null;
          ownership?: string | null;
          price?: number | null;
          reserved_by_user_id?: string | null;
          reserved_connection_id?: string | null;
          reserved_reason?: string | null;
          serial_number?: string | null;
          size?: string | null;
          status?: string | null;
          subtype?: string | null;
          type?: string | null;
          updated_at?: string | null;
          weight?: string | null;
          year?: number | null;
        };
        Relationships: [];
      };
      invoice_items: {
        Row: {
          amount: number;
          created_at: string | null;
          description: string;
          display_order: number | null;
          id: string;
          image_url: string | null;
          instrument_id: string | null;
          invoice_id: string;
          item_number: string | null;
          qty: number;
          rate: number;
        };
        Insert: {
          amount: number;
          created_at?: string | null;
          description: string;
          display_order?: number | null;
          id?: string;
          image_url?: string | null;
          instrument_id?: string | null;
          invoice_id: string;
          item_number?: string | null;
          qty?: number;
          rate: number;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          description?: string;
          display_order?: number | null;
          id?: string;
          image_url?: string | null;
          instrument_id?: string | null;
          invoice_id?: string;
          item_number?: string | null;
          qty?: number;
          rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_items_instrument_id_fkey';
            columns: ['instrument_id'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoice_items_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_settings: {
        Row: {
          address: string | null;
          bank_account_holder: string | null;
          bank_account_number: string | null;
          bank_name: string | null;
          bank_swift_code: string | null;
          business_address: string | null;
          business_email: string | null;
          business_name: string;
          business_phone: string | null;
          created_at: string | null;
          default_conditions: string | null;
          default_currency: string;
          default_exchange_rate: number | null;
          email: string | null;
          id: string;
          org_id: string | null;
          phone: string | null;
          updated_at: string | null;
        };
        Insert: {
          address?: string | null;
          bank_account_holder?: string | null;
          bank_account_number?: string | null;
          bank_name?: string | null;
          bank_swift_code?: string | null;
          business_address?: string | null;
          business_email?: string | null;
          business_name?: string;
          business_phone?: string | null;
          created_at?: string | null;
          default_conditions?: string | null;
          default_currency?: string;
          default_exchange_rate?: number | null;
          email?: string | null;
          id?: string;
          org_id?: string | null;
          phone?: string | null;
          updated_at?: string | null;
        };
        Update: {
          address?: string | null;
          bank_account_holder?: string | null;
          bank_account_number?: string | null;
          bank_name?: string | null;
          bank_swift_code?: string | null;
          business_address?: string | null;
          business_email?: string | null;
          business_name?: string;
          business_phone?: string | null;
          created_at?: string | null;
          default_conditions?: string | null;
          default_currency?: string;
          default_exchange_rate?: number | null;
          email?: string | null;
          id?: string;
          org_id?: string | null;
          phone?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          bank_account_holder: string | null;
          bank_account_number: string | null;
          bank_name: string | null;
          bank_swift_code: string | null;
          business_address: string | null;
          business_email: string | null;
          business_name: string | null;
          business_phone: string | null;
          client_id: string | null;
          conditions: string | null;
          created_at: string | null;
          currency: string;
          default_conditions: string | null;
          default_exchange_rate: string | null;
          due_date: string | null;
          exchange_rate: number | null;
          id: string;
          invoice_date: string;
          invoice_number: string;
          item_number: string | null;
          notes: string | null;
          org_id: string | null;
          ship_to: string | null;
          status: string;
          subtotal: number;
          tax: number | null;
          total: number;
          updated_at: string | null;
        };
        Insert: {
          bank_account_holder?: string | null;
          bank_account_number?: string | null;
          bank_name?: string | null;
          bank_swift_code?: string | null;
          business_address?: string | null;
          business_email?: string | null;
          business_name?: string | null;
          business_phone?: string | null;
          client_id?: string | null;
          conditions?: string | null;
          created_at?: string | null;
          currency?: string;
          default_conditions?: string | null;
          default_exchange_rate?: string | null;
          due_date?: string | null;
          exchange_rate?: number | null;
          id?: string;
          invoice_date?: string;
          invoice_number?: string;
          item_number?: string | null;
          notes?: string | null;
          org_id?: string | null;
          ship_to?: string | null;
          status?: string;
          subtotal?: number;
          tax?: number | null;
          total?: number;
          updated_at?: string | null;
        };
        Update: {
          bank_account_holder?: string | null;
          bank_account_number?: string | null;
          bank_name?: string | null;
          bank_swift_code?: string | null;
          business_address?: string | null;
          business_email?: string | null;
          business_name?: string | null;
          business_phone?: string | null;
          client_id?: string | null;
          conditions?: string | null;
          created_at?: string | null;
          currency?: string;
          default_conditions?: string | null;
          default_exchange_rate?: string | null;
          due_date?: string | null;
          exchange_rate?: number | null;
          id?: string;
          invoice_date?: string;
          invoice_number?: string;
          item_number?: string | null;
          notes?: string | null;
          org_id?: string | null;
          ship_to?: string | null;
          status?: string;
          subtotal?: number;
          tax?: number | null;
          total?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      maintenance_tasks: {
        Row: {
          actual_hours: number | null;
          client_id: string | null;
          completed_date: string | null;
          cost: number | null;
          created_at: string | null;
          description: string | null;
          due_date: string | null;
          estimated_hours: number | null;
          id: string;
          instrument_id: string | null;
          notes: string | null;
          org_id: string | null;
          personal_due_date: string | null;
          priority: string | null;
          received_date: string;
          scheduled_date: string | null;
          status: string;
          task_type: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          actual_hours?: number | null;
          client_id?: string | null;
          completed_date?: string | null;
          cost?: number | null;
          created_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          estimated_hours?: number | null;
          id?: string;
          instrument_id?: string | null;
          notes?: string | null;
          org_id?: string | null;
          personal_due_date?: string | null;
          priority?: string | null;
          received_date: string;
          scheduled_date?: string | null;
          status?: string;
          task_type: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          actual_hours?: number | null;
          client_id?: string | null;
          completed_date?: string | null;
          cost?: number | null;
          created_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          estimated_hours?: number | null;
          id?: string;
          instrument_id?: string | null;
          notes?: string | null;
          org_id?: string | null;
          personal_due_date?: string | null;
          priority?: string | null;
          received_date?: string;
          scheduled_date?: string | null;
          status?: string;
          task_type?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'maintenance_tasks_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maintenance_tasks_instrument_id_fkey';
            columns: ['instrument_id'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_settings: {
        Row: {
          created_at: string | null;
          days_before_due: number[] | null;
          email_notifications: boolean | null;
          enabled: boolean | null;
          last_notification_sent_at: string | null;
          notification_time: string | null;
          org_id: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          days_before_due?: number[] | null;
          email_notifications?: boolean | null;
          enabled?: boolean | null;
          last_notification_sent_at?: string | null;
          notification_time?: string | null;
          org_id?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          days_before_due?: number[] | null;
          email_notifications?: boolean | null;
          enabled?: boolean | null;
          last_notification_sent_at?: string | null;
          notification_time?: string | null;
          org_id?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales_history: {
        Row: {
          adjustment_of_sale_id: string | null;
          client_id: string | null;
          created_at: string | null;
          entry_kind: string | null;
          id: string;
          instrument_id: string | null;
          notes: string | null;
          org_id: string | null;
          sale_date: string;
          sale_price: number;
        };
        Insert: {
          adjustment_of_sale_id?: string | null;
          client_id?: string | null;
          created_at?: string | null;
          entry_kind?: string | null;
          id?: string;
          instrument_id?: string | null;
          notes?: string | null;
          org_id?: string | null;
          sale_date: string;
          sale_price: number;
        };
        Update: {
          adjustment_of_sale_id?: string | null;
          client_id?: string | null;
          created_at?: string | null;
          entry_kind?: string | null;
          id?: string;
          instrument_id?: string | null;
          notes?: string | null;
          org_id?: string | null;
          sale_date?: string;
          sale_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'sales_history_instrument_id_fkey';
            columns: ['instrument_id'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_connection_atomic: {
        Args: {
          p_client_id: string;
          p_instrument_id: string;
          p_relationship_type: string;
          p_notes?: string | null;
        };
        Returns: string;
      };
      create_client_with_connections_atomic: {
        Args: {
          p_name: string;
          p_email?: string | null;
          p_phone?: string | null;
          p_client_number?: string | null;
          p_links?: Json | null;
        };
        Returns: string;
      };
      create_instrument_certificate_metadata: {
        Args: {
          p_instrument_id: string;
          p_storage_path: string;
          p_original_name: string;
          p_mime_type: string;
          p_size: number;
          p_created_by: string;
        };
        Returns: string;
      };
      create_instrument_image_metadata: {
        Args: {
          p_instrument_id: string;
          p_image_url: string;
          p_storage_key: string;
          p_file_name: string;
          p_file_size: number;
          p_mime_type: string;
        };
        Returns: string;
      };
      create_invoice_atomic: {
        Args: {
          p_invoice: Json;
          p_items: Json;
        };
        Returns: string;
      };
      create_invoice_atomic_idempotent: {
        Args: {
          p_route_key: string;
          p_idempotency_key: string;
          p_request_hash: string;
          p_invoice: Json;
          p_items: Json;
        };
        Returns: string;
      };
      create_sale_adjustment_atomic: {
        Args: {
          p_source_sale_id: string;
          p_adjustment_kind: string;
          p_notes?: string | null;
        };
        Returns: string;
      };
      create_sale_atomic_idempotent: {
        Args: {
          p_route_key: string;
          p_idempotency_key: string;
          p_request_hash: string;
          p_sale_price: number;
          p_sale_date: string;
          p_client_id?: string | null;
          p_instrument_id?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      delete_connection_atomic: {
        Args: {
          p_connection_id: string;
        };
        Returns: string;
      };
      generate_invoice_number: { Args: never; Returns: string };
      reorder_connections_atomic: {
        Args: {
          p_orders: Json;
        };
        Returns: undefined;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
      update_connection_atomic: {
        Args: {
          p_connection_id: string;
          p_updates: Json;
        };
        Returns: string;
      };
      update_instrument_sale_transition_atomic: {
        Args: {
          p_instrument_id: string;
          p_sale_price: number;
          p_sale_date: string;
          p_client_id?: string | null;
          p_sales_note?: string | null;
        };
        Returns: Json;
      };
      update_invoice_atomic: {
        Args: {
          p_invoice_id: string;
          p_invoice: Json;
          p_items?: Json | null;
        };
        Returns: undefined;
      };
      update_sale_notes_atomic: {
        Args: {
          p_sale_id: string;
          p_notes?: string | null;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
