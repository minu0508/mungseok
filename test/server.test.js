import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 39417;
let proc;

before(async () => {
  proc = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, MIN_RECORD_SECS: '1' } });
  await new Promise((ok, fail) => {
    proc.stdout.on('data', d => String(d).includes('listening') && ok());
    proc.on('exit', code => fail(new Error(`server exited ${code}`)));
  });
});
after(() => proc.kill());

// 메시지를 종류별로 모아 두고, 원하는 것이 올 때까지 기다린다
function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
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

test('serves the page', async () => {
  const res = await fetch(`http://localhost:${PORT}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /멍석/);
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
