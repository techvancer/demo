
// supabaseClient.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://copbnvcjktyaplornmrp.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvcGJudmNqa3R5YXBsb3JubXJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NDAwODUsImV4cCI6MjA4NjAxNjA4NX0.jqnGteSxsIvZ1_IzQLJnHpM9_5U-bxn_7mwL4UU3XLs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ✅ Add this so DevTools can access it
window.supabase = supabase;
