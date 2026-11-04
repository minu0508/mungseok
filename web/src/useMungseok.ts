import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveLinePoint } from '@/components/charts/live-line-chart'
import type { SkyData } from '@/lib/sky'

export type Peer = { id: string; name: string; seat: number }
export type Rank = { name: string; secs: number }
export type Phase = 'intro' | 'checking' | 'count' | 'sitting' | 'standing' | 'out' | 'lost' | 'replaced'
export type Result = { secs: number; rank: number | null; best?: number }

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
  const [sky, setSky] = useState<SkyData | null>(null)
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
    const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
    ws.current = sock
    const put = (p: Peer) => setPeers(prev => new Map(prev).set(p.id, p))
    const drop = (id: string) => setPeers(prev => { const n = new Map(prev); n.delete(id); return n })

    sock.onmessage = e => {
      const m = JSON.parse(e.data)
      switch (m.t) {
        case 'welcome':
          meRef.current = m.you
          setMe(m.you)
          setMinRecord(m.minRecord)
          setPeers(new Map(m.peers.map((p: Peer) => [p.id, p])))
          setCounts(m.counts)
          setSky(m.sky ?? null)
          break
        case 'sky':
          setSky(m.sky)
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
        case 'out':
          setResult({ secs: m.secs, rank: m.rank, best: m.best })
          setPhase('out')
          break
      }
    }
    // 4001: 같은 네트워크에서 새로 접속해 이 연결이 닫혔다
    sock.onclose = e => { clearInterval(timer.current); setPhase(e.code === 4001 ? 'replaced' : 'lost') }
    return () => { sock.onclose = null; sock.close(); clearInterval(timer.current) }
  }, [countdownThenSit])

  // 이름을 서버에 먼저 확인받고, 통과하면 카운트다운을 시작한다
  const sit = useCallback((name: string) => {
    setNameError('')
    setPhase('checking')
    send({ t: 'name', name })
  }, [send])

  // 앉아 있는 동안에만 입력을 감시한다
  useEffect(() => {
    if (phase !== 'sitting') return
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
      lock.current?.release().catch(() => {})
      lock.current = null
    }
  }, [phase, send])

  return { peers, me, board, counts, phase, countdown, result, nameError, minRecord, sitStart, sit, sky }
}
