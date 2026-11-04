import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { isBlockedName } from './filter.js';

const PORT = Number(process.env.PORT) || 3000;
const ROOM_MAX = 30;                                        // 한 둔치(방)에 앉을 수 있는 사람 수
const MIN_RECORD = Number(process.env.MIN_RECORD_SECS) || 10; // 이보다 짧게 앉으면 순위에 안 올린다
const BOARD_SIZE = 10;
const DATA_FILE = process.env.DATA_FILE || fileURLToPath(new URL('./data/board.json', import.meta.url));

const COUNT_EVERY_MS = Number(process.env.COUNT_EVERY_MS) || 5000; // 앉은 사람 수를 방송하는 간격
const COUNT_KEEP = 120;                                              // 새로 들어온 사람에게 줄 기록 개수
const ONE_PER_IP = process.env.ONE_PER_IP !== '0';                   // IP 하나당 접속 하나
const TRUST_PROXY = process.env.TRUST_PROXY === '1';                 // 프록시 뒤에 둘 때만 X-Forwarded-For 를 믿는다

function clientIp(req) {
  // 프록시가 붙인 마지막 값만 믿는다: 앞쪽 값은 접속자가 마음대로 써 넣을 수 있다
  const ip = TRUST_PROXY ? (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress
    : req.socket.remoteAddress;
  return (ip || '').replace(/^::ffff:/, '');
}

// --- 화면: web/dist (npm run build 로 만든다) ---
const DIST = fileURLToPath(new URL('./web/dist', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon' };

async function serveStatic(path, res) {
  let rel;
  try { rel = decodeURIComponent(path); } catch { return res.writeHead(400).end(); }
  const file = join(DIST, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(DIST + sep)) return res.writeHead(404).end(); // ../ 로 dist 밖을 읽지 못하게
  try {
    const body = await readFile(file);
    const hashed = rel.startsWith('/assets/');
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch (e) {
    if (rel === '/' && e.code === 'ENOENT') {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('화면이 아직 빌드되지 않았어요. npm run build 를 먼저 실행하세요.');
    }
    res.writeHead(404).end();
  }
}

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/health') return res.end('ok');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
  serveStatic(path, res);
});

// --- 오늘의 순위 (한국 시간 자정에 초기화) ---
// shortcut: JSON 파일 하나에 저장한다. 서버가 한 대이고 디스크가 유지될 때만 남는다.
// 서버를 여러 대로 늘리거나 디스크가 지워지는 호스팅에 올리면 DB 로 옮긴다.
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function loadBoard() {
  try {
    const b = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
    const ok = e => e && typeof e.name === 'string' && Number.isFinite(e.secs) && Number.isFinite(e.at);
    if (b.day === kstDay() && Array.isArray(b.list)) return { day: b.day, list: b.list.filter(ok).slice(0, BOARD_SIZE) };
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`board load failed, starting empty: ${e.message}`);
  }
  return { day: kstDay(), list: [] };
}
function saveBoard() {
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    writeFileSync(DATA_FILE + '.tmp', JSON.stringify(board));
    renameSync(DATA_FILE + '.tmp', DATA_FILE); // 쓰다 꺼져도 이전 파일이 깨지지 않게
  } catch (e) {
    console.error(`board save failed: ${e.message}`);
  }
}
let board = loadBoard();

function record(name, secs) {
  if (board.day !== kstDay()) board = { day: kstDay(), list: [] };
  if (secs < MIN_RECORD) return null;
  const entry = { name, secs, at: Date.now() };
  board.list.push(entry);
  board.list.sort((a, b) => b.secs - a.secs || a.at - b.at);
  board.list.length = Math.min(board.list.length, BOARD_SIZE);
  const i = board.list.indexOf(entry);
  if (i === -1) return null;
  saveBoard();
  return i + 1;
}
const boardMsg = () => ({ t: 'board', list: board.list.map(({ name, secs }) => ({ name, secs })) });

// --- 방: 연결 하나 = 자리 하나. 앉았다 일어나도 자리는 유지된다 ---
const rooms = new Set();

