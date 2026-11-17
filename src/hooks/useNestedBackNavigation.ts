import { graniteEvent } from '@apps-in-toss/web-framework';
import { useEffect } from 'react';

/**
 * Documented Apps in Toss back handling:
 * https://developers-apps-in-toss.toss.im/documentation/api-and-sdk-en/common/screen/event
 *
 * Subscribing to backEvent blocks the default close action, so only enable
 * this while nested search views (results/detail) are open.
 */
export function useNestedBackNavigation(enabled: boolean, onBack: () => void) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    try {
      return graniteEvent.addEventListener('backEvent', {
        onEvent: () => {
          onBack();
        },
        onError: (error) => {
          console.error(error);
        },
      });
    } catch {
      return undefined;
    }
  }, [enabled, onBack]);
}
