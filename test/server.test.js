import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 39417;
const tmp = mkdtempSync(join(tmpdir(), 'mungseok-'));  // 테스트 기록이 실제 순위 파일에 섞이지 않게
let proc;
const running = new Set();  // 테스트가 중간에 실패해도 띄운 서버를 모두 끈다

// 한 PC 에서 여러 사람을 흉내 내므로 기본은 IP 제한을 끈다. 제한 자체는 따로 시험한다
function start(port, dataFile, env = {}) {
  const p = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: port, MIN_RECORD_SECS: '1', DATA_FILE: dataFile, COUNT_EVERY_MS: '200', ONE_PER_IP: '0', ...env } });
  running.add(p);
  p.once('exit', () => running.delete(p));
  return new Promise((ok, fail) => {
    p.stdout.on('data', d => String(d).includes('listening') && ok(p));
    p.on('exit', code => fail(new Error(`server exited ${code}`)));
  });
}
const stop = p => new Promise(r => { p.once('exit', r); p.kill(); });

before(async () => { proc = await start(PORT, join(tmp, 'main.json')); });
after(async () => { await Promise.all([...running].map(stop)); rmSync(tmp, { recursive: true, force: true }); });

// 메시지를 종류별로 모아 두고, 원하는 것이 올 때까지 기다린다
function client(port = PORT) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const inbox = [];
  const waiters = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    inbox.push(m);
    for (const w of [...waiters]) if (w.match(m)) { waiters.splice(waiters.indexOf(w), 1); w.ok(m); }
  };
  const next = (match, ms = 3000) => {
    const hit = inbox.find(match);
    if (hit) { inbox.splice(inbox.indexOf(hit), 1); return Promise.resolve(hit); }
    return new Promise((ok, fail) => {
      waiters.push({ match: m => match(m) && (inbox.splice(inbox.indexOf(m), 1), true), ok });
      setTimeout(() => fail(new Error('timeout waiting for message')), ms);
    });
  };
  return { ws, next, send: m => ws.send(typeof m === 'string' ? m : JSON.stringify(m)), open: new Promise(r => ws.onopen = r) };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const built = existsSync(new URL('../web/dist/index.html', import.meta.url));

