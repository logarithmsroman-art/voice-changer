import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server client (uses service role key — server-side only)
export function createServiceClient() {
  return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type VoiceProfile = {
  id: string;
  name: string;
  sample_url: string;
  is_active: boolean;
  created_at: string;
};
