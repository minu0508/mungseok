// 실시간 서버(realtime/, Cloudflare Durable Object)를 wrangler dev 로 띄워 실제 웹소켓으로 확인한다.
// wrangler dev 는 파일을 감시하므로 테스트가 끝나면 프로세스 묶음째 끈다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const REALTIME = new URL('../realtime/', import.meta.url);
const PORT = 39417;
const tmp = mkdtempSync(join(tmpdir(), 'mungseok-'));  // 테스트 데이터가 실제 저장소에 섞이지 않게
const running = new Set();                              // 테스트가 중간에 실패해도 띄운 서버를 모두 끈다

// 한 PC 에서 여러 사람을 흉내 내므로 기본은 IP 제한을 끈다. 제한 자체는 따로 시험한다
function start(port, store, vars = {}) {
  const all = { MIN_RECORD_SECS: '1', ONE_PER_IP: '0', ALLOWED_ORIGINS: '', ...vars };
  const args = ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', join(tmp, store),
    '--show-interactive-dev-session=false', ...Object.entries(all).flatMap(([k, v]) => ['--var', `${k}:${v}`])];
  const p = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { cwd: REALTIME, shell: process.platform === 'win32' });
  running.add(p);
  p.once('exit', () => running.delete(p));
  return new Promise((ok, fail) => {
    let out = '';
    const onData = d => { out += d; if (/Ready on/.test(out)) ok(p); };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('exit', code => fail(new Error(`wrangler exited ${code}\n${out.slice(-800)}`)));
  });
}
function stop(p) {
  return new Promise(r => {
    p.once('exit', r);
    if (process.platform === 'win32') { try { execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: 'ignore' }); } catch { r(); } }
    else p.kill();
  });
}

before(async () => { await start(PORT, 'main'); });
// workerd 가 완전히 내려가 임시 폴더를 놓을 때까지 몇 번 다시 시도한다 (Windows)
after(async () => {
  await Promise.all([...running].map(stop));
  try { rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); }
  catch (e) { console.warn(`임시 폴더를 다 못 지웠다(테스트 결과와 무관): ${e.message}`); }
});

