import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Volume2, VolumeX } from 'lucide-react'
import { Scene } from '@/components/Scene'
import { People } from '@/components/People'
import { Panel } from '@/components/Panel'
import { Board } from '@/components/Board'
import { clock } from '@/lib/format'
import { palette, previewOverride, weatherOf, WEATHER_LABEL, type Palette, type SkyData, type Weather } from '@/lib/sky'
import { useRiverSound } from '@/lib/sound'
import { useMungseok } from '@/useMungseok'

const override = previewOverride()
// ?og=1: 공유 미리보기 이미지(og.png)를 찍기 위한 화면. 글자 대신 제목만, 둔치에는 장식용 사람들
const OG = new URLSearchParams(location.search).has('og')
const OG_PEERS = new Map([4, 5, 3, 6, 2, 7, 13, 14, 12].map((seat, i) => [`og${i}x${seat * 7}`, { id: `og${i}x${seat * 7}`, name: '', seat }]))
const now = () => (override.now ?? Date.now)()
const kst = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })

/** 지금 서울 하늘. 20초마다 다시 계산하고, 색이 실제로 바뀌었을 때만 장면을 다시 합친다 */
function usePalette(sky: SkyData | null) {
  const weather: Weather = override.weather ?? (sky ? weatherOf(sky.code, sky.cloud) : 'clear')
  const calc = () => palette(now(), sky, weather)
  const [pal, setPal] = useState<Palette>(calc)
  useEffect(() => {
    const update = () => setPal(prev => { const next = calc(); return JSON.stringify(next) === JSON.stringify(prev) ? prev : next })
    update()
    const t = setInterval(update, 20_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sky, weather])
  return pal
}

export default function App() {
  const m = useMungseok()
  const sitting = m.phase === 'sitting' || m.phase === 'standing'
  const pal = usePalette(m.sky)
  const sound = useRiverSound(pal.weather)

  useEffect(() => { document.body.classList.toggle('sitting', sitting) }, [sitting])
  // 밝은 하늘이면 글자와 카드를 밝은 테마로 바꾼다
  useEffect(() => {
    document.documentElement.classList.toggle('day', pal.day === 1)
    document.documentElement.style.setProperty('--daylight', String(1 - pal.night))
  }, [pal.day, pal.night])

  if (OG) return (
    <>
      <Scene pal={pal} sitting={false}>
        <People peers={OG_PEERS} me={null} />
      </Scene>
      <div className="grain" aria-hidden="true" />
      <div className="og-title">
        <p className="og-mark">멍석</p>
        <p className="og-line">한강 둔치에 나란히 앉아, 아무것도 하지 않기</p>
      </div>
    </>
  )

  return (
    <>
      <Scene pal={pal} sitting={sitting}>
        <People peers={m.peers} me={m.me} />
      </Scene>
      <div className="grain" aria-hidden="true" />

      <motion.div className="hud" animate={{ opacity: sitting ? 0 : 1 }} transition={{ duration: sitting ? 1.2 : 0.5 }}
        style={{ pointerEvents: sitting ? 'none' : undefined }} aria-hidden={sitting}>
        <Brand pal={pal} temp={m.sky?.temp} sound={sound} />
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

function Brand({ pal, temp, sound }: { pal: Palette; temp?: number; sound: { on: boolean; toggle: () => void } }) {
  const [time, setTime] = useState(() => kst(now()))
  useEffect(() => {
    const t = setInterval(() => setTime(kst(now())), 10_000)
    return () => clearInterval(t)
  }, [])
  const label = useMemo(() => `${WEATHER_LABEL[pal.weather]}${temp !== undefined ? ` ${Math.round(temp)}°` : ''}`, [pal.weather, temp])
  return (
    <header className="brand">
      <p className="wordmark">멍석</p>
      <p className="brand-meta">한강 둔치 <span aria-hidden="true">·</span> <time>{time}</time> <span aria-hidden="true">·</span> {label}</p>
      <button type="button" className="sound" onClick={sound.toggle} aria-pressed={sound.on}>
        {sound.on ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
        물소리 {sound.on ? '끄기' : '켜기'}
      </button>
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
