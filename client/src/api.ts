import { createClient } from "@supabase/supabase-js";
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 20 } } });
export type Character = { userId: string; name: string; color: string; variant: string };
/** Calls the `auth` edge function (wallet nonce/verify, guest, me, save). */
export async function fn<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/auth`, { method: "POST", headers: { "content-type": "application/json", apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j as T;
}
