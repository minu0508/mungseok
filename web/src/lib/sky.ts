/*
 * 서울 시간과 날씨로 하늘·물·둔치 색을 정한다.
 * 해 뜨고 지는 시각을 기준으로 한 하루 열쇠 장면들 사이를 부드럽게 섞는다.
 */

import { useEffect, useState } from 'react'

export type SkyData = { code: number; cloud: number; precip: number; temp: number; sunrise: number; sunset: number }

// 서울 날씨: 화면이 Open-Meteo(키 없는 무료 API)에서 15분마다 직접 받는다. 서버를 깨우지 않아도 된다
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=37.52&longitude=126.98'
  + '&current=weather_code,cloud_cover,precipitation,temperature_2m&daily=sunrise,sunset&timezone=Asia%2FSeoul&timeformat=unixtime&forecast_days=1'

export function useSeoulSky() {
  const [sky, setSky] = useState<SkyData | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch(WEATHER_URL)
        if (!r.ok) return
        const j = await r.json()
        const next: SkyData = {
          code: j.current?.weather_code, cloud: j.current?.cloud_cover, precip: j.current?.precipitation, temp: j.current?.temperature_2m,
          sunrise: j.daily?.sunrise?.[0], sunset: j.daily?.sunset?.[0],
        }
        if (alive && Object.values(next).every(Number.isFinite)) setSky(next)
      } catch { /* 못 받으면 시간만으로 하늘을 그린다 */ }
    }
    load()
    const t = setInterval(load, 15 * 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return sky
}
export type Weather = 'clear' | 'clouds' | 'overcast' | 'fog' | 'rain' | 'snow' | 'storm'

export type Palette = {
  top: string; mid: string; horizon: string; glow: string
  water: [string, string]; bank: [string, string]
  night: number   // 0 낮 ~ 1 밤: 불빛·별·항공등 세기
  day: number     // 화면 테마 (밝은 하늘이면 1)
  stars: number
  cloud: number   // 구름 양 0~1
  weather: Weather
  sun: { x: number; alt: number } | null // 하늘에서의 위치 (0~1)
}

// WMO 날씨 코드 → 장면 날씨
export function weatherOf(code: number, cloud: number): Weather {
  if (code >= 95) return 'storm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if (code === 45 || code === 48) return 'fog'
  if (code === 3 || cloud > 80) return 'overcast'
  if (code === 2 || cloud > 35) return 'clouds'
  return 'clear'
}
export const WEATHER_LABEL: Record<Weather, string> = {
  clear: '맑음', clouds: '구름 조금', overcast: '흐림', fog: '안개', rain: '비', snow: '눈', storm: '뇌우',
}

// 날씨를 못 받았을 때 쓰는 서울의 월별 대략적인 해 뜨고 지는 시각 (시, 분)
const SUN_TABLE: [number, number, number, number][] = [
  [7, 45, 17, 35], [7, 20, 18, 5], [6, 45, 18, 35], [6, 0, 19, 5], [5, 25, 19, 30], [5, 10, 19, 55],
  [5, 25, 19, 55], [5, 50, 19, 25], [6, 15, 18, 45], [6, 40, 18, 0], [7, 10, 17, 25], [7, 35, 17, 15],
]

/** 한국 시간 기준 오늘 자정(ms) */
function kstMidnight(now: number) {
  const kst = now + 9 * 3600e3
  return now - (kst % 86400e3)
}

export function sunTimes(now: number, data: SkyData | null) {
  if (data) return { rise: data.sunrise * 1000, set: data.sunset * 1000 }
  const m = new Date(now + 9 * 3600e3).getUTCMonth()
  const [rh, rm, sh, sm] = SUN_TABLE[m]
  const base = kstMidnight(now)
  return { rise: base + (rh * 60 + rm) * 60e3, set: base + (sh * 60 + sm) * 60e3 }
}

type Key = { at: number; top: string; mid: string; horizon: string; glow: string; night: number }
const NIGHT: Omit<Key, 'at'> = { top: '#03060d', mid: '#0a1324', horizon: '#1d2338', glow: 'rgba(255,150,90,.20)', night: 1 }

