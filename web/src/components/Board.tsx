import { useState } from 'react'
import { LiveLineChart } from '@/components/charts/live-line-chart'
import { LiveLine } from '@/components/charts/live-line'
import { LiveXAxis } from '@/components/charts/live-x-axis'
import type { LiveLinePoint } from '@/components/charts/live-line-chart'
import { clock } from '@/lib/format'
import type { Rank } from '@/useMungseok'

const hhmm = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

export function Board({ board, counts, hidden }: { board: Rank[]; counts: LiveLinePoint[]; hidden: boolean }) {
  const [open, setOpen] = useState(false)
  const now = counts.at(-1)?.value ?? 0
  return (
    <aside className={`board${open ? ' open' : ''}${hidden ? ' gone' : ''}`} aria-hidden={hidden}>
      <button type="button" className="board-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        오늘 오래 앉은 사람
      </button>
      <ol>
        {board.length === 0
          ? <li className="empty">아직 아무도 없어요. 첫 기록을 남겨 보세요.</li>
          : board.map((r, i) => (
            <li key={`${r.name}-${r.secs}-${i}`}>
              <span className="r">{i + 1}</span>
              <span className="n">{r.name}</span>
              <span className="s">{clock(r.secs)}</span>
            </li>
          ))}
      </ol>
      <h2>지금 멍때리는 사람 <span className="now">{now}명</span></h2>
      {counts.length > 1
        ? (
          <div className="live">
            {/* Bklit UI: 5초마다 들어오는 전체 인원을 최근 5분 동안 그린다 */}
            <LiveLineChart data={counts} value={now} window={300} margin={{ top: 8, right: 48, bottom: 22, left: 4 }} style={{ height: 84 }}>
              <LiveLine dataKey="value" strokeWidth={1.5} formatValue={v => `${Math.round(v)}명`} />
              <LiveXAxis numTicks={3} formatTime={hhmm} />
            </LiveLineChart>
          </div>
        )
        : <p className="empty">인원 변화를 모으는 중이에요.</p>}
    </aside>
  )
}
