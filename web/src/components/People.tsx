import type { CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Peer } from '@/useMungseok'

const JACKETS = ['#6f8faf', '#b5651d', '#7a9e7e', '#c98b9e', '#d9c27e', '#5e6472', '#9b6b5a']
const COL_ORDER = [4, 5, 3, 6, 2, 7, 1, 8, 0, 9] // 앞줄 가운데부터 채운다
const ROWS = [{ y: 16, s: 1 }, { y: 46, s: 0.82 }, { y: 70, s: 0.66 }]

function seatStyle(p: Peer) {
  const r = Math.floor(p.seat / 10) % ROWS.length
  const col = COL_ORDER[p.seat % 10]
  const h = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0)
  return {
    left: `${6 + col * 9.8 + (r % 2) * 4}%`,
    bottom: `${ROWS[r].y}%`,
    zIndex: 10 - r,
    '--s': ROWS[r].s,
    '--jacket': JACKETS[h % JACKETS.length],
    '--d': `${-(h % 55) / 10}s`,
  } as CSSProperties
}

// Motion: 앉을 때는 아래에서 내려앉고, 일어날 때는 위로 사라진다
export function People({ peers, me }: { peers: Map<string, Peer>; me: string | null }) {
  const still = useReducedMotion()
  return (
    <div className="people" aria-hidden="true">
      <AnimatePresence>
        {[...peers.values()].map(p => (
          <motion.div
            key={p.id}
            className={p.id === me ? 'person me' : 'person'}
            style={{ ...seatStyle(p), x: '-50%' }}
            initial={still ? false : { opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: -36 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="mat" />
            <span className="body" />
            <span className="head" />
            <span className="tag">{p.id === me ? '나' : p.name}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
