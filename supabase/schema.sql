-- Voice profiles table
create table if not exists voice_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sample_url text not null,       -- Cloudflare R2 public URL
  is_active boolean default false,
  created_at timestamptz default now()
);

-- Only one profile can be active at a time
-- Enforce this in application logic (set all to false before setting one to true)

-- Enable RLS (no auth needed for single-tenant, but good practice)
alter table voice_profiles enable row level security;

-- Allow all operations (single-tenant, no user auth)
create policy "Allow all" on voice_profiles for all using (true) with check (true);

-- RVC models table (trained .pth models uploaded by user)
create table if not exists rvc_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pth_url text not null,       -- Cloudflare R2 public URL for .pth file
  index_url text,              -- Cloudflare R2 public URL for .index file (optional)
  created_at timestamptz default now()
);

alter table rvc_models enable row level security;
create policy "Allow all" on rvc_models for all using (true) with check (true);