test('serves the built page and its assets', { skip: !built && 'web/dist 가 없다: npm run build 먼저' }, async () => {
  const res = await fetch(`http://localhost:${PORT}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /멍석/);
  const js = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(js, 'page references a bundled script');
  const asset = await fetch(`http://localhost:${PORT}${js}`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /javascript/);
  assert.match(asset.headers.get('cache-control'), /immutable/);
});

test('cannot read files outside web/dist', async () => {
  // fetch 는 ../ 를 미리 정리해 버리므로 날것의 경로로 보낸다
  for (const path of ['/%2e%2e/package.json', '/..%2fserver.js', '/%2e%2e%2f%2e%2e%2fserver.js']) {
    const status = await new Promise((ok, fail) =>
      http.get({ host: 'localhost', port: PORT, path }, r => { r.resume(); ok(r.statusCode); }).on('error', fail));
    assert.equal(status, 404, path);
  }
});

test('broadcasts how many people are sitting', async () => {
  const a = client();
  await a.open;
  await a.next(m => m.t === 'welcome');
  a.send({ t: 'sit', name: '세는중' });
  await a.next(m => m.t === 'sit');
  const c = await a.next(m => m.t === 'count' && m.value >= 1);
  assert.ok(c.time > 1e9 && c.time < 1e11, 'time is unix seconds');
  a.ws.close();
});

test('sit, see each other, stand up, get ranked', async () => {
  const a = client(), b = client();
  await Promise.all([a.open, b.open]);
  const wa = await a.next(m => m.t === 'welcome');
  const wb = await b.next(m => m.t === 'welcome');
  assert.notEqual(wa.seat, wb.seat, 'two people never share a seat');

  a.send({ t: 'sit', name: '  가나다라마바사아자차카타파하  ' });
  const seen = await b.next(m => m.t === 'sit');
  assert.equal(seen.peer.name, '가나다라마바사아자차카타', 'name trimmed to 12 chars');

  await sleep(1200);
  a.send({ t: 'up' });
  const out = await a.next(m => m.t === 'out');
  assert.ok(out.secs >= 1);
  assert.equal(out.rank, 1);
  const up = await b.next(m => m.t === 'up');
  assert.equal(up.id, wa.you);
  const board = await b.next(m => m.t === 'board' && m.list.length);
  assert.equal(board.list[0].name, '가나다라마바사아자차카타');

  a.ws.close(); b.ws.close();
});

test('garbage input does not crash the server or record anything', async () => {
  const c = client();
  await c.open;
  await c.next(m => m.t === 'welcome');
  c.send('not json');
  await sleep(350);
  c.send({ t: 'up' });           // 앉지도 않고 일어나기
  await sleep(350);
  c.send(null);
  await sleep(350);
  c.send({ t: 'sit', name: 42 }); // 이름이 문자열이 아니다
  const sat = await c.next(m => m.t === 'sit');
  assert.equal(sat.peer.name, '익명');
  c.ws.close();
  const res = await fetch(`http://localhost:${PORT}/health`);
  assert.equal(await res.text(), 'ok');
});

test('the board survives a restart, and a corrupt file starts empty', async () => {
  const port = PORT + 1, file = join(tmp, 'restart.json');
  let p = await start(port, file);
  const a = client(port);
  await a.open;
  await a.next(m => m.t === 'welcome');
  a.send({ t: 'sit', name: '버틴사람' });
  await a.next(m => m.t === 'sit');
  await sleep(1100);
  a.send({ t: 'up' });
  assert.equal((await a.next(m => m.t === 'out')).rank, 1);
  a.ws.close();
  await stop(p);

  p = await start(port, file);
  const b = client(port);
  await b.open;
  const board = await b.next(m => m.t === 'board');
  assert.equal(board.list[0]?.name, '버틴사람', 'record kept across restart');
  b.ws.close();
  await stop(p);

  writeFileSync(file, '{not json');
  p = await start(port, file);
  const c = client(port);
  await c.open;
  assert.deepEqual((await c.next(m => m.t === 'board')).list, []);
  c.ws.close();
  await stop(p);
});

test('one connection per IP: a new one replaces the old one', async () => {
  const port = PORT + 2;
  const p = await start(port, join(tmp, 'ip.json'), { ONE_PER_IP: '1' });
  const a = client(port);
  await a.open;
  await a.next(m => m.t === 'welcome');
  const closed = new Promise(r => a.ws.addEventListener('close', e => r(e.code)));
  const b = client(port);
  await b.open;
  await b.next(m => m.t === 'welcome');
  assert.equal(await closed, 4001, 'old connection closed as replaced');
  assert.equal(b.ws.readyState, WebSocket.OPEN, 'new connection stays');
  b.ws.close();
  await stop(p);
});

test('blocked names are refused before and at sitting', async () => {
  const c = client();
  await c.open;
  await c.next(m => m.t === 'welcome');
  c.send({ t: 'name', name: '시1발' });
  assert.deepEqual(await c.next(m => m.t === 'name'), { t: 'name', ok: false });
  await sleep(350);
  c.send({ t: 'name', name: '  한강러  ' });
  assert.deepEqual(await c.next(m => m.t === 'name'), { t: 'name', ok: true, name: '한강러' });
  await sleep(350);
  c.send({ t: 'sit', name: '카톡 abc' }); // 미리 확인을 건너뛰고 바로 앉으려 해도 막힌다
  assert.equal((await c.next(m => m.t === 'name')).ok, false);
  await assert.rejects(c.next(m => m.t === 'sit', 600), /timeout/);
  c.ws.close();
});

test('leaving while seated tells the room', async () => {
  const a = client(), b = client();
  await Promise.all([a.open, b.open]);
  const wa = await a.next(m => m.t === 'welcome');
  await b.next(m => m.t === 'welcome');
  a.send({ t: 'sit', name: '떠나는사람' });
  await b.next(m => m.t === 'sit');
  await sleep(1100);
  a.ws.close();
  const left = await b.next(m => m.t === 'leave');
  assert.equal(left.id, wa.you);
  b.ws.close();
});
