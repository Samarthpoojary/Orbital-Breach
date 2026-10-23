import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && anonKey && !url.includes('your-project'));
export const supabase = configured ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

export type Team = { id: string; team_name: string; participant1_name: string; participant1_email: string; participant2_name: string; participant2_email: string; status: 'active' | 'disqualified' };
export type EventSettings = { event_name: string; announcement: string | null; registration_open: boolean };

