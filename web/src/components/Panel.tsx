import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { animate, stagger } from 'animejs'
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
  nameError: string
  minRecord: number
  onSit: (name: string) => void
}

export function Panel({ phase, countdown, result, nameError, minRecord, onSit }: Props) {
  const [name, setName] = useState(loadName)
  const still = useReducedMotion()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    try { localStorage.setItem('mungseok-name', n) } catch { /* 저장 못 해도 앉을 수는 있다 */ }
    onSit(n)
  }

  let key: string = phase
  let body: ReactNode = null
  if (phase === 'intro' || phase === 'checking') {
    key = 'intro'
    body = (
      <Reveal>
        <h1 className="headline" data-reveal>
          <span>멍석 깔아뒀어요.</span>
          <span className="dim">아무것도 하지 마세요.</span>
        </h1>
        <p className="lede" data-reveal>
          한강 둔치에 나란히 앉아 오래 버티는 사람이 이겨요. 마우스, 키보드, 화면을 건드리거나 다른 탭으로 가면 일어난 걸로 쳐요.
        </p>
        <form onSubmit={submit} className="sit-field" data-reveal aria-busy={phase === 'checking'}>
          <label htmlFor="name" className="sr-only">이름</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} maxLength={12}
            placeholder="둔치에서 불릴 이름" autoComplete="nickname"
            aria-invalid={!!nameError} aria-describedby={nameError ? 'name-error' : undefined} />
          <Button type="submit" className="sit-btn" disabled={phase === 'checking'}>멍석에 앉기</Button>
        </form>
        {nameError && <p id="name-error" className="field-error" role="alert">{nameError}</p>}
      </Reveal>
    )
  }
  else if (phase === 'count') body = (
    <div className="countdown">
      <p className="eyebrow">손 떼세요</p>
      <Countdown n={countdown} />
    </div>
  )
  else if (phase === 'out' && result) body = (
    <div>
      <p className="eyebrow">{result.away ? '자리를 비우셨네요' : '일어났어요'}</p>
      <CountUp secs={result.secs} />
      <p className="result-rank">
        {result.away && <>자리를 비운 것 같아서 마지막으로 확인된 때까지만 기록했어요.<br /></>}
        {result.rank ? <>오늘 <strong>{result.rank}등</strong>이에요.</>
          : result.secs < minRecord ? `순위에는 ${minRecord}초 넘게 앉아야 올라가요.`
          : result.best ? `오늘 내 최고 기록(${korean(result.best)})보다 짧아서 순위는 그대로예요.`
          : '오늘 10등 안에는 못 들었어요.'}
      </p>
      <div className="actions">
        <Button className="sit-btn" onClick={() => onSit(name.trim())}>다시 앉기</Button>
        <ShareButton result={result} />
      </div>
    </div>
  )
  else if (phase === 'lost' || phase === 'replaced') body = (
    <div>
      <p className="eyebrow">연결이 끊겼어요</p>
      <p className="notice">
        {phase === 'replaced'
          ? '같은 네트워크의 다른 탭이나 기기에서 멍석에 들어와서 이 화면은 닫았어요. 한 네트워크에서는 한 명만 앉을 수 있어요.'
          : '서버와 연결이 끊겨서 앉아 있던 시간은 기록되지 않았어요.'}
      </p>
      <div className="actions"><Button className="sit-btn" onClick={() => location.reload()}>다시 연결하기</Button></div>
    </div>
  )

  return (
    <AnimatePresence mode="wait">
      {body && (
        <motion.section
          key={key}
          className="panel"
          initial={{ opacity: 0, y: still ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: still ? 0 : -8 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {body}
        </motion.section>
      )}
    </AnimatePresence>
  )
}

// Anime.js: 처음 들어왔을 때 문장들이 차례로 떠오른다
function Reveal({ children }: { children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!el.current || reduced()) return
    const a = animate(el.current.querySelectorAll('[data-reveal], [data-reveal] > span'), {
      opacity: [0, 1],
      translateY: [14, 0],
      duration: 900,
      delay: stagger(90, { start: 150 }),
      ease: 'outExpo',
    })
    return () => { a.revert() }
  }, [])
  return <div ref={el}>{children}</div>
}

// Anime.js: 숫자가 바뀔 때마다 가볍게 가라앉는다
function Countdown({ n }: { n: number }) {
  const el = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (!el.current || reduced()) return
    const a = animate(el.current, { opacity: [0, 1], scale: [1.25, 1], filter: ['blur(8px)', 'blur(0px)'], duration: 700, ease: 'outExpo' })
    return () => { a.revert() }
  }, [n])
  return <p className="count-num" ref={el} aria-live="assertive">{n}</p>
}

// Anime.js: 앉아 있던 시간이 0초부터 올라간다
function CountUp({ secs }: { secs: number }) {
  const el = useRef<HTMLParagraphElement>(null)
  const text = (s: number) => korean(s)
  useEffect(() => {
    if (!el.current || reduced()) return
    const target = el.current
    const shown = { v: 0 }
    const a = animate(shown, {
      v: secs,
      duration: Math.min(1800, 500 + secs * 20),
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
  return <Button variant="ghost" className="ghost-btn" onClick={share}>{done ? '복사했어요' : '기록 공유하기'}</Button>
}
