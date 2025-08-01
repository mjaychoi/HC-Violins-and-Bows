-- Drop existing tables (in correct order due to foreign key constraints)
DROP TABLE IF EXISTS sales_history CASCADE;
DROP TABLE IF EXISTS client_instruments CASCADE;
DROP TABLE IF EXISTS instrument_images CASCADE;
DROP TABLE IF EXISTS instruments CASCADE;
DROP TABLE IF EXISTS clients CASCADE;

-- Add note column to existing instruments table
ALTER TABLE instruments ADD COLUMN note TEXT;

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  last_name TEXT,
  first_name TEXT,
  contact_number TEXT,
  email TEXT,
  type TEXT NOT NULL DEFAULT 'Regular' CHECK (type IN ('Musician', 'Dealer', 'Collector', 'Regular')),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Browsing', 'In Negotiation', 'Inactive')),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update the full schema for reference
DROP TABLE IF EXISTS instrument_images CASCADE;
DROP TABLE IF EXISTS instruments CASCADE;

CREATE TABLE instruments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Booked', 'Sold')),
  maker TEXT,
  type TEXT,
  year INTEGER,
  certificate BOOLEAN DEFAULT false,
  size TEXT,
  weight TEXT,
  price DECIMAL(10,2),
  ownership TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE instrument_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument_id UUID REFERENCES instruments(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create clients table (updated schema)
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  last_name TEXT,
  first_name TEXT,
  contact_number TEXT,
  email TEXT,
  type TEXT NOT NULL DEFAULT 'Regular' CHECK (type IN ('Musician', 'Dealer', 'Collector', 'Regular')),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Browsing', 'In Negotiation', 'Inactive')),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create client_instruments table (many-to-many relationship)
CREATE TABLE client_instruments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  instrument_id UUID REFERENCES instruments(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'Interested' CHECK (relationship_type IN ('Interested', 'Sold', 'Booked', 'Owned')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, instrument_id)
);

-- Create sales_history table
CREATE TABLE sales_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument_id UUID REFERENCES instruments(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  sale_price DECIMAL(10,2) NOT NULL,
  sale_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) policies
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE instrument_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (you can make this more restrictive later)
CREATE POLICY "Allow all operations for authenticated users" ON instruments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON instrument_images
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all operations for authenticated users" ON clients
  FOR ALL USING (auth.role() = 'authenticated');

-- Storage policies for instrument images
CREATE POLICY "Allow authenticated users to upload images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'instrument-images' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to view images" ON storage.objects
  FOR SELECT USING (bucket_id = 'instrument-images' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to delete images" ON storage.objects
  FOR DELETE USING (bucket_id = 'instrument-images' AND auth.role() = 'authenticated');

-- Allow listing buckets
CREATE POLICY "Allow authenticated users to list buckets" ON storage.buckets
  FOR SELECT USING (auth.role() = 'authenticated'); 