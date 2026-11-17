import { Environment } from '@apps-in-toss/web-framework';
import { kvGet, kvSet } from './kvStore';

const USER_KEY_STORAGE = 'galmanhae.userKey.v1';

/**
 * Stable client identity for server-backed saved trips before full Toss→Supabase auth.
 * Prefer Environment.deviceId when available; otherwise persist a local UUID.
 * Minimal PII — not an email/phone.
 */
export async function getClientUserKey(): Promise<string> {
  try {
    const deviceId = Environment.deviceId;
    if (deviceId && deviceId.trim().length > 0) {
      return `toss:${deviceId}`;
    }
  } catch {
    // outside Toss runtime
  }

  const existing = await kvGet(USER_KEY_STORAGE);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `web:${crypto.randomUUID()}`
      : `web:${Date.now().toString(36)}`;
  await kvSet(USER_KEY_STORAGE, generated);
  return generated;
}
