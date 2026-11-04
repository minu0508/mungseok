import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveLinePoint } from '@/components/charts/live-line-chart'

export type Peer = { id: string; name: string; seat: number }
export type Rank = { name: string; secs: number }
export type Phase = 'intro' | 'count' | 'sitting' | 'standing' | 'out' | 'lost'
export type Result = { secs: number; rank: number | null }

const COUNT_KEEP = 120
// 이 중 하나라도 일어나면 일어난 것으로 친다
const TRIP_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'blur'] as const

export function useMungseok() {
  const [peers, setPeers] = useState<Map<string, Peer>>(() => new Map())
  const [me, setMe] = useState<string | null>(null)
  const [board, setBoard] = useState<Rank[]>([])
  const [counts, setCounts] = useState<LiveLinePoint[]>([])
  const [phase, setPhase] = useState<Phase>('intro')
  const [countdown, setCountdown] = useState(3)
  const [result, setResult] = useState<Result | null>(null)
  const [minRecord, setMinRecord] = useState(10)
  const [sitStart, setSitStart] = useState(0)
  const ws = useRef<WebSocket | null>(null)
  const meRef = useRef<string | null>(null)
  const lock = useRef<WakeLockSentinel | null>(null)

  const send = useCallback((m: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m))
  }, [])

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
          setResult({ secs: m.secs, rank: m.rank })
          setPhase('out')
          break
      }
    }
    sock.onclose = () => setPhase('lost')
    return () => { sock.onclose = null; sock.close() }
  }, [])

  // 3, 2, 1 이 끝나면 앉는다. 버튼을 누른 손이 바로 실격되지 않게 하는 여유 시간
  const sit = useCallback((name: string) => {
    setPhase('count')
    setCountdown(3)
    navigator.wakeLock?.request('screen').then(l => { lock.current = l }).catch(() => {})
    let n = 3
    const t = setInterval(() => {
      n -= 1
      if (n > 0) return setCountdown(n)
      clearInterval(t)
      ;(document.activeElement as HTMLElement | null)?.blur()
      send({ t: 'sit', name })
    }, 1000)
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

  return { peers, me, board, counts, phase, countdown, result, minRecord, sitStart, sit }
}
