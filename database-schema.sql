-- Drop existing tables (in correct order due to foreign key constraints)
DROP TABLE IF EXISTS sales_history CASCADE;
DROP TABLE IF EXISTS client_instruments CASCADE;
DROP TABLE IF EXISTS instrument_images CASCADE;
DROP TABLE IF EXISTS instruments CASCADE;
DROP TABLE IF EXISTS clients CASCADE;

-- Create instruments table
CREATE TABLE instruments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Available' CHECK (status IN ('Available', 'Booked', 'Sold')),
  maker VARCHAR(255),
  type VARCHAR(255),
  year INTEGER,
  certificate BOOLEAN DEFAULT false,
  size VARCHAR(100),
  weight VARCHAR(100),
  price DECIMAL(10,2),
  ownership VARCHAR(255),
  description TEXT,
  image_url TEXT,
  condition VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create instrument_images table for multiple images per instrument
CREATE TABLE instrument_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument_id UUID REFERENCES instruments(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create clients table
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  contact_preference VARCHAR(50),
  price_range_min DECIMAL(10,2),
  price_range_max DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create client_instruments table (many-to-many relationship)
CREATE TABLE client_instruments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  instrument_id UUID REFERENCES instruments(id) ON DELETE CASCADE,
  interest_level VARCHAR(50), -- 'interested', 'tried', 'purchased'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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

-- Enable Row Level Security (RLS)
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE instrument_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_history ENABLE ROW LEVEL SECURITY;

-- Create policies (for now, allow all operations - you can restrict later)
CREATE POLICY "Allow all operations on instruments" ON instruments FOR ALL USING (true);
CREATE POLICY "Allow all operations on instrument_images" ON instrument_images FOR ALL USING (true);
CREATE POLICY "Allow all operations on clients" ON clients FOR ALL USING (true);
CREATE POLICY "Allow all operations on client_instruments" ON client_instruments FOR ALL USING (true);
CREATE POLICY "Allow all operations on sales_history" ON sales_history FOR ALL USING (true); 