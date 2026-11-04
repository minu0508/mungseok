import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { Palette } from '@/lib/sky'

/*
 * 한강을 캔버스에 그린다.
 * - 빌딩 배치는 한 번만 정하고, 낮 버전과 밤 버전을 따로 미리 그려 둔다.
 * - 하늘 색이 바뀌면(몇십 초에 한 번) 하늘·도시·반사·둔치를 한 장씩 합쳐 둔다.
 * - 매 프레임에는 강물(일렁이는 반사 + 흐르는 물결), 구름, 차, 항공등, 비·눈·번개만 그린다.
 */

type Win = { x: number; y: number; cool: boolean; a: number }
type Bld = { x: number; w: number; top: number; kind: 'tower' | 'apt' | 'low'; setback: boolean; crown: boolean; shade: number; wins: Win[] }
type Car = { x: number; speed: number; lane: 0 | 1 }
type Blink = { x: number; y: number; phase: number }
type Drop = { x: number; y: number; v: number; len: number }
type Flake = { x: number; y: number; v: number; r: number; ph: number }
type Ripple = { x: number; y: number; age: number; max: number }
type World = {
  W: number; H: number; dpr: number; y0: number; yB: number; deckY: number
  cityDay: HTMLCanvasElement; cityNight: HTMLCanvasElement; lights: HTMLCanvasElement; stars: HTMLCanvasElement
  cloudsDay: HTMLCanvasElement; cloudsNight: HTMLCanvasElement; current: HTMLCanvasElement; grass: HTMLCanvasElement
  lampXs: number[]; cars: Car[]; blinks: Blink[]
  mix: { city: HTMLCanvasElement; refl: HTMLCanvasElement; bank: HTMLCanvasElement } | null
  drops: Drop[]; flakes: Flake[]; ripples: Ripple[]; flash: number; nextFlash: number
}

const CURRENT_W = 640
const CLOUD_W = 1400

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