function joinRoom(ws) {
  let room = [...rooms].find(r => r.size < ROOM_MAX);
  if (!room) rooms.add(room = new Map());
  const used = new Set([...room.values()].map(p => p.seat));
  let seat = 0;
  while (used.has(seat)) seat++;
  const peer = { id: randomUUID().slice(0, 8), name: '', seat, since: null, room, last: 0 };
  room.set(ws, peer);
  return peer;
}

const view = p => ({ id: p.id, name: p.name, seat: p.seat, secs: Math.floor((Date.now() - p.since) / 1000) });
const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
const toRoom = (room, msg) => { for (const ws of room.keys()) send(ws, msg); };

// 이름: 제어 문자 제거, 12자 제한. 화면은 textContent 로만 그리므로 HTML 이스케이프는 필요 없다.
const cleanName = v => (typeof v === 'string' ? v.replace(/[\p{C}]/gu, '').trim() : '').slice(0, 12) || '익명';

function standUp(peer) {
  const secs = Math.floor((Date.now() - peer.since) / 1000);
  peer.since = null;
  toRoom(peer.room, { t: 'up', id: peer.id, secs });
  return secs;
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
const byIp = new Map();

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  if (ONE_PER_IP) {
    // 같은 IP 의 이전 접속은 닫는다. 새로고침이나 죽은 탭 때문에 본인이 못 들어오는 일이 없게, 거절이 아니라 교체한다
    byIp.get(ip)?.close(4001, 'replaced');
    byIp.set(ip, ws);
  }
  const peer = joinRoom(ws);
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });

  const sitting = [...peer.room.values()].filter(p => p.since).map(view);
  send(ws, { t: 'welcome', you: peer.id, seat: peer.seat, peers: sitting, minRecord: MIN_RECORD, counts });
  send(ws, boardMsg());

  ws.on('message', raw => {
    const now = Date.now();
    if (now - peer.last < 300) return; // 메시지 폭주로 방 전체에 방송이 쏟아지는 것을 막는다
    peer.last = now;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.t === 'name') {
      // 앉기 전에 이름을 미리 확인한다 (카운트다운이 끝난 뒤에 거절당하지 않게)
      const name = cleanName(msg.name);
      send(ws, isBlockedName(name) ? { t: 'name', ok: false } : { t: 'name', ok: true, name });
    } else if (msg.t === 'sit' && !peer.since) {
      const name = cleanName(msg.name);
      if (isBlockedName(name)) return send(ws, { t: 'name', ok: false }); // 미리 확인을 건너뛴 접속도 막는다
      peer.name = name;
      peer.since = now;
      toRoom(peer.room, { t: 'sit', peer: view(peer) });
    } else if (msg.t === 'up' && peer.since) {
      const secs = standUp(peer);
      const rank = record(peer.name, secs);
      send(ws, { t: 'out', secs, rank });
      if (rank) for (const c of wss.clients) send(c, boardMsg());
    }
  });

  ws.on('close', () => {
    if (byIp.get(ip) === ws) byIp.delete(ip);
    // 연결이 끊긴 것은 기록하지 않는다: 일어났는지 네트워크가 끊겼는지 구분할 수 없다
    if (peer.since) standUp(peer);
    peer.room.delete(ws);
    toRoom(peer.room, { t: 'leave', id: peer.id });
    if (!peer.room.size) rooms.delete(peer.room);
  });
});

// 응답 없는 연결을 정리해 둔치에 유령이 앉아 있지 않게 한다
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 30_000);

// 전체 둔치에 앉은 사람 수: 화면의 실시간 차트가 그린다 (time 은 초 단위)
const counts = [];
const countTimer = setInterval(() => {
  let value = 0;
  for (const room of rooms) for (const p of room.values()) if (p.since) value++;
  const point = { time: Date.now() / 1000, value };
  counts.push(point);
  if (counts.length > COUNT_KEEP) counts.shift();
  for (const c of wss.clients) send(c, { t: 'count', ...point });
}, COUNT_EVERY_MS);
wss.on('close', () => { clearInterval(heartbeat); clearInterval(countTimer); });

server.listen(PORT, () => console.log(`mungseok listening on ${server.address().port}`));
