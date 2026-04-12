-- ============================================================
-- Performance indexes
-- ============================================================

-- organizations
CREATE INDEX IF NOT EXISTS idx_organizations_id ON public.organizations(id);

-- instruments
CREATE INDEX IF NOT EXISTS idx_instruments_org_id     ON public.instruments(org_id);
CREATE INDEX IF NOT EXISTS idx_instruments_status     ON public.instruments(status);
CREATE INDEX IF NOT EXISTS idx_instruments_subtype    ON public.instruments(subtype) WHERE subtype IS NOT NULL;

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_org_id ON public.clients(org_id);

-- client_instruments
CREATE INDEX IF NOT EXISTS idx_client_instruments_org_id                        ON public.client_instruments(org_id);
CREATE INDEX IF NOT EXISTS idx_client_instruments_client_id                     ON public.client_instruments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_instruments_instrument_id                 ON public.client_instruments(instrument_id);
CREATE INDEX IF NOT EXISTS idx_client_instruments_display_order                 ON public.client_instruments(display_order);
CREATE INDEX IF NOT EXISTS idx_client_instruments_instrument_relationship_org   ON public.client_instruments(instrument_id, relationship_type, org_id);

-- sales_history
CREATE INDEX IF NOT EXISTS idx_sales_history_org_id                        ON public.sales_history(org_id);
CREATE INDEX IF NOT EXISTS idx_sales_history_instrument_org_sale_date      ON public.sales_history(instrument_id, org_id, sale_date);
CREATE INDEX IF NOT EXISTS sales_history_adjustment_of_sale_id_idx         ON public.sales_history(adjustment_of_sale_id);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_org_id    ON public.invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);

-- invoice_items
CREATE INDEX IF NOT EXISTS idx_invoice_items_org_id           ON public.invoice_items(org_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id       ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id_org_id ON public.invoice_items(invoice_id, org_id);

-- invoice_settings
CREATE INDEX IF NOT EXISTS idx_invoice_settings_org_id ON public.invoice_settings(org_id);

-- instrument_images
CREATE INDEX IF NOT EXISTS idx_instrument_images_instrument_display_order ON public.instrument_images(instrument_id, display_order);

-- instrument_certificates
CREATE INDEX IF NOT EXISTS idx_instrument_certificates_instrument_created_at_desc ON public.instrument_certificates(instrument_id, created_at DESC);

-- maintenance_tasks
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_org_id            ON public.maintenance_tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_instrument_id     ON public.maintenance_tasks(instrument_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_client_id         ON public.maintenance_tasks(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_status            ON public.maintenance_tasks(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_due_date          ON public.maintenance_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_scheduled_date    ON public.maintenance_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_personal_due_date ON public.maintenance_tasks(personal_due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_received_date     ON public.maintenance_tasks(received_date);

-- contact_logs
CREATE INDEX IF NOT EXISTS idx_contact_logs_org_id               ON public.contact_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_client_id            ON public.contact_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_instrument_id        ON public.contact_logs(instrument_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_date         ON public.contact_logs(contact_date);
CREATE INDEX IF NOT EXISTS idx_contact_logs_next_follow_up_date  ON public.contact_logs(next_follow_up_date);
CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_type         ON public.contact_logs(contact_type);
CREATE INDEX IF NOT EXISTS idx_contact_logs_follow_up_completed_at ON public.contact_logs(follow_up_completed_at) WHERE follow_up_completed_at IS NULL;

-- notification_settings
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON public.notification_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_settings_enabled ON public.notification_settings(enabled) WHERE enabled = true;

-- idempotency tables
CREATE INDEX IF NOT EXISTS idx_invoice_idempotency_lookup ON public.invoice_idempotency_keys(org_id, user_id, route_key, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sales_idempotency_lookup   ON public.sales_idempotency_keys(org_id, user_id, route_key, idempotency_key);

-- invoice_image_uploads
CREATE INDEX IF NOT EXISTS idx_invoice_image_uploads_linked_invoice_id   ON public.invoice_image_uploads(linked_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_image_uploads_expired_unclaimed    ON public.invoice_image_uploads(org_id, expires_at) WHERE linked_invoice_id IS NULL;
