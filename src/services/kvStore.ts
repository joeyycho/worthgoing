import { Storage } from '@apps-in-toss/web-framework';

/**
 * Prefer documented Apps in Toss Storage API, fall back to localStorage
 * for browser / AIT mock environments where Storage may throw.
 * https://developers-apps-in-toss.toss.im/ (Storage domain API)
 */
export async function kvGet(key: string): Promise<string | null> {
  try {
    return await Storage.getItem(key);
  } catch {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
}

export async function kvSet(key: string, value: string): Promise<void> {
  try {
    await Storage.setItem(key, value);
    return;
  } catch {
    window.localStorage.setItem(key, value);
  }
}

export async function kvRemove(key: string): Promise<void> {
  try {
    await Storage.removeItem(key);
    return;
  } catch {
    window.localStorage.removeItem(key);
  }
}
