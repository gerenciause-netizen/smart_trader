
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pycgcnlfrcfumctjkpic.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5Y2djbmxmcmNmdW1jdGprcGljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyODI2OTUsImV4cCI6MjA4Mjg1ODY5NX0.bgDcm5NaPDMADb09Kp9Y0GKai45a5a-y0R_d9j-08o0';

export const supabase = createClient(supabaseUrl, supabaseKey);
