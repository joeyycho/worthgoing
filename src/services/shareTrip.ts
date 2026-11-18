import { Share } from '@apps-in-toss/web-framework';
import type { TripSnapshot } from '../types/tripStore';
import { encodeSnapshotPayload, rememberSharedTrip } from './sharedTripsStore';

/** Must match apps-in-toss.config.ts `appName` / console app id */
const APP_NAME = 'galman-hae';

export interface ShareTripResult {
  shareId: string;
  /** Deep-link path used with Share.createLink (intoss://...) */
  deepLinkPath: string;
  /** Browser/hash URL that embeds the snapshot (works without server) */
  webShareUrl: string;
  /** Link actually handed to the share sheet / clipboard */
  sharedLink: string;
  usedTossShareApi: boolean;
  note: string;
}

function buildWebShareUrl(shareId: string, payload: string): string {
  const url = new URL(window.location.href);
  url.hash = `#/share/${shareId}?s=${payload}`;
  return url.toString();
}

/**
 * Documented Apps in Toss share APIs:
 * - Share.createLink({ path: 'intoss://...' })
 * - Share.sendMessage({ message })
 * https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/share/share.createlink
 */
export async function shareTripSnapshot(snapshot: TripSnapshot): Promise<ShareTripResult> {
  const record = await rememberSharedTrip(snapshot);
  const payload = encodeSnapshotPayload(snapshot);
  const deepLinkPath = `intoss://${APP_NAME}/share/${record.id}?s=${payload}`;
  const webShareUrl = buildWebShareUrl(record.id, payload);

  const shortDeepLinkPath = `intoss://${APP_NAME}/share/${record.id}`;

  try {
    // Prefer documented Share.createLink + Share.sendMessage.
    // Include portable web URL (snapshot embedded) so another user can open without server.
    let tossLink: string;
    try {
      tossLink = await Share.createLink({ path: deepLinkPath });
    } catch {
      tossLink = await Share.createLink({ path: shortDeepLinkPath });
    }

    await Share.sendMessage({
      message: [
        '갈만해 MOCK 여행 결과 공유',
        '가격은 공유 시점 기준이며 현재와 다를 수 있어요.',
        tossLink,
        '',
        '스냅샷 포함 링크(서버 없이 열기):',
        webShareUrl,
      ].join('\n'),
    });

    return {
      shareId: record.id,
      deepLinkPath,
      webShareUrl,
      sharedLink: tossLink,
      usedTossShareApi: true,
      note: '토스 Share.createLink / Share.sendMessage로 공유했어요. 스냅샷 포함 웹 링크도 메시지에 넣었어요.',
    };
  } catch {
    // Browser / AIT mock: copyable in-app web link (no invented SDK methods).
    try {
      await navigator.clipboard.writeText(webShareUrl);
    } catch {
      // ignore — UI still shows the link
    }
    return {
      shareId: record.id,
      deepLinkPath,
      webShareUrl,
      sharedLink: webShareUrl,
      usedTossShareApi: false,
      note: '토스 Share API를 쓸 수 없어 웹 공유 링크를 복사했어요. 링크에 MOCK 스냅샷이 포함됩니다. Supabase API가 켜져 있으면 id로 서버 조회도 가능해요.',
    };
  }
}
