CREATE TABLE IF NOT EXISTS instrument_certificates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument_id UUID REFERENCES instruments(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_primary BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS instrument_certificates_unique_path
  ON instrument_certificates(instrument_id, storage_path);

ALTER TABLE instrument_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to access instrument certificates" ON instrument_certificates;
CREATE POLICY "Allow authenticated users to access instrument certificates"
  ON instrument_certificates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to upload certificate files" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload certificate files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'instrument-certificates'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Allow authenticated users to view certificate files" ON storage.objects;
CREATE POLICY "Allow authenticated users to view certificate files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'instrument-certificates'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Allow authenticated users to delete certificate files" ON storage.objects;
CREATE POLICY "Allow authenticated users to delete certificate files"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'instrument-certificates'
    AND auth.role() = 'authenticated'
  );
