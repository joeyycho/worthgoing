import type { SupabaseClient } from '@supabase/supabase-js';

export async function ensureUserByExternalKey(
  supabase: SupabaseClient,
  externalKey: string,
): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from('users')
    .select('id')
    .eq('external_key', externalKey)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }
  if (existing?.id) {
    return existing.id as string;
  }

  const { data: created, error: insertError } = await supabase
    .from('users')
    .insert({ external_key: externalKey })
    .select('id')
    .single();

  if (insertError) {
    throw insertError;
  }
  return created.id as string;
}
