/**
 * Cloud configuration.
 * Builds default to the Carry Cloud project below. Override at build time with
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, or in the app under League → Cloud sync
 * (stored in this browser only). Set VITE_SUPABASE_URL=off to build a local-only copy.
 * The publishable key is meant to be public: row-level security in supabase/schema.sql protects data.
 */
const DEFAULT_URL = 'https://wneltrdjfgoxfjuvphay.supabase.co';
const DEFAULT_KEY = 'sb_publishable_EIlCpB7UPiX7oNzj6c8kqw_MkbuuHST';

const envUrl = import.meta.env?.VITE_SUPABASE_URL;
const envKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
export const SUPABASE_URL = envUrl === 'off' ? '' : envUrl || DEFAULT_URL;
export const SUPABASE_ANON_KEY = envUrl === 'off' ? '' : envKey || DEFAULT_KEY;

export function cloudConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('carry:cloud') || 'null');
    if (saved?.url && saved?.key) return { url: saved.url, key: saved.key, source: 'browser' };
  } catch {}
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, source: 'build' };
  return null;
}
/** true when this build ships with a league server, so cloud is the default */
export const hasBuiltInCloud = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);
export function saveCloudConfig(cfg) {
  if (cfg) localStorage.setItem('carry:cloud', JSON.stringify(cfg));
  else localStorage.removeItem('carry:cloud');
}
