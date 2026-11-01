import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { after, before, test } from 'node:test';

let server;
let base;
let output = '';
before(async () => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (data) => { output += data; });
  server.stderr.on('data', (data) => { output += data; });
  let failure;
  server.on('error', (error) => { failure = error; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (failure || server.exitCode !== null) throw new Error(`Server failed: ${failure ?? output}`);
    try { if ((await fetch(base)).ok) return; } catch { /* Wait for readiness. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server readiness timeout: ${output}`);
});
after(async () => {
  if (server && server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }
});
test('home serves experimental Spanish content with noindex metadata', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html lang="es"/);
  assert.match(html, /Neura Landscape/);
  assert.match(html, /Experimental · Precomercial/);
  assert.match(html, /<meta name="robots" content="[^"]*noindex[^"]*"/);
  assert.match(html, /href="#foundation"/);
  assert.match(html, /id="foundation"/);
});
test('home, robots and missing routes carry the noindex header', async () => {
  for (const path of ['/', '/robots.txt', '/missing-mission-001']) {
    const response = await fetch(`${base}${path}`);
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.equal(response.status, path.includes('missing') ? 404 : 200);
  }
});
test('robots.txt disallows all crawlers', async () => {
  const response = await fetch(`${base}/robots.txt`);
  const body = await response.text();
  assert.match(body, /User-Agent: \*/i);
  assert.match(body, /Disallow: \//);
});
