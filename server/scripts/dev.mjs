/**
 * Local server:dev entry — sets NODE_ENV=development so env.ts may load server/.env.
 * No extra deps; uses the local tsx CLI.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'development';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const child = spawn(process.execPath, [tsxCli, 'watch', 'src/index.ts'], {
  stdio: 'inherit',
  env: process.env,
  cwd: serverRoot,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
