import { Environment } from '@apps-in-toss/web-framework';
import type { TripSnapshot } from '../types/tripStore';
import { decodeSnapshotPayload, getSharedTrip } from './sharedTripsStore';

export type DeepLinkTarget =
  | { kind: 'share'; shareId: string; snapshot: TripSnapshot | null }
  | null;

function parseShareFromUrlLike(raw: string): { shareId: string; payload: string | null } | null {
  try {
    // Support hash (#/share/id?s=...), path (/share/id), and intoss://galmanhae/share/id?s=...
    let path = raw;
    let search = '';

    if (raw.includes('#')) {
      const hash = raw.slice(raw.indexOf('#') + 1);
      const [hashPath, hashQuery = ''] = hash.split('?');
      path = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
      search = hashQuery;
    } else if (raw.startsWith('intoss://') || raw.startsWith('intoss-private://')) {
      const withoutScheme = raw.replace(/^intoss(-private)?:\/\//, '');
      const slash = withoutScheme.indexOf('/');
      const rest = slash >= 0 ? withoutScheme.slice(slash) : '';
      const [pathPart, queryPart = ''] = rest.split('?');
      path = pathPart || '/';
      search = queryPart;
    } else {
      try {
        const url = new URL(raw, window.location.origin);
        path = url.pathname;
        search = url.search.startsWith('?') ? url.search.slice(1) : url.search;
        if (url.hash) {
          const hash = url.hash.slice(1);
          const [hashPath, hashQuery = ''] = hash.split('?');
          path = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
          search = hashQuery || search;
        }
      } catch {
        // keep raw path
      }
    }

    const match = path.match(/\/share\/([^/?#]+)/);
    if (!match) {
      return null;
    }

    const params = new URLSearchParams(search);
    return {
      shareId: decodeURIComponent(match[1]),
      payload: params.get('s'),
    };
  } catch {
    return null;
  }
}

export async function resolveDeepLinkTarget(rawUrl?: string): Promise<DeepLinkTarget> {
  const candidates = [
    rawUrl,
    typeof window !== 'undefined' ? window.location.href : undefined,
  ];

  try {
    candidates.push(Environment.initialURL);
  } catch {
    // outside Toss runtime
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = parseShareFromUrlLike(candidate);
    if (!parsed) continue;

    if (parsed.payload) {
      const fromPayload = decodeSnapshotPayload(parsed.payload);
      if (fromPayload) {
        return { kind: 'share', shareId: parsed.shareId, snapshot: fromPayload };
      }
    }

    const local = await getSharedTrip(parsed.shareId);
    return {
      kind: 'share',
      shareId: parsed.shareId,
      snapshot: local?.snapshot ?? null,
    };
  }

  return null;
}

export function clearShareHash() {
  if (!window.location.hash.includes('/share/')) {
    return;
  }
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(null, '', url.toString());
}
