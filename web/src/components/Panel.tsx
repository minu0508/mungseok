import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { animate } from 'animejs'
import { Button } from '@/components/ui/button'
import { korean } from '@/lib/format'
import type { Phase, Result } from '@/useMungseok'

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function loadName() {
  try { return localStorage.getItem('mungseok-name') ?? '' } catch { return '' }
}

type Props = {
  phase: Phase
  countdown: number
  result: Result | null
  minRecord: number
  here: number
  onSit: (name: string) => void
}

export function Panel({ phase, countdown, result, minRecord, here, onSit }: Props) {
  const [name, setName] = useState(loadName)
  const still = useReducedMotion()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    try { localStorage.setItem('mungseok-name', n) } catch { /* 저장 못 해도 앉을 수는 있다 */ }
    onSit(n)
  }

  let body: ReactNode = null
  if (phase === 'intro') body = (
    <>
      <h1 className="wordmark">멍<span>석</span></h1>
      <p className="lead">한강 둔치에 멍석 깔아뒀어요. 앉아서 아무것도 하지 마세요.</p>
      <p className="rule">마우스, 키보드, 화면을 건드리거나 다른 탭으로 가면 일어난 걸로 쳐요.</p>
      <form onSubmit={submit} className="sit-form">
        <label htmlFor="name" className="sr-only">이름</label>
        <input id="name" value={name} onChange={e => setName(e.target.value)} maxLength={12}
          placeholder="둔치에서 불릴 이름" autoComplete="nickname" />
        <Button type="submit" size="lg" className="btn-straw">멍석에 앉기</Button>
      </form>
      <p className="here">{here ? `이 둔치에 ${here}명 앉아 있어요` : '지금은 둔치가 비어 있어요. 먼저 앉아 보세요.'}</p>
    </>
  )
  else if (phase === 'count') body = (
    <>
      <p>손 떼세요</p>
      <Countdown n={countdown} />
    </>
  )
  else if (phase === 'out' && result) body = (
    <>
      <p>일어났어요</p>
      <CountUp secs={result.secs} />
      <p className="result-rank">
        {result.rank ? <>오늘 <strong>{result.rank}등</strong>예요.</>
          : result.secs < minRecord ? `순위에는 ${minRecord}초 넘게 앉아야 올라가요.`
          : '오늘 10등 안에는 못 들었어요.'}
      </p>
      <div className="row">
        <Button size="lg" className="btn-straw" onClick={() => onSit(name.trim())}>다시 앉기</Button>
        <ShareButton result={result} />
      </div>
    </>
  )
  else if (phase === 'lost') body = (
    <>
      <p>연결이 끊겼어요. 앉아 있던 시간은 기록되지 않았어요.</p>
      <div className="row"><Button size="lg" className="btn-straw" onClick={() => location.reload()}>다시 연결하기</Button></div>
    </>
  )

  return (
    <AnimatePresence mode="wait">
      {body && (
        <motion.section
          key={phase}
          className="panel"
          initial={still ? { opacity: 0 } : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={still ? { opacity: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {body}
        </motion.section>
      )}
    </AnimatePresence>
  )
}

// Anime.js: 숫자가 바뀔 때마다 한 번 튀어 오른다
function Countdown({ n }: { n: number }) {
  const el = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (!el.current || reduced()) return
    const a = animate(el.current, { scale: [1.5, 1], opacity: [0, 1], duration: 650, ease: 'outBack' })
    return () => { a.revert() }
  }, [n])
  return <p className="count-num" ref={el} aria-live="assertive">{n}</p>
}

// Anime.js: 앉아 있던 시간이 0초부터 올라간다
function CountUp({ secs }: { secs: number }) {
  const el = useRef<HTMLParagraphElement>(null)
  const text = (s: number) => `${korean(s)} 앉아 있었어요`
  useEffect(() => {
    if (!el.current || reduced()) return
    const target = el.current
    const shown = { v: 0 }
    const a = animate(shown, {
      v: secs,
      duration: Math.min(1800, 400 + secs * 20),
      ease: 'outExpo',
      onUpdate: () => { target.textContent = text(Math.round(shown.v)) },
    })
    return () => { a.cancel(); target.textContent = text(secs) }
  }, [secs])
  return <p className="result-time" ref={el} aria-live="polite">{text(secs)}</p>
}

function ShareButton({ result }: { result: Result }) {
  const [done, setDone] = useState(false)
  const share = async () => {
    const text = `멍석에서 ${korean(result.secs)} 동안 아무것도 안 했어요${result.rank ? ` (오늘 ${result.rank}등)` : ''}`
    try {
      if (navigator.share) await navigator.share({ text, url: location.origin })
      else { await navigator.clipboard.writeText(`${text} ${location.origin}`); setDone(true) }
    } catch { /* 공유 창을 닫은 경우 */ }
  }
  return <Button size="lg" variant="outline" className="btn-ghost" onClick={share}>{done ? '복사했어요' : '기록 공유하기'}</Button>
}
