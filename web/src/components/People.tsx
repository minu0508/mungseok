import { useId, type CSSProperties } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Peer } from '@/useMungseok'

// 가로등 불빛을 등지고 앉은 뒷모습이라 옷 색은 어둡고 채도가 낮다
const JACKETS = ['#3b4a5e', '#5a4636', '#3f5246', '#5b4452', '#4e4a3a', '#2e3440', '#6b5a45', '#47506a']
const HAIR = ['#0d0d10', '#17120f', '#1c1712', '#0f1114']
const COL_ORDER = [4, 5, 3, 6, 2, 7, 1, 8, 0, 9] // 앞줄 가운데부터 채운다
const ROWS = [{ y: 10, s: 1 }, { y: 40, s: 0.8 }, { y: 64, s: 0.64 }]

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

function seatStyle(p: Peer, h: number) {
  const r = Math.floor(p.seat / 10) % ROWS.length
  const col = COL_ORDER[p.seat % 10]
  return {
    left: `${7 + col * 9.6 + (r % 2) * 4.2 + ((h % 7) - 3) * 0.4}%`,
    bottom: `${ROWS[r].y}%`,
    zIndex: 10 - r,
    '--s': ROWS[r].s,
    '--fog': r * 0.18,
    '--d': `${-(h % 60) / 10}s`,
  } as CSSProperties
}

/** 멍석 위에 책상다리로 앉은 사람의 뒷모습 */
function Figure({ h }: { h: number }) {
  const id = useId()
  const jacket = JACKETS[h % JACKETS.length]
  const hair = HAIR[(h >> 3) % HAIR.length]
  const style = (h >> 5) % 5            // 0 짧은 머리, 1 긴 머리, 2 묶은 머리, 3 모자, 4 후드
  const hunch = (h >> 8) % 3 === 0      // 무릎을 끌어안고 웅크린 자세
  const lean = ((h >> 10) % 5) - 2      // 살짝 기울어진 고개
  const headY = hunch ? 37 : 31

  return (
    <svg viewBox="0 0 100 100" className="figure">
      <defs>
        <pattern id={`${id}w`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
          <rect width="4" height="4" fill="#b8935a" />
          <rect width="4" height="1.2" fill="#d2ad70" />
          <rect x="0" width="0.7" height="4" fill="rgba(60,40,15,.35)" />
        </pattern>
        <linearGradient id={`${id}j`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={jacket} />
          <stop offset="1" stopColor="#0b0d12" />
        </linearGradient>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,206,150,.55)" />
          <stop offset=".45" stopColor="rgba(255,206,150,0)" />
        </linearGradient>
      </defs>

      {/* 그림자와 멍석 */}
      <ellipse cx="50" cy="95" rx="46" ry="4" fill="rgba(0,0,0,.55)" />
      <path d="M6 94 L94 94 L84 76 L16 76 Z" fill={`url(#${id}w)`} />
      <path d="M6 94 L94 94 L84 76 L16 76 Z" fill="none" stroke="rgba(40,28,10,.6)" strokeWidth="1" />
      <path d="M16 76 L84 76" stroke="rgba(255,225,170,.35)" strokeWidth=".8" />

      <g className="breath">
        {/* 책상다리: 골반 양옆으로 무릎이 보인다 */}
        <ellipse cx="50" cy="83" rx={hunch ? 26 : 31} ry="6.5" fill="#101319" />
        {/* 등 */}
        <path
          d={hunch
            ? 'M29 84 C25 66 28 50 38 44 Q50 39 62 44 C72 50 75 66 71 84 Z'
            : 'M28 84 C26 64 28 50 35 43 Q50 37 65 43 C72 50 74 64 72 84 Z'}
          fill={`url(#${id}j)`}
        />
        {/* 팔: 옆구리를 따라 내려온다 */}
        <path d={hunch ? 'M31 52 C27 62 28 72 33 80' : 'M30 50 C26 60 26 72 30 81'} stroke="#0b0d12" strokeWidth="3" fill="none" opacity=".55" />
        <path d={hunch ? 'M69 52 C73 62 72 72 67 80' : 'M70 50 C74 60 74 72 70 81'} stroke="#0b0d12" strokeWidth="3" fill="none" opacity=".55" />
        {/* 목과 머리 */}
        <g transform={`rotate(${lean * 3} 50 ${headY + 10})`}>
          {style === 4
            ? <path d={`M37 ${headY + 12} C35 ${headY - 6} 65 ${headY - 6} 63 ${headY + 12} Q50 ${headY + 16} 37 ${headY + 12} Z`} fill={jacket} />
            : <rect x="46" y={headY + 6} width="8" height="8" fill="#15161b" />}
          {style !== 4 && <ellipse cx="50" cy={headY} rx="10.5" ry="12" fill={hair} />}
          {style === 1 && <path d={`M39.5 ${headY} C39 ${headY + 12} 41 ${headY + 18} 44 ${headY + 20} L56 ${headY + 20} C59 ${headY + 18} 61 ${headY + 12} 60.5 ${headY} Z`} fill={hair} />}
          {style === 2 && <circle cx="50" cy={headY - 12} r="4.5" fill={hair} />}
          {style === 3 && <path d={`M39 ${headY - 2} C39 ${headY - 15} 61 ${headY - 15} 61 ${headY - 2} Z`} fill="#24262d" />}
          {/* 머리 윤곽에 맺힌 불빛 */}
          <ellipse cx="50" cy={headY} rx="10.5" ry="12" fill="none" stroke={`url(#${id}rim)`} strokeWidth="1.2" />
        </g>
        {/* 어깨 윤곽에 맺힌 불빛 */}
        <path d={hunch ? 'M30 60 C28 50 34 45 40 43 Q50 39 60 43 C66 45 72 50 70 60' : 'M29 58 C28 50 31 45 36 43 Q50 37 64 43 C69 45 72 50 71 58'}
          fill="none" stroke={`url(#${id}rim)`} strokeWidth="1.3" />
      </g>
    </svg>
  )
}

// Motion: 앉을 때는 위에서 내려앉고, 일어날 때는 일어서듯 위로 사라진다
export function People({ peers, me }: { peers: Map<string, Peer>; me: string | null }) {
  const still = useReducedMotion()
  return (
    <div className="people">
      <AnimatePresence>
        {[...peers.values()].map(p => {
          const h = hash(p.id)
          return (
            <motion.div
              key={p.id}
              className={p.id === me ? 'person me' : 'person'}
              style={{ ...seatStyle(p, h), x: '-50%' }}
              initial={still ? false : { opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={still ? { opacity: 0 } : { opacity: 0, y: -40, transition: { duration: 0.9, ease: [0.4, 0, 1, 1] } }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            >
              {p.id === me && <span className="me-tag">나</span>}
              <Figure h={h} />
              <span className="name-tip">{p.name}</span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
