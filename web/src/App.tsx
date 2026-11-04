import { useEffect, useState } from 'react'
import { Scene } from '@/components/Scene'
import { People } from '@/components/People'
import { Panel } from '@/components/Panel'
import { Board } from '@/components/Board'
import { clock } from '@/lib/format'
import { useMungseok } from '@/useMungseok'

export default function App() {
  const m = useMungseok()
  const sitting = m.phase === 'sitting' || m.phase === 'standing'

  useEffect(() => { document.body.classList.toggle('sitting', sitting) }, [sitting])

  return (
    <>
      <Scene />
      <People peers={m.peers} me={m.me} />
      <div className="hud">
        <Board board={m.board} counts={m.counts} hidden={sitting} />
        <Panel phase={m.phase} countdown={m.countdown} result={m.result} minRecord={m.minRecord} here={m.peers.size} onSit={m.sit} />
      </div>
      {m.phase === 'sitting' && <Clock start={m.sitStart} />}
      <p className="sr-only" aria-live="polite">{m.phase === 'sitting' ? '앉았어요. 이제 아무것도 하지 마세요.' : ''}</p>
    </>
  )
}

// 앉아 있는 동안 하늘에 작게 떠 있는 시계
function Clock({ start }: { start: number }) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSecs(Math.floor((performance.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [start])
  return <p className="clock">{clock(secs)}</p>
}
