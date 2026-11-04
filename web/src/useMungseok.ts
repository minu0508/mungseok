import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveLinePoint } from '@/components/charts/live-line-chart'

// 실시간 서버(Cloudflare Worker) 주소. 배포할 때 VITE_REALTIME_URL 로 정한다.
// 없으면 화면과 같은 주소의 /ws 로 붙는다 (내 PC 에서는 vite preview 가 wrangler dev 로 넘겨준다)
const REALTIME_URL = import.meta.env.VITE_REALTIME_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export type Peer = { id: string; name: string; seat: number }
export type Rank = { name: string; secs: number }
export type Phase = 'intro' | 'checking' | 'count' | 'sitting' | 'standing' | 'out' | 'lost' | 'replaced'
export type Result = { secs: number; rank: number | null; best?: number; away?: boolean }

const COUNT_KEEP = 120
// 이 중 하나라도 일어나면 일어난 것으로 친다
const TRIP_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'blur'] as const
export const NAME_REJECTED = '쓸 수 없는 말이 들어 있어요. 다른 이름으로 앉아 주세요.'

export function useMungseok() {
  const [peers, setPeers] = useState<Map<string, Peer>>(() => new Map())
  const [me, setMe] = useState<string | null>(null)
  const [board, setBoard] = useState<Rank[]>([])
  const [counts, setCounts] = useState<LiveLinePoint[]>([])
  const [phase, setPhase] = useState<Phase>('intro')
  const [countdown, setCountdown] = useState(3)
  const [result, setResult] = useState<Result | null>(null)
  const [nameError, setNameError] = useState('')
  const [minRecord, setMinRecord] = useState(10)
  const [sitStart, setSitStart] = useState(0)
  const [asked, setAsked] = useState<number | null>(null) // "아직 계세요?" 응답 마감 시각
  const [paused, setPaused] = useState(false)             // 확인 중에는 움직여도 일어난 걸로 치지 않는다
  const ws = useRef<WebSocket | null>(null)
  const meRef = useRef<string | null>(null)
  const lock = useRef<WakeLockSentinel | null>(null)
  const timer = useRef(0)

  const send = useCallback((m: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m))
  }, [])

  // 3, 2, 1 이 끝나면 앉는다. 버튼을 누른 손이 바로 실격되지 않게 하는 여유 시간
  const countdownThenSit = useCallback((name: string) => {
    setPhase('count')
    setCountdown(3)
    navigator.wakeLock?.request('screen').then(l => { lock.current = l }).catch(() => {})
    let n = 3
    clearInterval(timer.current)
    timer.current = window.setInterval(() => {
      n -= 1
      if (n > 0) return setCountdown(n)
      clearInterval(timer.current)
      ;(document.activeElement as HTMLElement | null)?.blur()
      send({ t: 'sit', name })
    }, 1000)
  }, [send])

  useEffect(() => {
    const sock = new WebSocket(REALTIME_URL)
    ws.current = sock
    // 연결 유지: 서버는 'ping' 에 잠에서 깨지 않고 'pong' 으로 답한다 (무료 한도를 아낀다)
    const ping = window.setInterval(() => { if (sock.readyState === WebSocket.OPEN) sock.send('ping') }, 30_000)
    // 서버는 인원이 바뀔 때만 알려 준다. 그 사이에는 마지막 값을 5초마다 이어 붙여 그래프가 흐르게 한다
    const tick = window.setInterval(() => setCounts(prev => {
      const last = prev.at(-1)
      return last ? [...prev.slice(-(COUNT_KEEP - 1)), { time: Date.now() / 1000, value: last.value }] : prev
    }), 5_000)
    const put = (p: Peer) => setPeers(prev => new Map(prev).set(p.id, p))
    const drop = (id: string) => setPeers(prev => { const n = new Map(prev); n.delete(id); return n })

    sock.onmessage = e => {
      if (e.data === 'pong') return
      const m = JSON.parse(e.data)
      switch (m.t) {
        case 'welcome':
          meRef.current = m.you
          setMe(m.you)
          setMinRecord(m.minRecord)
          setPeers(new Map(m.peers.map((p: Peer) => [p.id, p])))
          setCounts(m.counts.length ? m.counts : [{ time: Date.now() / 1000, value: 0 }])
          break
        case 'name':
          if (m.ok) { setNameError(''); countdownThenSit(m.name) }
          else { clearInterval(timer.current); setNameError(NAME_REJECTED); setPhase('intro') }
          break
        case 'sit':
          put(m.peer)
          if (m.peer.id === meRef.current) { setSitStart(performance.now()); setPhase('sitting') }
          break
        case 'up':
        case 'leave':
          drop(m.id)
          break
        case 'board':
          setBoard(m.list)
          break
        case 'count':
          setCounts(prev => [...prev.slice(-(COUNT_KEEP - 1)), { time: m.time, value: m.value }])
          break
        case 'replaced': // 같은 네트워크에서 새로 접속했다
          sock.onclose = null
          sock.close()
          clearInterval(timer.current)
          setPhase('replaced')
          break
        case 'check':
          setPaused(true)
          setAsked(Date.now() + m.timeout)
          break
        case 'out':
          setAsked(null)
          setPaused(false)
          setResult({ secs: m.secs, rank: m.rank, best: m.best, away: m.away })
          setPhase('out')
          break
      }
    }
    // 4001: 같은 네트워크에서 새로 접속해 이 연결이 닫혔다
    sock.onclose = e => { clearInterval(timer.current); setPhase(e.code === 4001 ? 'replaced' : 'lost') }
    return () => { sock.onclose = null; sock.close(); clearInterval(timer.current); clearInterval(ping); clearInterval(tick) }
  }, [countdownThenSit])

  // 이름을 서버에 먼저 확인받고, 통과하면 카운트다운을 시작한다
  const sit = useCallback((name: string) => {
    setNameError('')
    setPhase('checking')
    send({ t: 'name', name })
  }, [send])

  // "네, 있어요": 답하고 나서 손을 거둘 2초를 준 뒤 다시 감시한다
  const here = useCallback(() => {
    send({ t: 'here' })
    setAsked(null)
    ;(document.activeElement as HTMLElement | null)?.blur()
    window.setTimeout(() => setPaused(false), 2000)
  }, [send])

  // 앉아 있는 동안에만 입력을 감시한다 (확인 창이 떠 있을 때는 쉰다)
  useEffect(() => {
    if (phase !== 'sitting' || paused) return
    const trip = (e: Event) => {
      if (e instanceof MouseEvent && e.type === 'mousemove' && !e.movementX && !e.movementY) return // 화면이 바뀔 때 생기는 가짜 움직임
      if (e.type === 'visibilitychange' && !document.hidden) return
      setPhase('standing')
      send({ t: 'up' })
    }
    TRIP_EVENTS.forEach(ev => window.addEventListener(ev, trip, { passive: true }))
    document.addEventListener('visibilitychange', trip)
    return () => {
      TRIP_EVENTS.forEach(ev => window.removeEventListener(ev, trip))
      document.removeEventListener('visibilitychange', trip)
    }
  }, [phase, paused, send])

  // 앉은 상태가 끝나면 화면 꺼짐 방지를 푼다
  useEffect(() => {
    if (phase === 'count' || phase === 'sitting' || phase === 'standing') return
    lock.current?.release().catch(() => {})
    lock.current = null
  }, [phase])

  return { peers, me, board, counts, phase, countdown, result, nameError, minRecord, sitStart, sit, asked, here }
}
