# Cleanup Invoice Image Uploads Edge Function

This Edge Function deletes expired, unclaimed invoice image uploads from:

- Supabase Storage bucket: `invoices`
- Tracking table: `public.invoice_image_uploads`

It is intended for cron/server-side recovery only.

## Required environment variables

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CLEANUP_INVOICE_IMAGE_UPLOADS_SECRET=your_long_random_secret
```

## Deploy

```bash
supabase functions deploy cleanup-invoice-image-uploads
```

## Invoke

```bash
curl -X POST https://your-project.supabase.co/functions/v1/cleanup-invoice-image-uploads \
  -H "x-cleanup-invoice-image-uploads-secret: $CLEANUP_INVOICE_IMAGE_UPLOADS_SECRET"
```

Optional JSON body:

```json
{ "batchSize": 50 }
```

`batchSize` is capped to `100`.

## Cron example

```sql
SELECT cron.schedule(
  'cleanup-expired-invoice-image-uploads',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/cleanup-invoice-image-uploads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-invoice-image-uploads-secret', 'YOUR_CLEANUP_INVOICE_IMAGE_UPLOADS_SECRET'
    ),
    body := '{"batchSize":100}'::jsonb
  );
  $$
);
```

## Behavior

The function:

1. selects expired rows from `invoice_image_uploads` where `linked_invoice_id IS NULL`
2. deletes the storage object
3. deletes the tracking row only after storage deletion succeeds

If storage deletion fails, the tracking row is preserved for retry.

## Response

- `200`: all expired rows processed successfully
- `207`: partial cleanup completed, some rows failed and remain retryable
- `500`: fetch or unexpected runtime failure
