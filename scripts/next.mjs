import { spawn } from 'node:child_process';
export function runNext(args) {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args], {
    stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  });
  child.on('error', (error) => { console.error(error); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}
