import type { SaveTripPersistence } from '../types/tripStore';

export const SAVE_SUCCESS_CLOUD = '여행을 저장했어요.';
export const SAVE_SUCCESS_LOCAL_AFTER_CLOUD_FAIL =
  '이 기기에 여행을 저장했어요. 클라우드 동기화는 완료되지 않았어요.';
/** Intentional device-only save (API not configured) — not a cloud sync failure. */
export const SAVE_SUCCESS_LOCAL = '이 기기에 여행을 저장했어요.';
export const SAVE_FAIL = '저장하지 못했어요. 다시 시도해 주세요.';

export function saveSuccessMessage(persistence: SaveTripPersistence): string {
  switch (persistence) {
    case 'cloud':
      return SAVE_SUCCESS_CLOUD;
    case 'local_after_cloud_fail':
      return SAVE_SUCCESS_LOCAL_AFTER_CLOUD_FAIL;
    case 'local':
      return SAVE_SUCCESS_LOCAL;
  }
}
