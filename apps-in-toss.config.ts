import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'galmanhae',
  permissions: [],
  webBundleDir: 'dist',
  // Docs: https://developers-apps-in-toss.toss.im/documentation/common/navigationbar
  // Root search screen keeps the platform back/close affordance; do not intercept
  // graniteEvent backEvent here (that blocks default back). Detail flows in later
  // stages can subscribe when leave-confirmation is needed.
  navigationBar: {
    withBackButton: true,
    withTitle: true,
    theme: 'light',
  },
});
