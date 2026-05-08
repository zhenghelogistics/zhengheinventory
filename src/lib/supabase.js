import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://dedagarmqqofcywvtndg.supabase.co';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_sMR3l9uQowePjQ5Msp4kYA_scXfkip9';

export const supabase = createClient(url, key);
