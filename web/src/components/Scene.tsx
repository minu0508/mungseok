import { useEffect, useMemo, useRef } from 'react'
import { animate, stagger } from 'animejs'

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// 같은 모양이 매번 나오도록 고정된 씨앗으로 만든 난수
function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647
}

function useSkyline() {
  return useMemo(() => {
    const rnd = seeded(7)
    const buildings: { x: number; w: number; h: number }[] = []
    const windows: { x: number; y: number; o: number }[] = []
    for (let x = 0; x < 1000;) {
      const w = 18 + rnd() * 34, h = 25 + rnd() * 70
      buildings.push({ x, w, h })
      for (let wy = 120 - h + 6; wy < 116; wy += 9)
        for (let wx = x + 4; wx < x + w - 4; wx += 7)
          if (rnd() > 0.9) windows.push({ x: wx, y: wy, o: 0.35 + rnd() * 0.4 })
      x += w + 2
    }
    return { buildings, windows }
  }, [])
}

export function Scene() {
  const root = useRef<HTMLDivElement>(null)
  const { buildings, windows } = useSkyline()

  // Anime.js: 강물에 비친 다리 조명이 일렁이고, 가로등이 천천히 숨 쉰다
  useEffect(() => {
    if (reduced() || !root.current) return
    const glints = animate(root.current.querySelectorAll('.glint'), {
      opacity: [0.2, 0.8],
      scaleX: [1, 2.4],
      duration: 5200,
      delay: stagger(260, { from: 'center' }),
      ease: 'inOutSine',
      loop: true,
      alternate: true,
    })
    const lamps = animate(root.current.querySelectorAll('.lamp'), {
      opacity: [1, 0.45],
      duration: 2600,
      delay: stagger(140, { from: 'random' }),
      ease: 'inOutSine',
      loop: true,
      alternate: true,
    })
    return () => { glints.revert(); lamps.revert() }
  }, [])

  return (
    <div className="scene" ref={root} aria-hidden="true">
      <div className="sky" />
      <svg className="skyline" viewBox="0 0 1000 120" preserveAspectRatio="none">
        {buildings.map((b, i) => <rect key={i} x={b.x} y={120 - b.h} width={b.w} height={b.h} fill="#11182a" />)}
        {windows.map((w, i) => <rect key={i} x={w.x} y={w.y} width={2.5} height={3} fill="#f2c14e" opacity={w.o} />)}
        <path d="M700 120 Q740 70 790 120Z" fill="#141c30" />
        <rect x={742} y={40} width={4} height={56} fill="#141c30" />
        <rect x={736} y={52} width={16} height={6} fill="#141c30" />
        <circle className="lamp" cx={744} cy={38} r={2} fill="#f2c14e" />
      </svg>
      <div className="river">
        {Array.from({ length: 25 }, (_, i) => <span key={i} className="glint" style={{ left: `${2 + i * 4}%` }} />)}
      </div>
      <svg className="bridge" viewBox="0 0 1000 40" preserveAspectRatio="none">
        <rect x={0} y={16} width={1000} height={5} fill="#0d1322" />
        {Array.from({ length: 13 }, (_, i) => 40 + i * 80).map(x =>
          <path key={x} d={`M${x - 40} 21 Q${x} 38 ${x + 40} 21`} stroke="#0d1322" strokeWidth={3} fill="none" />)}
        {Array.from({ length: 25 }, (_, i) => 20 + i * 40).map(x =>
          <circle key={x} className="lamp" cx={x} cy={14} r={1.6} fill="#f2c14e" />)}
      </svg>
      <div className="bank" />
    </div>
  )
}
