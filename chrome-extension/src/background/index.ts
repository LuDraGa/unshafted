import { supabase } from '@extension/supabase';

console.info('[Unshafted] background worker ready');

// Keep Supabase session alive — auto-refresh tokens in the background
supabase.auth.onAuthStateChange((event, session) => {
  console.info('[Unshafted] auth state:', event, session?.user?.email ?? 'no user');
});
