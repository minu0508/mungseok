import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Scene } from '@/components/Scene'
import { People } from '@/components/People'
import { Panel } from '@/components/Panel'
import { Board } from '@/components/Board'
import { clock } from '@/lib/format'
import { useMungseok } from '@/useMungseok'

const kst = () => new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })

export default function App() {
  const m = useMungseok()
  const sitting = m.phase === 'sitting' || m.phase === 'standing'

  useEffect(() => { document.body.classList.toggle('sitting', sitting) }, [sitting])

  return (
    <>
      <Scene settle={sitting}>
        <People peers={m.peers} me={m.me} />
      </Scene>
      <div className="grain" aria-hidden="true" />

      <motion.div className="hud" animate={{ opacity: sitting ? 0 : 1 }} transition={{ duration: sitting ? 1.2 : 0.5 }}
        style={{ pointerEvents: sitting ? 'none' : undefined }} aria-hidden={sitting}>
        <Brand />
        <Board board={m.board} counts={m.counts} hidden={sitting} />
        <Panel phase={m.phase} countdown={m.countdown} result={m.result} nameError={m.nameError} minRecord={m.minRecord} onSit={m.sit} />
      </motion.div>

      <AnimatePresence>
        {m.phase === 'sitting' && <Clock key="clock" start={m.sitStart} />}
      </AnimatePresence>
      <p className="sr-only" aria-live="polite">{m.phase === 'sitting' ? '앉았어요. 이제 아무것도 하지 마세요.' : ''}</p>
    </>
  )
}

function Brand() {
  const [time, setTime] = useState(kst)
  useEffect(() => {
    const t = setInterval(() => setTime(kst()), 10_000)
    return () => clearInterval(t)
  }, [])
  return (
    <header className="brand">
      <p className="wordmark">멍석</p>
      <p className="brand-meta">한강 둔치 <span aria-hidden="true">·</span> <time>{time}</time></p>
    </header>
  )
}

// 앉아 있는 동안 하늘에 조용히 떠 있는 시계
function Clock({ start }: { start: number }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSecs(Math.floor((performance.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [start])
  return (
    <motion.div className="clock" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 2.4 } }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      <p className="clock-num">{clock(secs)}</p>
      <p className="clock-label">아무것도 하지 않는 중</p>
    </motion.div>
  )
}