function keys(rise: number, set: number): Key[] {
  const m = 60e3
  const noon = (rise + set) / 2
  return [
    { at: rise - 100 * m, ...NIGHT },
    { at: rise - 35 * m, top: '#0b1430', mid: '#25335c', horizon: '#64587a', glow: 'rgba(255,140,110,.28)', night: 0.85 },
    { at: rise, top: '#24467a', mid: '#6a83b2', horizon: '#f0b08a', glow: 'rgba(255,170,110,.45)', night: 0.35 },
    { at: rise + 80 * m, top: '#4b82c4', mid: '#8bb6e2', horizon: '#dbe7f1', glow: 'rgba(255,240,215,.12)', night: 0 },
    { at: noon, top: '#3c7bcd', mid: '#7cb1e8', horizon: '#d0e4f4', glow: 'rgba(255,250,235,.08)', night: 0 },
    { at: set - 90 * m, top: '#477cbd', mid: '#90b3da', horizon: '#e6dcc9', glow: 'rgba(255,220,170,.16)', night: 0 },
    { at: set - 15 * m, top: '#36558a', mid: '#b0879e', horizon: '#f5a466', glow: 'rgba(255,150,80,.5)', night: 0.15 },
    { at: set + 12 * m, top: '#1b2850', mid: '#574878', horizon: '#dc7c58', glow: 'rgba(255,120,80,.45)', night: 0.5 },
    { at: set + 40 * m, top: '#0b1430', mid: '#1b2a52', horizon: '#474266', glow: 'rgba(255,140,100,.26)', night: 0.9 },
    { at: set + 95 * m, ...NIGHT },
  ]
}

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const toHex = (rgb: number[]) => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
export const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)) }
const rgba = (c: string) => c.match(/[\d.]+/g)!.map(Number)
const mixRgba = (a: string, b: string, t: number) => {
  const x = rgba(a), y = rgba(b)
  return `rgba(${x.slice(0, 3).map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')},${(x[3] + (y[3] - x[3]) * t).toFixed(3)})`
}

export function palette(now: number, data: SkyData | null, weather: Weather): Palette {
  const { rise, set } = sunTimes(now, data)
  const ks = keys(rise, set)
  let k: Omit<Key, 'at'> = NIGHT
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1]
    if (now >= a.at && now < b.at) {
      const t = (now - a.at) / (b.at - a.at)
      k = { top: mix(a.top, b.top, t), mid: mix(a.mid, b.mid, t), horizon: mix(a.horizon, b.horizon, t), glow: mixRgba(a.glow, b.glow, t), night: a.night + (b.night - a.night) * t }
      break
    }
  }

  // 날씨: 구름이 많을수록 회색으로 눌리고, 비·눈이면 더 어둡다
  const cloud = { clear: 0.05, clouds: 0.45, overcast: 0.9, fog: 0.7, rain: 0.95, snow: 0.9, storm: 1 }[weather]
  const grey = mix('#7d8796', '#0b0e14', k.night)
  const dull = { clear: 0, clouds: 0.12, overcast: 0.5, fog: 0.45, rain: 0.62, snow: 0.42, storm: 0.72 }[weather]
  const darken = { clear: 0, clouds: 0, overcast: 0.1, fog: 0, rain: 0.22, snow: 0.05, storm: 0.38 }[weather]
  const fix = (c: string) => mix(mix(c, grey, dull), '#000000', darken)
  const top = fix(k.top), mid = fix(k.mid), horizon = fix(weather === 'snow' ? mix(k.horizon, '#c9d1dc', 0.3 * (1 - k.night)) : k.horizon)

  const n = k.night
  const water: [string, string] = [mix(mix(horizon, mid, 0.5), '#0b1222', 0.35 + n * 0.45), mix(mix(mid, top, 0.5), '#03060c', 0.55 + n * 0.35)]
  const bankDay = weather === 'snow' ? ['#9aa3ad', '#6f7781'] : ['#3d4f3c', '#253224']
  const bankNight = weather === 'snow' ? ['#232a36', '#12161e'] : ['#0b100e', '#040605']
  const bank: [string, string] = [0, 1].map(i => mix(mix(bankDay[i], grey, dull * 0.7), bankNight[i], n)) as [string, string]

  // 해: 일출~일몰 사이를 왼쪽 아래에서 떠올라 오른쪽으로 진다
  const p = (now - rise) / (set - rise)
  const sun = p > -0.03 && p < 1.03 ? { x: 0.12 + p * 0.76, alt: Math.sin(Math.max(0, Math.min(1, p)) * Math.PI) } : null

  return {
    top, mid, horizon, glow: weather === 'clear' || weather === 'clouds' ? k.glow : mixRgba(k.glow, 'rgba(0,0,0,0)', 0.6),
    water, bank, night: n, day: n < 0.25 && darken < 0.3 ? 1 : 0, stars: Math.max(0, n * 1.2 - 0.2) * (1 - cloud), cloud, weather, sun,
  }
}

/** 미리보기: ?time=07:10&weather=rain 으로 시간과 날씨를 정할 수 있다 */
export function previewOverride() {
  const q = new URLSearchParams(location.search)
  const time = q.get('time')?.match(/^(\d{1,2}):(\d{2})$/)
  const w = q.get('weather') as Weather | null
  return {
    now: time ? () => kstMidnight(Date.now()) + (Number(time[1]) * 60 + Number(time[2])) * 60e3 : null,
    weather: w && w in WEATHER_LABEL ? w : null,
  }
}
