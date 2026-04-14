import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const adminSupabase = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);

// For backwards compatibility since vibe-code might use window
window.supabase = supabase;
window.adminSupabase = adminSupabase;
