/* =============================================
   UNSPOTTED — Cliente de Supabase
   ============================================= */

// TODO: reemplazar con el Project URL y la anon public key
// de Project Settings → API en supabase.com
const SUPABASE_URL = 'https://xpdrlrvdmmkmowfwexse.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZHJscnZkbW1rbW93ZndleHNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2OTU3MDYsImV4cCI6MjA5OTI3MTcwNn0.HpEbGITtjJzYpB7QTja7tNHlbsolkgjdGNcWLpXivAs';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
