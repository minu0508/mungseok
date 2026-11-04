import { useEffect, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import { LiveLineChart } from '@/components/charts/live-line-chart'
import { LiveLine } from '@/components/charts/live-line'
import type { LiveLinePoint } from '@/components/charts/live-line-chart'
import { clock } from '@/lib/format'
import type { Rank } from '@/useMungseok'

export function Board({ board, counts, hidden }: { board: Rank[]; counts: LiveLinePoint[]; hidden: boolean }) {
  const [open, setOpen] = useState(false)
  const list = useRef<HTMLOListElement>(null)
  const now = counts.at(-1)?.value ?? 0
  const shown = open ? board : board.slice(0, 5)

  // Anime.js: 순위가 바뀌면 줄이 차례로 들어온다
  const sig = board.map(r => r.name + r.secs).join('|')
  useEffect(() => {
    if (!list.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const a = animate(list.current.children, { opacity: [0, 1], translateX: [-6, 0], duration: 600, delay: stagger(40), ease: 'outQuart' })
    return () => { a.revert() }
  }, [sig])

  return (
    <aside className={`board${hidden ? ' gone' : ''}${open ? ' open' : ''}`} aria-hidden={hidden}>
      <section className="board-now">
        <div className="board-head">
          <h2>지금 멍때리는 사람</h2>
          <p className="now-num">{now}<span>명</span></p>
        </div>
        {counts.length > 1 && (
          <div className="live">
            {/* Bklit UI: 5초마다 들어오는 전체 인원을 최근 5분 동안 그린다 */}
            <LiveLineChart data={counts} value={now} window={300} margin={{ top: 6, right: 6, bottom: 4, left: 6 }} style={{ height: 56 }}>
              <LiveLine dataKey="value" strokeWidth={1.5} badge={false} dotSize={3} />
            </LiveLineChart>
            <div className="live-axis"><span>5분 전</span><span>지금</span></div>
          </div>
        )}
      </section>

      <section className="board-rank">
        <div className="board-head">
          <h2>오늘 오래 앉은 사람</h2>
          {board.length > 5 && (
            <button type="button" className="more" onClick={() => setOpen(o => !o)} aria-expanded={open}>
              {open ? '접기' : `${board.length}명 모두`}
            </button>
          )}
        </div>
        {board.length === 0
          ? <p className="empty">아직 기록이 없어요. 첫 번째로 남겨 보세요.</p>
          : (
            <ol ref={list}>
              {shown.map((r, i) => (
                <li key={`${r.name}-${r.secs}-${i}`} className={i < 3 ? 'top' : undefined}>
                  <span className="r">{i + 1}</span>
                  <span className="n">{r.name}</span>
                  <span className="s">{clock(r.secs)}</span>
                </li>
              ))}
            </ol>
          )}
      </section>
    </aside>
  )
}
