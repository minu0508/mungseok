import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 3000;
const ROOM_MAX = 30;                                        // 한 둔치(방)에 앉을 수 있는 사람 수
const MIN_RECORD = Number(process.env.MIN_RECORD_SECS) || 10; // 이보다 짧게 앉으면 순위에 안 올린다
const BOARD_SIZE = 10;
const DATA_FILE = process.env.DATA_FILE || fileURLToPath(new URL('./data/board.json', import.meta.url));

const html = await readFile(new URL('./public/index.html', import.meta.url));

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    return res.end(html);
  }
  if (path === '/health') return res.end('ok');
  res.writeHead(404).end();
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

wss.on('connection', ws => {
  const peer = joinRoom(ws);
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });

  const sitting = [...peer.room.values()].filter(p => p.since).map(view);
  send(ws, { t: 'welcome', you: peer.id, seat: peer.seat, peers: sitting, minRecord: MIN_RECORD });
  send(ws, boardMsg());

  ws.on('message', raw => {
    const now = Date.now();
    if (now - peer.last < 300) return; // 메시지 폭주로 방 전체에 방송이 쏟아지는 것을 막는다
    peer.last = now;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.t === 'sit' && !peer.since) {
      peer.name = cleanName(msg.name);
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
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => console.log(`mungseok listening on ${server.address().port}`));