// 메시지를 종류별로 모아 두고, 원하는 것이 올 때까지 기다린다
function client(port = PORT, headers = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
  const inbox = [];
  const waiters = [];
  ws.on('message', data => {
    const text = String(data);
    if (text === 'pong') return;
    const m = JSON.parse(text);
    const w = waiters.find(w => w.match(m));
    if (w) { waiters.splice(waiters.indexOf(w), 1); w.ok(m); } else inbox.push(m);
  });
  const next = (match, ms = 4000) => {
    const hit = inbox.find(match);
    if (hit) { inbox.splice(inbox.indexOf(hit), 1); return Promise.resolve(hit); }
    return new Promise((ok, fail) => {
      waiters.push({ match, ok });
      setTimeout(() => fail(new Error('timeout waiting for message')), ms);
    });
  };
  return {
    ws, next,
    send: m => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
    open: new Promise((ok, fail) => { ws.once('open', ok); ws.once('error', fail); ws.once('unexpected-response', (_, res) => fail(new Error(`HTTP ${res.statusCode}`))); }),
    closed: new Promise(r => ws.once('close', code => r(code))),
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function joined(port) {
  const c = client(port);
  await c.open;
  c.welcome = await c.next(m => m.t === 'welcome');
  return c;
}

test('sit, see each other, stand up, get ranked, and the count follows', async () => {
  const a = await joined(), b = await joined();
  assert.notEqual(a.welcome.seat, b.welcome.seat, 'two people never share a seat');

  a.send({ t: 'sit', name: '  가나다라마바사아자차카타파하  ' });
  const seen = await b.next(m => m.t === 'sit');
  assert.equal(seen.peer.name, '가나다라마바사아자차카타', 'name trimmed to 12 chars');
  assert.equal((await b.next(m => m.t === 'count')).value, 1, 'count is broadcast when it changes');

  await sleep(1200);
  a.send({ t: 'up' });
  const out = await a.next(m => m.t === 'out');
  assert.ok(out.secs >= 1);
  assert.equal(out.rank, 1);
  assert.equal((await b.next(m => m.t === 'up')).id, a.welcome.you);
  const board = await b.next(m => m.t === 'board' && m.list.length);
  assert.equal(board.list[0].name, '가나다라마바사아자차카타');
  assert.equal((await b.next(m => m.t === 'count')).value, 0);
  a.ws.close(); b.ws.close();
});

test('garbage input does not crash the server or record anything', async () => {
  const c = await joined();
  c.send('not json');
  c.send({ t: 'up' });            // 앉지도 않고 일어나기
  c.send('null');
  c.send({ t: 'sit', name: 42 }); // 이름이 문자열이 아니다
  assert.equal((await c.next(m => m.t === 'sit')).peer.name, '익명');
  c.send('ping');                 // 연결 유지용 ping 은 자동 응답
  c.ws.close();
  const res = await fetch(`http://127.0.0.1:${PORT}/health`);
  assert.equal(await res.text(), 'ok');
});

test('standing up the instant you sit still gets a result', async () => {
  const c = await joined();
  c.send({ t: 'sit', name: '움찔' });
  await c.next(m => m.t === 'sit');
  c.send({ t: 'up' });
  assert.equal((await c.next(m => m.t === 'out', 2000)).secs, 0);
  c.ws.close();
});

test('blocked names are refused before and at sitting', async () => {
  const c = await joined();
  c.send({ t: 'name', name: '시1발' });
  assert.deepEqual(await c.next(m => m.t === 'name'), { t: 'name', ok: false });
  c.send({ t: 'name', name: '  한강러  ' });
  assert.deepEqual(await c.next(m => m.t === 'name'), { t: 'name', ok: true, name: '한강러' });
  c.send({ t: 'sit', name: '카톡 abc' }); // 미리 확인을 건너뛰고 바로 앉으려 해도 막힌다
  assert.equal((await c.next(m => m.t === 'name')).ok, false);
  await assert.rejects(c.next(m => m.t === 'sit', 600), /timeout/);
  c.ws.close();
});

test('leaving while seated tells the room', async () => {
  const a = await joined(), b = await joined();
  a.send({ t: 'sit', name: '떠나는사람' });
  await b.next(m => m.t === 'sit');
  a.ws.close();
  assert.equal((await b.next(m => m.t === 'leave')).id, a.welcome.you);
  b.ws.close();
});

test('the board survives a restart', async () => {
  const port = PORT + 1;
  let p = await start(port, 'restart');
  const a = await joined(port);
  a.send({ t: 'sit', name: '버틴사람' });
  await a.next(m => m.t === 'sit');
  await sleep(1100);
  a.send({ t: 'up' });
  assert.equal((await a.next(m => m.t === 'out')).rank, 1);
  a.ws.close();
  await stop(p);

  p = await start(port, 'restart');
  const b = client(port);
  await b.open;
  assert.equal((await b.next(m => m.t === 'board')).list[0]?.name, '버틴사람', 'record kept across restart');
  b.ws.close();
  await stop(p);
});

test('the board keeps only the best record per person', async () => {
  const port = PORT + 2;
  const p = await start(port, 'best');
  const c = await joined(port);
  const sitFor = async ms => {
    c.send({ t: 'sit', name: '같은사람' });
    await c.next(m => m.t === 'sit');
    await sleep(ms);
    c.send({ t: 'up' });
    return c.next(m => m.t === 'out');
  };
  assert.equal((await sitFor(2100)).rank, 1);
  const shorter = await sitFor(1100);
  assert.equal(shorter.rank, null, 'a shorter sit does not add a second row');
  assert.equal(shorter.best, 2);
  assert.equal((await sitFor(3100)).rank, 1, 'a longer sit replaces the old row');
  c.ws.close();
  const b = client(port);
  await b.open;
  assert.deepEqual((await b.next(m => m.t === 'board')).list, [{ name: '같은사람', secs: 3 }]);
  b.ws.close();
  await stop(p);
});

test('one connection per IP, and only allowed origins may connect', async () => {
  const port = PORT + 3;
  const origin = { Origin: 'https://mungseok.example' };
  const p = await start(port, 'ip', { ONE_PER_IP: '1', ALLOWED_ORIGINS: origin.Origin });

  await assert.rejects(client(port, { Origin: 'https://evil.example' }).open, /HTTP 403/);
  await assert.rejects(client(port).open, /HTTP 403/, 'no Origin header is refused too');

  const a = client(port, origin);
  await a.open;
  await a.next(m => m.t === 'welcome');
  const b = client(port, origin);
  await b.open;
  await b.next(m => m.t === 'welcome');
  await a.next(m => m.t === 'replaced', 1000); // 닫힘 신호보다 먼저, 바로 알린다
  assert.equal(await a.closed, 4001, 'old connection closed as replaced');
  assert.equal(b.ws.readyState, WebSocket.OPEN, 'new connection stays');
  b.ws.close();
  await stop(p);
});

test('presence check: answering keeps you seated, ignoring it stands you up at the last confirmation', async () => {
  const port = PORT + 4;
  const p = await start(port, 'away', { CHECK_MIN_MS: '300', CHECK_MAX_MS: '400', CHECK_TIMEOUT_MS: '500' });
  const c = await joined(port);

  c.send({ t: 'sit', name: '있어요' });
  await c.next(m => m.t === 'sit');
  await c.next(m => m.t === 'check');
  c.send({ t: 'here' });
  await c.next(m => m.t === 'check'); // 다음 확인이 다시 온다 = 아직 앉아 있다
  c.send({ t: 'here' });
  await sleep(300);
  c.send({ t: 'up' });
  assert.equal((await c.next(m => m.t === 'out')).away, undefined);

  c.send({ t: 'sit', name: '없어요' });
  await c.next(m => m.t === 'sit');
  await c.next(m => m.t === 'check');
  const away = await c.next(m => m.t === 'out', 8000);
  assert.equal(away.away, true);
  assert.equal(away.secs, 0, 'only the time up to the last confirmation (sitting down) counts');
  c.ws.close();
  await stop(p);
});
