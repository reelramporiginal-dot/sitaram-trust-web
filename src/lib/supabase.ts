import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://demo-project.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-anon-key'

export const isSupabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type SiteData = {
  settings?: unknown
  rooms?: unknown
  videos?: unknown
  temples?: unknown
  bookings?: unknown
  reviews?: unknown
  services?: unknown
}

export async function loadSiteDataFromSupabase(): Promise<SiteData | null> {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.from('site_config').select('data').eq('id', 'main').maybeSingle()
  if (error) {
    console.error('Supabase load failed:', error.message)
    return null
  }
  if (!data) return null
  return (data.data as SiteData) || null
}

export async function saveSiteDataToSupabase(data: SiteData) {
  if (!isSupabaseConfigured) return { ok: false, reason: 'Supabase environment variables are not configured.' }
  const { error } = await supabase.from('site_config').upsert({ id: 'main', data, updated_at: new Date().toISOString() })
  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}

export async function uploadPublicAsset(file: File, folder = 'site-assets') {
  if (!isSupabaseConfigured) return { publicUrl: '', error: 'Supabase is not configured.' }
  const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `${folder}/${Date.now()}-${clean}`
  const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true })
  if (error) return { publicUrl: '', error: error.message }
  const { data } = supabase.storage.from('media').getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: '' }
}
