import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'

/*
 * 한강 야경을 캔버스에 그린다.
 * 움직이지 않는 부분(하늘·도시·다리·둔치)은 크기가 바뀔 때만 미리 그려 두고,
 * 매 프레임에는 강물(일렁이는 반사 + 하류로 흐르는 물결)과 차·항공등만 그린다.
 */

type Car = { x: number; speed: number; lane: 0 | 1 }
type Blink = { x: number; y: number; phase: number }
type World = {
  W: number; H: number; dpr: number; y0: number; yB: number; deckY: number
  city: HTMLCanvasElement; refl: HTMLCanvasElement; current: HTMLCanvasElement; bank: HTMLCanvasElement
  cars: Car[]; blinks: Blink[]; lampX: number
}

const CURRENT_W = 640

function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647
}
function layer(w: number, h: number, dpr: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * dpr))
  c.height = Math.max(1, Math.round(h * dpr))
  const ctx = c.getContext('2d')!
  ctx.scale(dpr, dpr)
  return { c, ctx }
}

function build(W: number, H: number, dpr: number): World {
  const narrow = W < 640
  const y0 = Math.round(H * (narrow ? 0.5 : 0.56))   // 수평선(강 시작)
  const yB = Math.round(H * (narrow ? 0.76 : 0.8))   // 둔치 시작
  const deckY = y0 - Math.max(7, H * 0.013)
  const k = Math.min(1.4, Math.max(0.6, W / 1440))   // 화면 폭에 따른 건물 크기 배율
  const rnd = seeded(20261104)
  const blinks: Blink[] = []

  // ---------- 하늘 + 도시 + 다리 ----------
  const { c: city, ctx } = layer(W, y0, dpr)
  const { c: lightsC, ctx: lx } = layer(W, y0, dpr) // 반사 줄기용: 불빛만

  const sky = ctx.createLinearGradient(0, 0, 0, y0)
  sky.addColorStop(0, '#03060d')
  sky.addColorStop(0.55, '#0a1324')
  sky.addColorStop(1, '#1d2338')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, y0)
  const glow = ctx.createRadialGradient(W * 0.55, y0, 0, W * 0.55, y0, Math.max(W, H) * 0.65)
  glow.addColorStop(0, 'rgba(255,150,90,.20)')
  glow.addColorStop(0.35, 'rgba(190,110,100,.07)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, y0)
  for (let i = 0; i < 160; i++) {
    const y = rnd() ** 1.6 * y0 * 0.65
    ctx.fillStyle = `rgba(230,235,255,${(0.15 + rnd() * 0.5) * (1 - y / (y0 * 0.7))})`
    ctx.fillRect(rnd() * W, y, rnd() < 0.1 ? 1.4 : 0.8, rnd() < 0.1 ? 1.4 : 0.8)
  }

  const lampXs: number[] = [] // 다리 가로등 위치: 물 위에 긴 금빛 줄기를 만든다
  // refl: 물에 비치는 세기. 창문은 약하게 비쳐야 물이 자글자글해지지 않는다
  const light = (x: number, y: number, w: number, h: number, color: string, a: number, refl = 0.3) => {
    ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillRect(x, y, w, h)
    lx.globalAlpha = a * refl; lx.fillStyle = color; lx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1; lx.globalAlpha = 1
  }

  // 먼 스카이라인: 안개에 묻혀 흐릿하다
  for (let x = -10; x < W;) {
    const w = (10 + rnd() * 26) * k, h = (0.025 + rnd() * 0.06) * H
    ctx.fillStyle = '#141c30'
    ctx.fillRect(x, deckY - h, w, h + (y0 - deckY))
    for (let i = 0; i < w * h * 0.004; i++) light(x + rnd() * w, deckY - h + rnd() * h, 1, 1, '#ffd49a', 0.25)
    x += w + rnd() * 3
  }

  // 남산과 타워
  const nx = W * (narrow ? 0.74 : 0.7), peak = deckY - H * 0.085
  ctx.fillStyle = '#10182a'
  ctx.beginPath()
  ctx.moveTo(nx - W * 0.16, deckY)
  ctx.bezierCurveTo(nx - W * 0.07, peak - H * 0.01, nx + W * 0.05, peak - H * 0.012, nx + W * 0.15, deckY)
  ctx.fill()
  const th = H * 0.1, tw = Math.max(2, 3 * k)
  ctx.fillStyle = '#121a2d'
  ctx.fillRect(nx - tw / 2, peak - th, tw, th)
  ctx.fillRect(nx - 6 * k, peak - th * 0.78, 12 * k, 5 * k)
  ctx.fillRect(nx - 0.5, peak - th - H * 0.03, 1, H * 0.03)
  for (let i = 0; i < 6; i++) light(nx - 5 * k + i * 2 * k, peak - th * 0.78 + 2 * k, 1, 1, '#fff1d6', 0.9)
  blinks.push({ x: nx, y: peak - th - H * 0.03, phase: 0 })

  // 가까운 스카이라인: 가운데에 고층 빌딩, 양옆은 아파트 단지. 왼쪽 하늘은 글자 자리로 낮게 비운다
  for (let x = -6; x < W;) {
    const pos = x / W
    const core = narrow ? pos > 0.15 && pos < 0.55 : pos > 0.36 && pos < 0.62
    const kind = rnd() < (core ? 0.62 : 0.1) ? 'tower' : rnd() < (pos > 0.6 ? 0.7 : 0.45) ? 'apt' : 'low'
    const w = (kind === 'tower' ? 16 + rnd() * 22 : kind === 'apt' ? 34 + rnd() * 46 : 18 + rnd() * 30) * k
    const lowSide = !narrow && pos < 0.3 ? 0.65 : 1
    const h = (kind === 'tower' ? 0.1 + rnd() * 0.14 : kind === 'apt' ? 0.05 + rnd() * 0.05 : 0.025 + rnd() * 0.03) * H * lowSide
    const top = deckY - h
    // 남산 앞은 낮게 비워 둔다
    if (Math.abs(x + w / 2 - nx) < W * 0.08 && kind === 'tower') { x += w; continue }
    ctx.fillStyle = '#0a0f1c'
    ctx.fillRect(x, top, w, deckY - top + 1)
    if (kind === 'tower' && rnd() < 0.6) { // 꼭대기를 한 단 줄인다
      ctx.fillRect(x + w * 0.2, top - h * 0.08, w * 0.6, h * 0.08)
      if (rnd() < 0.5) light(x + w * 0.2, top - h * 0.08, w * 0.6, 1, '#ffd9a8', 0.55, 1)
    }
    ctx.fillStyle = 'rgba(255,255,255,.035)' // 왼쪽 모서리에 도시 불빛이 스친다
    ctx.fillRect(x, top, 1, deckY - top)
    if (kind === 'tower' && rnd() < 0.5) blinks.push({ x: x + w / 2, y: top - h * 0.08 - 2, phase: rnd() * 6 })

    const lit = 0.08 + rnd() * 0.32
    const gx = kind === 'apt' ? 5 : 4, gy = kind === 'apt' ? 5 : 4
    const floorLit = rnd() < 0.15 ? Math.floor(rnd() * (h / gy)) : -1
    for (let row = 0, wy = top + 3; wy < deckY - 3; wy += gy, row++)
      for (let wx = x + 2; wx < x + w - 2; wx += gx)
        if (rnd() < lit || row === floorLit) {
          const cool = rnd() < 0.25
          light(wx, wy, 1.6, 1.2, cool ? '#d7e6ff' : '#ffd49a', 0.45 + rnd() * 0.5)
        }
    x += w + 1 + rnd() * 3
  }

  // 다리: 상판, 교각, 가로등
  ctx.fillStyle = '#05080f'
  ctx.fillRect(0, deckY, W, 3)
  for (let x = W / 14; x < W; x += W / 7) ctx.fillRect(x - 2, deckY + 3, 4, y0 - deckY - 3)
  for (let x = 14; x < W; x += 46 * k) {
    ctx.fillStyle = '#05080f'
    ctx.fillRect(x, deckY - 5, 0.8, 5)
    const g = ctx.createRadialGradient(x, deckY - 5, 0, x, deckY - 5, 7)
    g.addColorStop(0, 'rgba(255,199,122,.45)')
    g.addColorStop(1, 'rgba(255,199,122,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - 7, deckY - 12, 14, 14)
    light(x - 0.6, deckY - 5.6, 1.6, 1.2, '#ffc77a', 1, 0)
    lampXs.push(x)
  }

  // ---------- 강물 반사: 도시를 뒤집어 어둡게, 불빛은 세로로 길게 늘린다 ----------
  const riverH = yB - y0
  const { c: refl, ctx: rx } = layer(W, riverH, dpr)
  // 건물 실루엣은 번져서 형태만 남기고(창문 점이 격자로 비치지 않게), 불빛은 세로 줄기로 길게 늘인다
  rx.save()
  rx.filter = 'blur(3px)'
  rx.translate(0, y0)
  rx.scale(1, -1)
  rx.globalAlpha = 0.34
  rx.drawImage(city, 0, 0, W, y0)
  rx.restore()
  // 도시 불빛은 은은하게, 다리 가로등은 수면 끝까지 닿는 긴 줄기로
  const streak = (src: HTMLCanvasElement, from: number, stretch: number, blur: number, alpha: number) => {
    rx.save()
    rx.filter = `blur(${blur}px)`
    rx.globalCompositeOperation = 'lighter'
    rx.translate(0, from * stretch)
    rx.scale(1, -stretch)
    rx.globalAlpha = alpha
    rx.drawImage(src, 0, 0, W, y0)
    rx.restore()
  }
  streak(lightsC, y0, 3.4, 2.4, 0.7)
  streak(lightsC, y0, 1.6, 1.2, 0.5)
  rx.save()
  rx.filter = 'blur(1.4px)'
  rx.globalCompositeOperation = 'lighter'
  for (const x of lampXs) {
    const len = riverH * (0.55 + rnd() * 0.45)
    const g = rx.createLinearGradient(0, 0, 0, len)
    g.addColorStop(0, 'rgba(255,196,120,.75)')
    g.addColorStop(0.35, 'rgba(255,180,100,.32)')
    g.addColorStop(1, 'rgba(255,170,90,0)')
    rx.fillStyle = g
    rx.fillRect(x - 1.3, 2, 2.6, len)
  }
  rx.restore()
  const fade = rx.createLinearGradient(0, 0, 0, riverH)
  fade.addColorStop(0, 'rgba(255,150,90,.08)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  rx.fillStyle = fade
  rx.fillRect(0, 0, W, riverH)

  // ---------- 물결 무늬: 가로로 이어 붙여 흘려보낸다 ----------
  const { c: current, ctx: cx } = layer(CURRENT_W, riverH, dpr)
  for (let i = 0; i < 520; i++) {
    const d = rnd() ** 0.7, y = d * riverH, len = (12 + rnd() * 90) * (0.4 + d)
    const x = rnd() * CURRENT_W
    cx.fillStyle = rnd() < 0.2 ? `rgba(255,200,140,${0.03 + rnd() * 0.06})` : `rgba(160,185,225,${0.025 + rnd() * 0.06})`
    for (const off of [0, -CURRENT_W]) cx.fillRect(x + off, y, len, d > 0.6 ? 1 : 0.6) // 이음매가 보이지 않게 두 번
  }

  // ---------- 둔치 ----------
  const bankH = H - yB
  const { c: bank, ctx: bx } = layer(W, bankH, dpr)
  const edge = Math.max(8, H * 0.014)
  bx.fillStyle = '#0a0e15'
  bx.fillRect(0, 0, W, edge)
  bx.fillStyle = 'rgba(255,214,170,.10)'
  bx.fillRect(0, 0, W, 1)
  const lawn = bx.createLinearGradient(0, edge, 0, bankH)
  lawn.addColorStop(0, '#0b100e')
  lawn.addColorStop(1, '#040605')
  bx.fillStyle = lawn
  bx.fillRect(0, edge, W, bankH - edge)
  for (let i = 0; i < W * bankH * 0.01; i++) { // 잔디 결
    bx.fillStyle = `rgba(120,150,110,${0.02 + rnd() * 0.04})`
    bx.fillRect(rnd() * W, edge + rnd() * (bankH - edge), 1, 2 + rnd() * 3)
  }

  const cars: Car[] = Array.from({ length: Math.round(W / 45) }, () => ({
    x: rnd() * W, speed: 26 + rnd() * 34, lane: rnd() < 0.5 ? 0 : 1,
  }))
  return { W, H, dpr, y0, yB, deckY, city, refl, current, bank, cars, blinks, lampX: W * (narrow ? 0.9 : 0.07) }
}

function frame(ctx: CanvasRenderingContext2D, w: World, t: number, dt: number) {
  const { W, H, dpr, y0, yB, deckY } = w
  const riverH = yB - y0
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(w.city, 0, 0, W, y0)

  // 항공 장애등
  for (const b of w.blinks) {
    const a = Math.max(0, Math.sin(t * 2.1 + b.phase)) ** 3
    ctx.fillStyle = `rgba(255,70,60,${0.25 + a * 0.75})`
    ctx.fillRect(b.x - 1, b.y - 1, 2, 2)
  }
  // 다리 위 차: 위 차선은 전조등(오른쪽으로), 아래 차선은 후미등(왼쪽으로)
  for (const c of w.cars) {
    c.x = (c.x + (c.lane ? -1 : 1) * c.speed * dt + W + 20) % (W + 20) // 0..W+20 를 돌고, 화면 밖 10px 에서 나타난다
    ctx.fillStyle = c.lane ? 'rgba(255,80,70,.9)' : 'rgba(255,244,220,.95)'
    ctx.fillRect(c.x - 10, deckY - (c.lane ? 0.5 : 2), 2, 1.2)
  }

  // 강물 바탕
  const water = ctx.createLinearGradient(0, y0, 0, yB)
  water.addColorStop(0, '#0b1222')
  water.addColorStop(1, '#03060c')
  ctx.fillStyle = water
  ctx.fillRect(0, y0, W, riverH)

  // 반사: 한 줄씩 옆으로 흔들어 물결을 만든다. 가까울수록 물결이 크다
  const row = 2
  for (let r = 0; r < riverH; r += row) {
    const d = r / riverH
    const amp = 0.4 + d * d * 8
    const dx = Math.sin(r * 0.12 / (0.22 + d) - t * 1.4) * amp + Math.sin(r * 0.027 + t * 0.55) * amp * 0.6
    ctx.globalAlpha = 1 - d * 0.6
    ctx.drawImage(w.refl, 0, r * dpr, W * dpr, row * dpr, dx, y0 + r, W, row)
  }

  // 흐름: 띠마다 다른 속도로 물결 무늬를 흘려보낸다 (가까울수록 빠르다)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'lighter'
  const bands = 10
  for (let i = 0; i < bands; i++) {
    const top = Math.floor((riverH * i) / bands), h = Math.ceil(riverH / bands)
    const d = (i + 0.5) / bands
    const off = (t * (5 + d * d * 46)) % CURRENT_W
    for (let x = off - CURRENT_W; x < W; x += CURRENT_W)
      ctx.drawImage(w.current, 0, top * dpr, CURRENT_W * dpr, h * dpr, x, y0 + top, CURRENT_W, h)
  }
  ctx.globalCompositeOperation = 'source-over'

  // 수평선을 부드럽게, 둔치 쪽 물은 어둡게
  const hz = ctx.createLinearGradient(0, y0, 0, y0 + 8)
  hz.addColorStop(0, 'rgba(29,35,56,.9)')
  hz.addColorStop(1, 'rgba(29,35,56,0)')
  ctx.fillStyle = hz
  ctx.fillRect(0, y0, W, 8)
  const shore = ctx.createLinearGradient(0, yB - riverH * 0.25, 0, yB)
  shore.addColorStop(0, 'rgba(2,4,8,0)')
  shore.addColorStop(1, 'rgba(2,4,8,.55)')
  ctx.fillStyle = shore
  ctx.fillRect(0, yB - riverH * 0.25, W, riverH * 0.25)

  ctx.drawImage(w.bank, 0, yB, W, H - yB)

  // 화면 밖 가로등이 잔디 위에 떨어뜨린 따뜻한 빛 웅덩이
  const pool = ctx.createRadialGradient(w.lampX, H * 1.02, 0, w.lampX, H * 1.02, W * 0.34)
  pool.addColorStop(0, 'rgba(255,190,120,.16)')
  pool.addColorStop(1, 'rgba(255,190,120,0)')
  ctx.fillStyle = pool
  ctx.fillRect(0, yB, W, H - yB)
}

export function Scene({ settle, children }: { settle: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let world: World | null = null
    let raf = 0, last = performance.now(), resizeTimer = 0

    const setup = () => {
      const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 1.75)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      world = build(W, H, dpr)
      frame(ctx, world, last / 1000, 0)
    }
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (world) frame(ctx, world, now / 1000, dt)
      raf = requestAnimationFrame(loop)
    }
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(setup, 150) }

    setup()
    if (!still) raf = requestAnimationFrame(loop)
    addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); clearTimeout(resizeTimer); removeEventListener('resize', onResize) }
  }, [])

  // Motion: 앉아 있는 동안 카메라가 아주 천천히 다가간다
  return (
    <motion.div
      className="scene"
      aria-hidden="true"
      animate={{ scale: settle ? 1.045 : 1 }}
      transition={{ duration: settle ? 40 : 1.6, ease: settle ? 'linear' : 'easeOut' }}
    >
      <canvas ref={ref} className="scene-canvas" />
      {children}
      <div className="vignette" />
    </motion.div>
  )
}
