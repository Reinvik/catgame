import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Falta configurar las variables de entorno de Supabase en .env. El juego usará localStorage como fallback.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
