import { DurableObject } from 'cloudflare:workers'
import { isBlockedName } from './filter.js'

/*
 * 멍석 실시간 서버 (Cloudflare Durable Object 하나 = 한강 전체).
 *
 * 무료 한도(하루 요청 10만, 실행 시간 13,000 GB-s) 안에 들기 위해:
 * - 웹소켓 휴면(hibernation): 아무 일이 없으면 객체가 잠들고, 연결은 그대로 유지된다.
 *   잠들면 메모리가 지워지므로 사람마다의 상태는 연결에 붙여 두고(serializeAttachment), 순위는 SQLite 에 둔다.
 * - 주기적인 방송이 없다. 인원은 바뀔 때만 보내고, "아직 계세요?"와 자정 초기화는 알람 하나로 깨워서 처리한다.
 * - 연결 유지용 ping 은 객체를 깨우지 않는 자동 응답으로 받는다.
 * shortcut: 객체 하나가 모든 둔치를 맡는다. 동시 접속이 수천 명을 넘으면 둔치별 객체로 나눈다.
 */

const ROOM_MAX = 30
const BOARD_SIZE = 10
const COUNT_KEEP = 120
const CHECK_GRACE_MS = 3_000

type Peer = {
  id: string; name: string; room: number; seat: number; who: string
  since: number | null; confirmed: number; checkAt: number | null; asked: number | null
  tokens: number; refilled: number
}
type Conn = { ws: WebSocket; p: Peer }

const kstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10)
const nextKstMidnight = (t = Date.now()) => { const kst = t + 9 * 3600e3; return t - (kst % 86400e3) + 86400e3 }
// 이름: 제어 문자 제거, 12자 제한. 화면은 textContent 로만 그리므로 HTML 이스케이프는 필요 없다.
const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/[\p{C}]/gu, '').trim() : '').slice(0, 12) || '익명'

async function sha(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/[+/=]/g, '').slice(0, 16)
}

