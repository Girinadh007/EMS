import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lwqndwohtpngpmrlevfy.supabase.co';
// Note: This key looks different from the standard Supabase 'anon' key (which usually starts with 'eyJ...').
// If you get a '401 Unauthorized' error, please double-check the 'anon' (public) key in Settings -> API.
const supabaseKey = 'sb_publishable_JJJg5K0c_7BduaSqoyomZw_V5XYQUXR';

export const supabase = createClient(supabaseUrl, supabaseKey);
