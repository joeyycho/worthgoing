import { SafeAreaInsets } from '@apps-in-toss/web-framework';
import { useEffect, useState } from 'react';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const FALLBACK_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Official Apps in Toss SafeAreaInsets API:
 * https://developers-apps-in-toss.toss.im/documentation/api-and-sdk-en/common/screen/safe-area
 *
 * Falls back to zeros outside the Toss WebView (local browser / AIT mock).
 */
export function useSafeAreaInsets(): Insets {
  const [insets, setInsets] = useState<Insets>(() => {
    try {
      return SafeAreaInsets.get();
    } catch {
      return FALLBACK_INSETS;
    }
  });

  useEffect(() => {
    try {
      return SafeAreaInsets.subscribe({
        onEvent: (next) => setInsets(next),
      });
    } catch {
      return undefined;
    }
  }, []);

  return insets;
}
