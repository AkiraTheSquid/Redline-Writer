import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// null in local dev (no env vars set); real client on Vercel
export const supabase = url && key ? createClient(url, key) : null;