export class World extends DurableObject<Env> {
  sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    // 화면이 30초마다 보내는 'ping' 은 객체를 깨우지 않고 바로 'pong' 으로 답한다
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS board (day TEXT, who TEXT, name TEXT, secs INTEGER, at INTEGER, PRIMARY KEY (day, who))`)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS counts (time REAL, value INTEGER)`)
  }

  // ---------------------------------------------------------------- 설정
  num(key: 'MIN_RECORD_SECS' | 'CHECK_MIN_MS' | 'CHECK_MAX_MS' | 'CHECK_TIMEOUT_MS', fallback: number) {
    return Number(this.env[key]) || fallback
  }
  get minRecord() { return this.num('MIN_RECORD_SECS', 10) }

  salt() {
    const row = this.sql.exec<{ v: string }>(`SELECT v FROM meta WHERE k = 'salt'`).toArray()[0]
    if (row) return row.v
    const v = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('')
    this.sql.exec(`INSERT INTO meta (k, v) VALUES ('salt', ?)`, v)
    return v
  }

  // ---------------------------------------------------------------- 연결과 사람
  conns(): Conn[] {
    return this.ctx.getWebSockets().map(ws => ({ ws, p: ws.deserializeAttachment() as Peer })).filter(c => c.p)
  }
  save(c: Conn) { c.ws.serializeAttachment(c.p) }
  send(ws: WebSocket, msg: object) { try { ws.send(JSON.stringify(msg)) } catch { /* 이미 닫힌 연결 */ } }
  toRoom(room: number, msg: object) { for (const c of this.conns()) if (c.p.room === room) this.send(c.ws, msg) }
  broadcast(msg: object) { for (const ws of this.ctx.getWebSockets()) this.send(ws, msg) }
  view(p: Peer) { return { id: p.id, name: p.name, seat: p.seat, secs: Math.floor((Date.now() - (p.since ?? Date.now())) / 1000) } }

  // ---------------------------------------------------------------- 순위 (한국 시간 하루, 한 사람(IP)당 최고 기록 하나)
  rollover() {
    const today = kstDay()
    const last = this.sql.exec<{ v: string }>(`SELECT v FROM meta WHERE k = 'day'`).toArray()[0]?.v
    if (last === today) return false
    this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES ('day', ?)`, today)
    this.sql.exec(`DELETE FROM board WHERE day <> ?`, today)
    return last !== undefined
  }
  board() {
    return this.sql.exec<{ name: string; secs: number }>(
      `SELECT name, secs FROM board WHERE day = ? ORDER BY secs DESC, at ASC LIMIT ?`, kstDay(), BOARD_SIZE).toArray()
  }
  boardMsg() { return { t: 'board', list: this.board() } }
  record(name: string, secs: number, who: string): { rank: number | null; best?: number } {
    this.rollover()
    if (secs < this.minRecord) return { rank: null }
    const day = kstDay()
    const mine = this.sql.exec<{ secs: number }>(`SELECT secs FROM board WHERE day = ? AND who = ?`, day, who).toArray()[0]
    if (mine && mine.secs >= secs) return { rank: null, best: mine.secs } // 오늘 내 기록보다 짧다
    const at = Date.now()
    this.sql.exec(`INSERT OR REPLACE INTO board (day, who, name, secs, at) VALUES (?, ?, ?, ?, ?)`, day, who, name, secs, at)
    const ahead = this.sql.exec<{ n: number }>(
      `SELECT COUNT(*) AS n FROM board WHERE day = ? AND (secs > ? OR (secs = ? AND at < ?))`, day, secs, secs, at).one().n
    return { rank: ahead < BOARD_SIZE ? ahead + 1 : null }
  }

  // ---------------------------------------------------------------- 인원 (바뀔 때만 기록·방송)
  countsHistory() {
    return this.sql.exec<{ time: number; value: number }>(`SELECT time, value FROM counts ORDER BY time`).toArray()
  }
  updateCount() {
    const value = this.conns().filter(c => c.p.since).length
    const last = this.sql.exec<{ value: number }>(`SELECT value FROM counts ORDER BY time DESC LIMIT 1`).toArray()[0]
    if (last?.value === value) return
    const point = { time: Date.now() / 1000, value }
    this.sql.exec(`INSERT INTO counts (time, value) VALUES (?, ?)`, point.time, point.value)
    this.sql.exec(`DELETE FROM counts WHERE time NOT IN (SELECT time FROM counts ORDER BY time DESC LIMIT ?)`, COUNT_KEEP)
    this.broadcast({ t: 'count', ...point })
  }

  // ---------------------------------------------------------------- 앉기·일어나기·자리 비움
  nextCheck() {
    const min = this.num('CHECK_MIN_MS', 20 * 60_000), max = this.num('CHECK_MAX_MS', 40 * 60_000)
    return Date.now() + min + Math.random() * (max - min)
  }
  standUp(c: Conn, until = Date.now()) {
    const secs = Math.floor((until - (c.p.since ?? until)) / 1000)
    c.p.since = null
    c.p.checkAt = null
    c.p.asked = null
    this.save(c)
    this.toRoom(c.p.room, { t: 'up', id: c.p.id, secs })
    return secs
  }
  finish(c: Conn, until?: number, away = false) {
    const secs = this.standUp(c, until)
    const { rank, best } = this.record(c.p.name, secs, c.p.who)
    this.send(c.ws, { t: 'out', secs, rank, best, ...(away ? { away: true } : {}) })
    if (rank) this.broadcast(this.boardMsg())
    this.updateCount()
  }

  // 다음에 깨어날 시각: 가장 이른 "아직 계세요?", 답 마감, 그리고 자정(순위 초기화)
  async schedule() {
    const timeout = this.num('CHECK_TIMEOUT_MS', 60_000)
    let next = Infinity
    const cs = this.conns()
    for (const { p } of cs) {
      if (!p.since) continue
      if (p.asked) next = Math.min(next, p.asked + timeout + CHECK_GRACE_MS)
      else if (p.checkAt) next = Math.min(next, p.checkAt)
    }
    if (cs.length) next = Math.min(next, nextKstMidnight())
    if (next === Infinity) await this.ctx.storage.deleteAlarm()
    else if ((await this.ctx.storage.getAlarm()) !== next) await this.ctx.storage.setAlarm(next)
  }

  async alarm() {
    try {
      const now = Date.now(), timeout = this.num('CHECK_TIMEOUT_MS', 60_000)
      for (const c of this.conns()) {
        const p = c.p
        if (!p.since) continue
        if (p.asked && p.asked + timeout + CHECK_GRACE_MS <= now) {
          this.finish(c, p.confirmed, true) // 마지막으로 있다고 확인된 때까지만 인정한다
        } else if (!p.asked && p.checkAt && p.checkAt <= now) {
          p.asked = now
          this.save(c)
          this.send(c.ws, { t: 'check', timeout })
        }
      }
      if (this.rollover()) this.broadcast(this.boardMsg())
    } finally {
      await this.schedule()
    }
  }

  // ---------------------------------------------------------------- 접속
  async fetch(request: Request) {
    const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0'
    const who = await sha(this.salt() + ip) // IP 를 그대로 저장하지 않는다
    const onePerIp = (this.env.ONE_PER_IP as string) !== '0' // 생성된 타입은 기본값 "1" 로 고정돼 있어 문자열로 본다
    if (onePerIp) {
      // 같은 IP 의 이전 접속은 닫는다. 새로고침이나 죽은 탭 때문에 본인이 못 들어오는 일이 없게, 거절이 아니라 교체한다
      for (const old of this.ctx.getWebSockets(`ip:${who}`)) {
        const c = { ws: old, p: old.deserializeAttachment() as Peer }
        if (c.p?.since) { this.standUp(c); this.updateCount() }
        try { old.close(4001, 'replaced') } catch { /* 이미 닫힘 */ }
      }
    }

    // 자리 배정: 30명이 안 찬 가장 앞 둔치의 가장 앞 빈자리
    const live = this.conns().filter(c => !(onePerIp && c.p.who === who))
    let room = 0
    for (;; room++) if (live.filter(c => c.p.room === room).length < ROOM_MAX) break
    const used = new Set(live.filter(c => c.p.room === room).map(c => c.p.seat))
    let seat = 0
    while (used.has(seat)) seat++

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server, [`ip:${who}`])
    const p: Peer = { id: crypto.randomUUID().slice(0, 8), name: '', room, seat, who, since: null, confirmed: 0, checkAt: null, asked: null, tokens: 5, refilled: Date.now() }
    server.serializeAttachment(p)

    if (this.rollover()) this.broadcast(this.boardMsg())
    const sitting = this.conns().filter(c => c.p.room === room && c.p.since).map(c => this.view(c.p))
    this.send(server, { t: 'welcome', you: p.id, seat, peers: sitting, minRecord: this.minRecord, counts: this.countsHistory() })
    this.send(server, this.boardMsg())
    await this.schedule() // 자정 알람
    return new Response(null, { status: 101, webSocket: client })
  }

  // 메시지 폭주를 막는 양동이: 최대 5개까지 몰아서 보낼 수 있고 1초에 2개씩 다시 찬다
  allow(p: Peer, now: number) {
    p.tokens = Math.min(5, p.tokens + ((now - p.refilled) / 1000) * 2)
    p.refilled = now
    if (p.tokens < 1) return false
    p.tokens -= 1
    return true
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 1024) return
    const c: Conn = { ws, p: ws.deserializeAttachment() as Peer }
    if (!c.p) return
    let msg: { t?: string; name?: unknown }
    try { msg = JSON.parse(raw) } catch { return }
    if (!msg || typeof msg !== 'object') return
    const now = Date.now()
    // 일어나기는 막지 않는다: 앉자마자 움직인 사람의 신호를 버리면 화면이 결과를 영영 못 받는다
    if (msg.t !== 'up' && !this.allow(c.p, now)) { this.save(c); return }

    if (msg.t === 'name') {
      // 앉기 전에 이름을 미리 확인한다 (카운트다운이 끝난 뒤에 거절당하지 않게)
      const name = cleanName(msg.name)
      this.send(ws, isBlockedName(name) ? { t: 'name', ok: false } : { t: 'name', ok: true, name })
      this.save(c)
    } else if (msg.t === 'sit' && !c.p.since) {
      const name = cleanName(msg.name)
      if (isBlockedName(name)) { this.save(c); return this.send(ws, { t: 'name', ok: false }) } // 미리 확인을 건너뛴 접속도 막는다
      Object.assign(c.p, { name, since: now, confirmed: now, asked: null, checkAt: this.nextCheck() })
      this.save(c)
      this.toRoom(c.p.room, { t: 'sit', peer: this.view(c.p) })
      this.updateCount()
      await this.schedule()
    } else if (msg.t === 'here' && c.p.since && c.p.asked) {
      Object.assign(c.p, { asked: null, confirmed: now, checkAt: this.nextCheck() })
      this.save(c)
      await this.schedule()
    } else if (msg.t === 'up' && c.p.since) {
      this.finish(c)
      await this.schedule()
    } else this.save(c)
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    const c: Conn = { ws, p: ws.deserializeAttachment() as Peer }
    // 연결이 끊긴 것은 기록하지 않는다: 일어났는지 네트워크가 끊겼는지 구분할 수 없다
    if (c.p?.since) { this.standUp(c); this.updateCount() }
    if (c.p) this.toRoom(c.p.room, { t: 'leave', id: c.p.id })
    try { ws.close(code, reason) } catch { /* 이미 닫힘 */ }
    await this.schedule()
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws, 1011, 'error')
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') return new Response('ok')
    if (url.pathname !== '/ws') return new Response('not found', { status: 404 })
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 })
    // 다른 사이트가 사용자의 브라우저로 몰래 접속하지 못하게, 허용한 화면 주소에서 온 접속만 받는다
    const allowed = (env.ALLOWED_ORIGINS as string).split(',').map(s => s.trim()).filter(Boolean)
    if (allowed.length && !allowed.includes(request.headers.get('Origin') ?? '')) return new Response('forbidden origin', { status: 403 })
    return env.WORLD.getByName('hangang').fetch(request)
  },
} satisfies ExportedHandler<Env>
