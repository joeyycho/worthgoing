import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * Apps in Toss WebView config (SDK 3.x).
 * `appName` must match the app id registered in the Apps in Toss console
 * before `ait deploy` / QR test upload will work.
 *
 * Navigation / safe-area notes:
 * - Platform nav bar is configured here (official NavigationBar options).
 * - In-app padding uses SafeAreaInsets at runtime (see src/hooks/useSafeAreaInsets.ts).
 * Docs:
 * - https://developers-apps-in-toss.toss.im/documentation/common/navigationbar
 * - https://developers-apps-in-toss.toss.im/documentation/api-and-sdk-en/common/screen/safe-area
 */
export default defineConfig({
  appName: 'galmanhae',
  // No extra device permissions requested for current features.
  permissions: [],
  webBundleDir: 'dist',
  // Non-game mini-app: show back + home + title so users can leave nested screens.
  // Root search should not intercept graniteEvent backEvent (blocks default close/back).
  // Nested screens subscribe via useNestedBackNavigation when leave-confirmation is needed.
  navigationBar: {
    withBackButton: true,
    withHomeButton: true,
    withTitle: true,
    theme: 'light',
  },
});