// ---------------------------------------------------------------- 미리 그리기
function build(W: number, H: number, dpr: number): World {
  const narrow = W < 640
  const y0 = Math.round(H * (narrow ? 0.5 : 0.56))   // 수평선(강 시작)
  const yB = Math.round(H * (narrow ? 0.76 : 0.8))   // 둔치 시작
  const deckY = y0 - Math.max(7, H * 0.013)
  const k = Math.min(1.4, Math.max(0.6, W / 1440))
  const rnd = seeded(20261104)

  // 먼 스카이라인
  const far: { x: number; w: number; h: number; wins: [number, number][] }[] = []
  for (let x = -10; x < W;) {
    const w = (10 + rnd() * 26) * k, h = (0.025 + rnd() * 0.06) * H
    const wins: [number, number][] = []
    for (let i = 0; i < w * h * 0.004; i++) wins.push([x + rnd() * w, deckY - h + rnd() * h])
    far.push({ x, w, h, wins })
    x += w + rnd() * 3
  }
  // 남산: 숲으로 덮인 둥근 산, 꼭대기에 N서울타워, 왼쪽 비탈에 철골 송신탑
  const nx = W * (narrow ? 0.74 : 0.7), peak = deckY - H * 0.085
  const T = H * 0.135                        // 산꼭대기에서 안테나 끝까지
  const hw = W * (narrow ? 0.2 : 0.16)       // 산의 반폭
  // 능선 높이 함수: 탑과 송신탑을 정확히 능선 위에 세우려고 곡선 대신 식으로 둔다
  const hillY = (x: number) => { const u = Math.min(1, Math.abs(x - nx) / hw); return deckY - (deckY - peak) * Math.cos(u * Math.PI / 2) ** 1.6 }
  const lx2 = nx - hw * 0.34                 // 송신탑 자리
  const latticeTop = hillY(lx2) - T * 0.5
  const tk = Math.max(1, k)                  // 탑은 너무 가늘어지지 않게
  // 나무 덩어리: 낮·밤 그림이 같도록 한 번만 정한다
  const crowns: { x: number; y: number; r: number; lit: boolean }[] = []
  { const r3 = seeded(55)
    for (let layer = 0; layer < 2; layer++)
      for (let x = nx - hw; x <= nx + hw; x += (2.6 + r3() * 2.2) * tk) {
        const r = (2.4 + r3() * 3.4) * tk
        // 산 끝자락(높이가 거의 0)에는 놓지 않는다: 다리 아래 수면까지 내려와 수풀처럼 튀어나온다
        if (deckY - hillY(x) < 6 * tk + layer * 5 * tk) continue
        crowns.push({ x, y: hillY(x) + r * 0.7 + layer * 5 * tk, r, lit: r3() < 0.5 })
      } }
  // 가까운 스카이라인: 가운데에 고층 빌딩, 양옆은 아파트 단지. 왼쪽 하늘은 글자 자리로 낮게 비운다
  const near: Bld[] = []
  const blinks: Blink[] = [{ x: nx, y: peak - T, phase: 0 }, { x: lx2, y: latticeTop, phase: 2.4 }]
  for (let x = -6; x < W;) {
    const pos = x / W
    const core = narrow ? pos > 0.15 && pos < 0.55 : pos > 0.36 && pos < 0.62
    const kind: Bld['kind'] = rnd() < (core ? 0.62 : 0.1) ? 'tower' : rnd() < (pos > 0.6 ? 0.7 : 0.45) ? 'apt' : 'low'
    const w = (kind === 'tower' ? 16 + rnd() * 22 : kind === 'apt' ? 34 + rnd() * 46 : 18 + rnd() * 30) * k
    const lowSide = !narrow && pos < 0.3 ? 0.65 : 1
    const h = (kind === 'tower' ? 0.1 + rnd() * 0.14 : kind === 'apt' ? 0.05 + rnd() * 0.05 : 0.025 + rnd() * 0.03) * H * lowSide
    if (Math.abs(x + w / 2 - nx) < W * 0.08 && kind === 'tower') { x += w; continue }
    const top = deckY - h
    const setback = kind === 'tower' && rnd() < 0.6
    const crown = setback && rnd() < 0.5
    if (kind === 'tower' && rnd() < 0.5) blinks.push({ x: x + w / 2, y: top - h * 0.08 - 2, phase: rnd() * 6 })
    const lit = 0.08 + rnd() * 0.32
    const gx = kind === 'apt' ? 5 : 4, gy = kind === 'apt' ? 5 : 4
    const floorLit = rnd() < 0.15 ? Math.floor(rnd() * (h / gy)) : -1
    const wins: Win[] = []
    for (let row = 0, wy = top + 3; wy < deckY - 3; wy += gy, row++)
      for (let wx = x + 2; wx < x + w - 2; wx += gx)
        if (rnd() < lit || row === floorLit) wins.push({ x: wx, y: wy, cool: rnd() < 0.25, a: 0.45 + rnd() * 0.5 })
    near.push({ x, w, top, kind, setback, crown, shade: rnd(), wins })
    x += w + 1 + rnd() * 3
  }
  const lampXs: number[] = []
  for (let x = 14; x < W; x += 46 * k) lampXs.push(x)

  const { c: lights, ctx: lx } = layer(W, y0, dpr) // 물에 비칠 밤 불빛 (창문은 약하게)
  const drawCity = (mode: 'day' | 'night') => {
    const { c, ctx } = layer(W, y0, dpr)
    const night = mode === 'night'
    const light = (x: number, y: number, w: number, h: number, color: string, a: number, refl = 0.3) => {
      ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1
      if (night && refl) { lx.globalAlpha = a * refl; lx.fillStyle = color; lx.fillRect(x, y, w, h); lx.globalAlpha = 1 }
    }
    // 먼 스카이라인: 낮에는 대기에 묻혀 푸르스름하다
    for (const f of far) {
      ctx.fillStyle = night ? '#141c30' : '#9ba8bd'
      ctx.fillRect(f.x, deckY - f.h, f.w, f.h + (y0 - deckY))
      if (night) for (const [wx, wy] of f.wins) light(wx, wy, 1, 1, '#ffd49a', 0.25)
    }
    // ---- 남산 (사진처럼: 숲 덮인 산, 철골 송신탑, 받침 건물 위 N서울타워) ----
    // 탑들은 땅(deckY)까지 그리고 산을 나중에 덮는다: 늘 산에서 솟아 보이고 공중에 뜨지 않는다
    const at = (f: number) => peak - T * f        // 산꼭대기에서 높이 비율 f 인 y
    const poly = (pts: [number, number][]) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill() }
    const RED = night ? '#5c2a2c' : '#d0473a', WHITE = night ? '#3a4458' : '#f1f2f4'

    // 철골 송신탑: 빨강·흰색 마디가 번갈아 칠해진 삼각 철골
    {
      const base = hillY(lx2) + 4 * tk, top = latticeTop, segs = 8
      ctx.lineWidth = 0.8
      for (let i = 0; i < segs; i++) {
        const y1 = base - ((base - top) * i) / segs, y2 = base - ((base - top) * (i + 1)) / segs
        const w1 = 3.4 * tk * (1 - (i / segs) * 0.8), w2 = 3.4 * tk * (1 - ((i + 1) / segs) * 0.8)
        ctx.strokeStyle = i % 2 ? WHITE : RED
        ctx.beginPath()
        ctx.moveTo(lx2 - w1, y1); ctx.lineTo(lx2 - w2, y2)        // 왼쪽 다리
        ctx.moveTo(lx2 + w1, y1); ctx.lineTo(lx2 + w2, y2)        // 오른쪽 다리
        ctx.moveTo(lx2 - w1, y1); ctx.lineTo(lx2 + w2, y2)        // 엇갈린 버팀대
        ctx.moveTo(lx2 + w1, y1); ctx.lineTo(lx2 - w2, y2)
        ctx.stroke()
      }
      ctx.fillStyle = RED
      ctx.fillRect(lx2 - 0.5, top - 4 * tk, 1, 4 * tk)
    }

    // N서울타워
    const shade = ctx.createLinearGradient(nx - 8 * tk, 0, nx + 8 * tk, 0) // 원통처럼 왼쪽은 밝고 오른쪽은 어둡다
    shade.addColorStop(0, night ? '#5a6681' : '#f3f5f7')
    shade.addColorStop(1, night ? '#273046' : '#b4bcc7')
    ctx.fillStyle = shade
    poly([[nx - 1.9 * tk, deckY], [nx - 1.5 * tk, at(0.47)], [nx + 1.5 * tk, at(0.47)], [nx + 1.9 * tk, deckY]])        // 기둥 (땅까지)
    ctx.fillRect(nx - 2.3 * tk, at(0.3), 4.6 * tk, 1.2)                                                                  // 기둥 마디
    ctx.fillRect(nx - 2.1 * tk, at(0.16), 4.2 * tk, 1.2)
    poly([[nx - 1.6 * tk, at(0.47)], [nx - 5.6 * tk, at(0.495)], [nx + 5.6 * tk, at(0.495)], [nx + 1.6 * tk, at(0.47)]]) // 전망대 받침
    ctx.beginPath(); ctx.roundRect(nx - 6 * tk, at(0.555), 12 * tk, at(0.495) - at(0.555), 1.5 * tk); ctx.fill()         // 아래 전망대
    ctx.beginPath(); ctx.roundRect(nx - 4.8 * tk, at(0.6), 9.6 * tk, at(0.555) - at(0.6), 1.2 * tk); ctx.fill()          // 위 전망대
    ctx.fillRect(nx - 3 * tk, at(0.62), 6 * tk, at(0.6) - at(0.62))                                                       // 지붕
    // 전망대 유리창 띠
    ctx.fillStyle = night ? '#1b2131' : '#6d7d90'
    ctx.fillRect(nx - 6 * tk, at(0.535), 12 * tk, (at(0.515) - at(0.535)))
    ctx.fillRect(nx - 4.8 * tk, at(0.585), 9.6 * tk, (at(0.57) - at(0.585)))
    ctx.fillStyle = shade
    poly([[nx - 1.3 * tk, at(0.62)], [nx - 1.1 * tk, at(0.69)], [nx + 1.1 * tk, at(0.69)], [nx + 1.3 * tk, at(0.62)]])  // 흰 목
    // 안테나: 빨강·흰색 띠, 중간에 작은 고리 둘
    const bands = 7
    for (let i = 0; i < bands; i++) {
      const y1 = at(0.69 + (0.31 * i) / bands), y2 = at(0.69 + (0.31 * (i + 1)) / bands)
      const wd = (1.6 - (i / bands) * 0.9) * tk
      ctx.fillStyle = i % 2 ? WHITE : RED
      ctx.fillRect(nx - wd / 2, y2, wd, y1 - y2)
    }
    ctx.fillStyle = RED
    ctx.fillRect(nx - 1.7 * tk, at(0.75), 3.4 * tk, 1.3)
    ctx.fillRect(nx - 1.3 * tk, at(0.85), 2.6 * tk, 1.1)
    if (night) {
      const g = ctx.createRadialGradient(nx, at(0.35), 0, nx, at(0.35), T * 0.45) // 탑을 비추는 조명
      g.addColorStop(0, 'rgba(200,215,255,.14)')
      g.addColorStop(1, 'rgba(200,215,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(nx - T * 0.45, at(0.8), T * 0.9, T * 0.8)
      for (let i = -5; i <= 5; i++) light(nx + i * 1.05 * tk - 0.35, at(0.53), 0.7, 1.3, '#fff1d6', 0.95, 0.6) // 전망대 창 불빛
      for (let i = -4; i <= 4; i++) light(nx + i * 1.0 * tk - 0.35, at(0.58), 0.7, 1, '#ffe6c4', 0.8, 0.4)
    }

    // 산: 매끈한 언덕 위에 나무 덩어리를 겹쳐 숲처럼
    ctx.fillStyle = night ? '#0f1726' : '#47663f'
    ctx.beginPath()
    ctx.moveTo(nx - hw, deckY + 1)
    for (let x = nx - hw; x <= nx + hw; x += 2) ctx.lineTo(x, hillY(x) + 2 * tk)
    ctx.lineTo(nx + hw, deckY + 1)
    ctx.fill()
    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, W, deckY); ctx.clip() // 숲은 다리 위쪽에만
    for (const c of crowns) {
      ctx.fillStyle = night ? (c.lit ? '#141d2f' : '#101828') : (c.lit ? '#5e8452' : '#4c6e44')
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill()
      if (!night && c.lit) { // 해 드는 쪽 잎
        ctx.fillStyle = 'rgba(170,205,140,.35)'
        ctx.beginPath(); ctx.arc(c.x - c.r * 0.3, c.y - c.r * 0.35, c.r * 0.45, 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.restore()
    // 탑 아래 받침 건물 (숲 위로 살짝 보인다)
    const bw = 20 * tk, bh = T * 0.06
    ctx.fillStyle = night ? '#2a3346' : '#e9edf1'
    ctx.fillRect(nx - bw / 2, peak - bh + 2 * tk, bw, bh)
    ctx.fillStyle = night ? '#1a2132' : '#7d8ea2'
    ctx.fillRect(nx - bw / 2, peak - bh * 0.55 + 2 * tk, bw, 1.4)
    if (night) for (let i = 0; i < 8; i++) light(nx - bw / 2 + 1.5 + i * (bw - 3) / 7, peak - bh * 0.55 + 2 * tk, 1, 1.4, '#ffd49a', 0.85, 0.5)
    // 가까운 빌딩
    const DAY = ['#5a6880', '#66748a', '#4f5d74', '#728098', '#5f6b7d', '#6b6f78']
    for (const b of near) {
      const h = deckY - b.top
      ctx.fillStyle = night ? '#0a0f1c' : DAY[Math.floor(b.shade * DAY.length)]
      ctx.fillRect(b.x, b.top, b.w, h + 1)
      if (b.setback) ctx.fillRect(b.x + b.w * 0.2, b.top - h * 0.08, b.w * 0.6, h * 0.08)
      if (night) {
        if (b.crown) light(b.x + b.w * 0.2, b.top - h * 0.08, b.w * 0.6, 1, '#ffd9a8', 0.55, 1)
        ctx.fillStyle = 'rgba(255,255,255,.035)'
        ctx.fillRect(b.x, b.top, 1, h)
        for (const wi of b.wins) light(wi.x, wi.y, 1.6, 1.2, wi.cool ? '#d7e6ff' : '#ffd49a', wi.a)
      } else {
        // 낮: 햇빛 받는 면과 그늘진 면, 유리창 줄
        ctx.fillStyle = 'rgba(255,255,255,.14)'
        ctx.fillRect(b.x, b.top, Math.max(1, b.w * 0.18), h)
        ctx.fillStyle = 'rgba(0,10,30,.12)'
        ctx.fillRect(b.x + b.w * 0.82, b.top, b.w * 0.18, h)
        const gy = b.kind === 'apt' ? 5 : 4
        for (let wy = b.top + 3; wy < deckY - 3; wy += gy) {
          ctx.fillStyle = b.kind === 'tower' ? 'rgba(190,215,240,.18)' : 'rgba(20,30,50,.16)'
          ctx.fillRect(b.x + 2, wy, b.w - 4, 1.2)
        }
      }
    }
    // 다리: 상판, 교각, 가로등
    ctx.fillStyle = night ? '#05080f' : '#39414d'
    ctx.fillRect(0, deckY, W, 3)
    for (let x = W / 14; x < W; x += W / 7) ctx.fillRect(x - 2, deckY + 3, 4, y0 - deckY - 3)
    for (const x of lampXs) {
      ctx.fillStyle = night ? '#05080f' : '#39414d'
      ctx.fillRect(x, deckY - 5, 0.8, 5)
      if (!night) continue
      const g = ctx.createRadialGradient(x, deckY - 5, 0, x, deckY - 5, 7)
      g.addColorStop(0, 'rgba(255,199,122,.45)')
      g.addColorStop(1, 'rgba(255,199,122,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - 7, deckY - 12, 14, 14)
      light(x - 0.6, deckY - 5.6, 1.6, 1.2, '#ffc77a', 1, 0)
    }
    return c
  }
  const cityNight = drawCity('night')
  const cityDay = drawCity('day')

  // 별
  const { c: stars, ctx: sx } = layer(W, y0, dpr)
  for (let i = 0; i < 170; i++) {
    const y = rnd() ** 1.6 * y0 * 0.65
    sx.fillStyle = `rgba(230,235,255,${(0.15 + rnd() * 0.55) * (1 - y / (y0 * 0.7))})`
    const s = rnd() < 0.1 ? 1.4 : 0.8
    sx.fillRect(rnd() * W, y, s, s)
  }

  // 구름: 부드러운 덩어리를 가로로 이어 붙일 수 있게 그린다
  const clouds = (fill: (a: number) => string) => {
    const { c, ctx } = layer(CLOUD_W, y0 * 0.75, dpr)
    const r2 = seeded(77)
    const ch = y0 * 0.75
    for (let i = 0; i < 46; i++) {
      const cx = r2() * CLOUD_W, cy = (0.15 + r2() * 0.75) * ch, rx = (60 + r2() * 160) * k, ry = rx * (0.22 + r2() * 0.18)
      const alpha = 0.55 + r2() * 0.25 // 경계 양쪽 복사본이 같은 진하기여야 이음매가 안 보인다
      for (const off of [0, -CLOUD_W, CLOUD_W]) {
        const g = ctx.createRadialGradient(cx + off, cy, 0, cx + off, cy, rx)
        g.addColorStop(0, fill(alpha))
        g.addColorStop(1, fill(0))
        ctx.save()
        ctx.translate(cx + off, cy)
        ctx.scale(1, ry / rx)
        ctx.translate(-(cx + off), -cy)
        ctx.fillStyle = g
        ctx.fillRect(cx + off - rx, cy - rx, rx * 2, rx * 2)
        ctx.restore()
      }
    }
    // 위아래 끝은 투명하게: 잘린 구름 덩어리가 띠 모양의 직선 테두리(네모칸)로 보이지 않게
    const mask = ctx.createLinearGradient(0, 0, 0, ch)
    mask.addColorStop(0, 'rgba(0,0,0,0)')
    mask.addColorStop(0.22, 'rgba(0,0,0,1)')
    mask.addColorStop(0.72, 'rgba(0,0,0,1)')
    mask.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalCompositeOperation = 'destination-in'
    ctx.fillStyle = mask
    ctx.fillRect(0, 0, CLOUD_W, ch)
    ctx.globalCompositeOperation = 'source-over'
    return c
  }
  const cloudsDay = clouds(a => `rgba(236,240,246,${a})`)
  const cloudsNight = clouds(a => `rgba(38,44,62,${a})`)

  // 물결 무늬
  const riverH = yB - y0
  const { c: current, ctx: cx } = layer(CURRENT_W, riverH, dpr)
  for (let i = 0; i < 520; i++) {
    const d = rnd() ** 0.7, y = d * riverH, len = (12 + rnd() * 90) * (0.4 + d)
    const x = rnd() * CURRENT_W
    cx.fillStyle = rnd() < 0.2 ? `rgba(255,200,140,${0.03 + rnd() * 0.06})` : `rgba(160,185,225,${0.025 + rnd() * 0.06})`
    for (const off of [0, -CURRENT_W]) cx.fillRect(x + off, y, len, d > 0.6 ? 1 : 0.6)
  }
  // 잔디 결
  const bankH = H - yB
  const { c: grass, ctx: gx } = layer(W, bankH, dpr)
  for (let i = 0; i < W * bankH * 0.012; i++) {
    gx.fillStyle = `rgba(150,180,130,${0.03 + rnd() * 0.06})`
    gx.fillRect(rnd() * W, rnd() * bankH, 1, 2 + rnd() * 3)
  }

  const cars: Car[] = Array.from({ length: Math.round(W / 45) }, () => ({ x: rnd() * W, speed: 26 + rnd() * 34, lane: rnd() < 0.5 ? 0 : 1 }))
  return {
    W, H, dpr, y0, yB, deckY, cityDay, cityNight, lights, stars, cloudsDay, cloudsNight, current, grass, lampXs, cars, blinks,
    mix: null, drops: [], flakes: [], ripples: [], flash: 0, nextFlash: 4,
  }
}

// ---------------------------------------------------------------- 하늘 색이 바뀔 때 합치기
function compose(w: World, p: Palette) {
  const { W, H, dpr, y0, yB } = w
  const n = p.night, riverH = yB - y0, bankH = H - yB

  const { c: city, ctx } = layer(W, y0, dpr)
  const sky = ctx.createLinearGradient(0, 0, 0, y0)
  sky.addColorStop(0, p.top)
  sky.addColorStop(0.55, p.mid)
  sky.addColorStop(1, p.horizon)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, y0)
  const gx = p.sun ? p.sun.x * W : W * 0.55
  const glow = ctx.createRadialGradient(gx, y0, 0, gx, y0, Math.max(W, H) * 0.65)
  glow.addColorStop(0, p.glow)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, y0)
  ctx.globalAlpha = p.stars
  ctx.drawImage(w.stars, 0, 0, W, y0)
  ctx.globalAlpha = 1

  // 해와 달 (구름이 많으면 흐려진다)
  const veil = 1 - p.cloud * 0.85
  if (p.sun && n < 0.85 && p.cloud < 0.6) { // 구름이 두꺼우면 해가 보이지 않는다
    const sx = p.sun.x * W, sy = y0 - (0.06 + p.sun.alt * 0.62) * y0, low = 1 - p.sun.alt
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 140)
    g.addColorStop(0, `rgba(255,${Math.round(236 - low * 70)},${Math.round(200 - low * 110)},${0.55 * veil})`)
    g.addColorStop(1, 'rgba(255,220,180,0)')
    ctx.fillStyle = g
    ctx.fillRect(sx - 140, sy - 140, 280, 280)
    ctx.globalAlpha = veil
    ctx.fillStyle = low > 0.75 ? '#ffc58a' : '#fff6e2'
    ctx.beginPath(); ctx.arc(sx, sy, 11, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }
  if (n > 0.5 && p.cloud < 0.6) {
    const mx = W * (W < 640 ? 0.78 : 0.64), my = y0 * 0.16, a = (n - 0.5) * 2 * veil // 오른쪽 카드에 가리지 않는 자리
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, 70)
    g.addColorStop(0, `rgba(220,228,255,${0.22 * a})`)
    g.addColorStop(1, 'rgba(220,228,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(mx - 70, my - 70, 140, 140)
    ctx.globalAlpha = a
    ctx.fillStyle = '#f1ecdc'
    ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = p.top // 초승달 그림자
    ctx.beginPath(); ctx.arc(mx + 3.5, my - 2, 7.5, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }

  // 도시: 낮 그림 위에 밤 그림을 밤의 세기만큼 겹친다
  ctx.drawImage(w.cityDay, 0, 0, W, y0)
  ctx.globalAlpha = n
  ctx.drawImage(w.cityNight, 0, 0, W, y0)
  ctx.globalAlpha = 1
  // 대기: 수평선 쪽이 하늘색으로 뿌옇다. 안개·비 오는 날은 더 짙다
  const hazeA = { clear: 0.18, clouds: 0.22, overcast: 0.32, fog: 0.75, rain: 0.42, snow: 0.45, storm: 0.38 }[p.weather] * (1 - n * 0.5)
  const haze = ctx.createLinearGradient(0, y0 * 0.45, 0, y0)
  haze.addColorStop(0, 'rgba(0,0,0,0)')
  haze.addColorStop(1, p.horizon)
  ctx.globalAlpha = hazeA
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, W, y0)
  ctx.globalAlpha = 1

  // 반사
  const { c: refl, ctx: rx } = layer(W, riverH, dpr)
  rx.save()
  rx.filter = 'blur(3px)'
  rx.translate(0, y0)
  rx.scale(1, -1)
  rx.globalAlpha = 0.34 + (1 - n) * 0.26
  rx.drawImage(city, 0, 0, W, y0)
  rx.restore()
  if (n > 0.05) {
    for (const [stretch, blur, a] of [[3.4, 2.4, 0.7], [1.6, 1.2, 0.5]] as const) {
      rx.save()
      rx.filter = `blur(${blur}px)`
      rx.globalCompositeOperation = 'lighter'
      rx.translate(0, y0 * stretch)
      rx.scale(1, -stretch)
      rx.globalAlpha = a * n
      rx.drawImage(w.lights, 0, 0, W, y0)
      rx.restore()
    }
    rx.save()
    rx.filter = 'blur(1.4px)'
    rx.globalCompositeOperation = 'lighter'
    const r2 = seeded(31)
    for (const x of w.lampXs) {
      const len = riverH * (0.55 + r2() * 0.45)
      const g = rx.createLinearGradient(0, 0, 0, len)
      g.addColorStop(0, `rgba(255,196,120,${0.75 * n})`)
      g.addColorStop(0.35, `rgba(255,180,100,${0.32 * n})`)
      g.addColorStop(1, 'rgba(255,170,90,0)')
      rx.fillStyle = g
      rx.fillRect(x - 1.3, 2, 2.6, len)
    }
    rx.restore()
  }
  if (p.sun && n < 0.8) { // 해 아래로 반짝이는 물빛 길
    const sx = p.sun.x * W, low = 1 - p.sun.alt, a = (1 - n) * (1 - p.cloud * 0.8)
    const g = rx.createLinearGradient(0, 0, 0, riverH)
    g.addColorStop(0, `rgba(255,${Math.round(230 - low * 60)},${Math.round(190 - low * 90)},${0.5 * a})`)
    g.addColorStop(1, 'rgba(255,220,170,0)')
    rx.save()
    rx.filter = 'blur(6px)'
    rx.globalCompositeOperation = 'lighter'
    rx.fillStyle = g
    rx.beginPath()
    rx.moveTo(sx - 8, 0); rx.lineTo(sx + 8, 0); rx.lineTo(sx + 70, riverH); rx.lineTo(sx - 70, riverH)
    rx.fill()
    rx.restore()
  }

  // 둔치
  const { c: bank, ctx: bx } = layer(W, bankH, dpr)
  const edge = Math.max(8, H * 0.014)
  bx.fillStyle = p.weather === 'snow' ? (n > 0.5 ? '#2c3340' : '#b9c0c8') : n > 0.5 ? '#0a0e15' : '#59605f'
  bx.fillRect(0, 0, W, edge)
  bx.fillStyle = `rgba(255,214,170,${0.04 + 0.06 * n})`
  bx.fillRect(0, 0, W, 1)
  const lawn = bx.createLinearGradient(0, edge, 0, bankH)
  lawn.addColorStop(0, p.bank[0])
  lawn.addColorStop(1, p.bank[1])
  bx.fillStyle = lawn
  bx.fillRect(0, edge, W, bankH - edge)
  bx.globalAlpha = p.weather === 'snow' ? 0.15 : 0.35 + (1 - n) * 0.5
  bx.drawImage(w.grass, 0, 0, W, bankH)
  bx.globalAlpha = 1
  if (n > 0.2) { // 화면 밖 가로등이 잔디 위에 떨어뜨린 빛
    const lampX = W * (W < 640 ? 0.9 : 0.07)
    const pool = bx.createRadialGradient(lampX, bankH * 1.1, 0, lampX, bankH * 1.1, W * 0.34)
    pool.addColorStop(0, `rgba(255,190,120,${0.16 * n})`)
    pool.addColorStop(1, 'rgba(255,190,120,0)')
    bx.fillStyle = pool
    bx.fillRect(0, 0, W, bankH)
  }

  w.mix = { city, refl, bank }
}

// ---------------------------------------------------------------- 매 프레임
const RAIN = { rain: 1, storm: 1.4 } as Record<string, number>

/**
 * 가로로 이어지는 무늬(구름·안개·물결)를 흘려 그린다.
 * 화면 배율을 거치면 이음매가 소수점 픽셀에 걸려 틈(어두운 선)이나 겹침(밝은 선)이 생기므로,
 * 실제 화면 픽셀 단위로 정수 위치에, 원래 너비 그대로 붙인다.
 * srcY·srcH 는 무늬 그림의 픽셀, dstY·dstH 와 offset 은 CSS 픽셀.
 */
function tileX(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, srcY: number, srcH: number, dstY: number, dstH: number, offset: number, w: World) {
  const tw = img.width, dpr = w.dpr
  const off = Math.floor((offset * dpr) % tw)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  for (let x = -off; x < w.W * dpr; x += tw) ctx.drawImage(img, 0, srcY, tw, srcH, x, Math.round(dstY * dpr), tw, Math.round(dstH * dpr))
  ctx.restore()
}

function frame(ctx: CanvasRenderingContext2D, w: World, p: Palette, t: number, dt: number) {
  const { W, H, dpr, y0, yB, deckY } = w
  if (!w.mix) return
  const riverH = yB - y0, n = p.night
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(w.mix.city, 0, 0, W, y0)

  // 구름: 바람 따라 천천히 흐른다
  if (p.cloud > 0.1) {
    const off = (t * 5) % CLOUD_W, ch = y0 * 0.75
    for (const [img, a] of [[w.cloudsDay, (1 - n)], [w.cloudsNight, n]] as const) {
      if (a < 0.02) continue
      ctx.globalAlpha = a * Math.min(1, p.cloud * 1.1)
      tileX(ctx, img, 0, img.height, 0, ch, off, w)
    }
    ctx.globalAlpha = 1
  }
  // 항공 장애등
  if (n > 0.3) for (const b of w.blinks) {
    const a = Math.max(0, Math.sin(t * 2.1 + b.phase)) ** 3
    ctx.fillStyle = `rgba(255,70,60,${(0.25 + a * 0.75) * n})`
    ctx.fillRect(b.x - 1, b.y - 1, 2, 2)
  }
  // 다리 위 차
  for (const c of w.cars) {
    c.x = (c.x + (c.lane ? -1 : 1) * c.speed * dt + W + 20) % (W + 20)
    ctx.fillStyle = n > 0.4 ? (c.lane ? 'rgba(255,80,70,.9)' : 'rgba(255,244,220,.95)') : (c.lane ? '#d9dde3' : '#2d333d')
    ctx.fillRect(c.x - 10, deckY - (c.lane ? 0.5 : 2), n > 0.4 ? 2 : 3, 1.3)
  }

  // 강물 바탕 + 반사 (한 줄씩 옆으로 흔든다. 가까울수록 물결이 크다)
  const water = ctx.createLinearGradient(0, y0, 0, yB)
  water.addColorStop(0, p.water[0])
  water.addColorStop(1, p.water[1])
  ctx.fillStyle = water
  ctx.fillRect(0, y0, W, riverH)
  const storm = RAIN[p.weather] ?? 0
  const row = 2
  for (let r = 0; r < riverH; r += row) {
    const d = r / riverH
    const amp = (0.4 + d * d * 8) * (1 + storm * 0.5)
    const dx = Math.sin(r * 0.12 / (0.22 + d) - t * 1.4) * amp + Math.sin(r * 0.027 + t * 0.55) * amp * 0.6
    ctx.globalAlpha = 1 - d * 0.6
    // 양옆을 조금 넉넉히 그려, 줄을 옆으로 흔들어도 화면 끝에 물 바탕이 드러나지 않게 한다
    ctx.drawImage(w.mix.refl, 0, r * dpr, W * dpr, row * dpr, dx - 16, y0 + r, W + 32, row)
  }
  // 흐름: 띠마다 다른 속도로 (가까울수록 빠르다)
  ctx.globalAlpha = 0.8 + (1 - n) * 0.6
  ctx.globalCompositeOperation = 'lighter'
  const bands = 10
  for (let i = 0; i < bands; i++) {
    const top = Math.floor((riverH * i) / bands), h = Math.ceil(riverH / bands)
    const d = (i + 0.5) / bands
    const off = (t * (5 + d * d * 46)) % CURRENT_W
    tileX(ctx, w.current, Math.round(top * dpr), Math.round(h * dpr), y0 + top, h, CURRENT_W - off, w)
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  const hz = ctx.createLinearGradient(0, y0, 0, y0 + 8)
  hz.addColorStop(0, p.horizon)
  hz.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = 0.6
  ctx.fillStyle = hz
  ctx.fillRect(0, y0, W, 8)
  ctx.globalAlpha = 1
  const shore = ctx.createLinearGradient(0, yB - riverH * 0.25, 0, yB)
  shore.addColorStop(0, 'rgba(2,4,8,0)')
  shore.addColorStop(1, `rgba(2,4,8,${0.25 + n * 0.3})`)
  ctx.fillStyle = shore
  ctx.fillRect(0, yB - riverH * 0.25, W, riverH * 0.25)

  // 빗방울이 강물에 떨어져 퍼지는 동그라미
  if (storm) {
    const spawn = W * 0.04 * storm * dt * 10
    for (let i = 0; i < spawn; i++) if (Math.random() < 0.1) {
      const d = Math.random()
      w.ripples.push({ x: Math.random() * W, y: y0 + 4 + d * (riverH - 6), age: 0, max: 3 + d * 9 })
    }
    ctx.lineWidth = 0.8
    w.ripples = w.ripples.filter(r => (r.age += dt) < 0.9)
    for (const r of w.ripples) {
      const k2 = r.age / 0.9
      ctx.strokeStyle = `rgba(200,215,235,${0.35 * (1 - k2)})`
      ctx.beginPath()
      ctx.ellipse(r.x, r.y, r.max * k2 + 0.5, (r.max * k2 + 0.5) * 0.28, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  ctx.drawImage(w.mix.bank, 0, yB, W, H - yB)

  // 비·눈
  if (storm) {
    const want = Math.round(W * 0.22 * storm)
    while (w.drops.length < want) w.drops.push({ x: Math.random() * W * 1.2, y: Math.random() * H, v: 700 + Math.random() * 400, len: 10 + Math.random() * 14 })
    ctx.strokeStyle = n > 0.5 ? 'rgba(170,185,210,.32)' : 'rgba(220,230,245,.38)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const d of w.drops) {
      d.y += d.v * dt; d.x -= d.v * dt * 0.12
      if (d.y > H) { d.y = -d.len; d.x = Math.random() * W * 1.2 }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len * 0.12, d.y - d.len)
    }
    ctx.stroke()
  } else w.drops.length = 0
  if (p.weather === 'snow') {
    const want = Math.round(W * 0.14)
    while (w.flakes.length < want) w.flakes.push({ x: Math.random() * W, y: Math.random() * H, v: 22 + Math.random() * 40, r: 0.8 + Math.random() * 1.8, ph: Math.random() * 6 })
    ctx.fillStyle = 'rgba(245,248,255,.85)'
    for (const f of w.flakes) {
      f.y += f.v * dt
      f.x += Math.sin(t * 0.8 + f.ph) * 12 * dt
      if (f.y > H) { f.y = -4; f.x = Math.random() * W }
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill()
    }
  } else w.flakes.length = 0
  // 번개: 몇 초에 한 번 하늘이 번쩍인다
  if (p.weather === 'storm') {
    w.nextFlash -= dt
    if (w.nextFlash < 0) { w.flash = 1; w.nextFlash = 5 + Math.random() * 10 }
    if (w.flash > 0) {
      ctx.fillStyle = `rgba(215,225,255,${w.flash * 0.35})`
      ctx.fillRect(0, 0, W, H)
      w.flash = Math.max(0, w.flash - dt * 3.2)
    }
  }
  // 안개: 수평선 위로 옅은 띠가 흘러간다
  if (p.weather === 'fog') {
    const off = (t * 9) % CLOUD_W
    ctx.globalAlpha = 0.5
    const fog = n > 0.5 ? w.cloudsNight : w.cloudsDay
    tileX(ctx, fog, 0, fog.height, y0 - riverH * 0.6, riverH * 1.1, off, w)
    ctx.globalAlpha = 1
  }
}

// ---------------------------------------------------------------- 컴포넌트
export function Scene({ pal, sitting, children }: { pal: Palette; sitting: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const palRef = useRef(pal)
  const sittingRef = useRef(sitting)
  const redraw = useRef<() => void>(() => {})
  sittingRef.current = sitting

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let world: World | null = null
    let raf = 0, last = performance.now(), drawn = 0, resizeTimer = 0

    const setup = () => {
      const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 1.75)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      world = build(W, H, dpr)
      compose(world, palRef.current)
      frame(ctx, world, palRef.current, last / 1000, 0)
    }
    redraw.current = () => {
      if (!world) return
      compose(world, palRef.current)
      if (still) frame(ctx, world, palRef.current, last / 1000, 0)
    }
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      // 앉아 있는 동안은 초당 30번만 그려 배터리를 아낀다 (느린 화면이라 차이가 안 보인다)
      if (sittingRef.current && now - drawn < 32) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      drawn = now
      if (world) frame(ctx, world, palRef.current, now / 1000, dt)
    }
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(setup, 150) }

    setup()
    if (!still) raf = requestAnimationFrame(loop)
    addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); clearTimeout(resizeTimer); removeEventListener('resize', onResize) }
  }, [])

  // 하늘 색이 바뀌면 다시 합친다
  useEffect(() => { palRef.current = pal; redraw.current() }, [pal])

  // Motion: 앉아 있는 동안 카메라가 아주 천천히 다가간다
  return (
    <motion.div
      className="scene"
      aria-hidden="true"
      animate={{ scale: sitting ? 1.045 : 1 }}
      transition={{ duration: sitting ? 40 : 1.6, ease: sitting ? 'linear' : 'easeOut' }}
    >
      <canvas ref={ref} className="scene-canvas" />
      {children}
      <div className="vignette" />
    </motion.div>
  )
}
