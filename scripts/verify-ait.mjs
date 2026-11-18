#!/usr/bin/env node
/**
 * Confirms the Apps in Toss package artifact exists after `ait build`.
 * Official packaging: npm run build → project-root `{appName}.ait`
 * https://developers-apps-in-toss.toss.im/guide/en/operation/toss
 */
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const appName = 'galman-hae';
const aitPath = resolve(process.cwd(), `${appName}.ait`);

if (!existsSync(aitPath)) {
  console.error(`Missing ${appName}.ait — run \`npm run build\` (includes \`ait build\`).`);
  process.exit(1);
}

const size = statSync(aitPath).size;
if (size < 1024) {
  console.error(`${appName}.ait looks empty (${size} bytes). Rebuild and check ait build logs.`);
  process.exit(1);
}

const maxExtractHintMb = 100;
console.log(
  `OK ${appName}.ait (${(size / 1024).toFixed(1)} KiB packed). ` +
    `Console upload limit is ${maxExtractHintMb} MB after extraction ` +
    `(official Apps in Toss test guide).`,
);
