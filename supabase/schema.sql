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
