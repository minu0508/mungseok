import type { Palette } from './sky'
import { drawClouds, seeded } from './landscape'
import { createRiver, type River } from './river'

export const SCENERY = {
  day: '/scenery/hangang-day.webp',
  sunset: '/scenery/hangang-sunset.webp',
  night: '/scenery/hangang-night.webp',
  land: '/scenery/hangang-land.webp',
} as const
export type Scenery = Partial<Record<keyof typeof SCENERY, HTMLImageElement>>
type Drop = { x: number; y: number; speed: number; length: number }
type Flake = { x: number; y: number; speed: number; r: number; phase: number }
type Ripple = { x: number; y: number; age: number; radius: number }
export type PhotoWorld = {
  W: number; H: number; dpr: number; y0: number; yB: number
  base: HTMLCanvasElement; sky: HTMLCanvasElement; mask: HTMLCanvasElement; environment: HTMLCanvasElement
  cloudsDay: HTMLCanvasElement; cloudsNight: HTMLCanvasElement; river: River; lastReflection: number
  rainAmount: number; snowAmount: number
  towerX: number; towerY: number
  cars: { x: number; speed: number; direction: number }[]
  drops: Drop[]; flakes: Flake[]; ripples: Ripple[]; flash: number; nextFlash: number
}
const CLOUD_WIDTH = 1400
const WATER_TOP = .575
const LAWN_TOP = .805

function layer(W: number, H: number, dpr: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(W * dpr))
  canvas.height = Math.max(1, Math.round(H * dpr))
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  return { canvas, ctx }
}

export function buildPhotoWorld(W: number, H: number, dpr: number): PhotoWorld {
  const narrow = W <= 640, y0 = Math.round(H * (narrow ? .5 : .56)), yB = Math.round(H * (narrow ? .76 : .8))
  const base = layer(W, H, dpr)
  const sky = layer(W, y0, dpr), mask = layer(W, H, dpr), environment = layer(W, y0, 1)
  const day = layer(CLOUD_WIDTH, y0 * .8, dpr), night = layer(CLOUD_WIDTH, y0 * .8, dpr)
  drawClouds(day.ctx, night.ctx, CLOUD_WIDTH, y0 * .8)
  const rnd = seeded(92)
  return {
    W, H, dpr, y0, yB, base: base.canvas, sky: sky.canvas, mask: mask.canvas, environment: environment.canvas,
    cloudsDay: day.canvas, cloudsNight: night.canvas, river: createRiver(W, yB - y0, dpr), lastReflection: -Infinity,
    rainAmount: -1, snowAmount: -1,
    towerX: W * .78, towerY: y0 * .67,
    cars: Array.from({ length: Math.round(W / 100) }, () => ({ x: rnd() * W, speed: 5 + rnd() * 8, direction: rnd() < .5 ? -1 : 1 })),
    drops: [], flakes: [], ripples: [], flash: 0, nextFlash: 5,
  }
}

/** Crop horizontally around Namsan on phones; keep the sky/water/lawn boundaries stable. */
function paintPlate(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: PhotoWorld) {
  const sw = img.naturalWidth, sh = img.naturalHeight
  const cropW = Math.min(sw, w.W * (sh * WATER_TOP) / w.y0)
  const cropX = Math.max(0, Math.min(sw - cropW, sw * .78 - cropW * .74))
  const bands = [[0, WATER_TOP, 0, w.y0], [WATER_TOP, LAWN_TOP, w.y0, w.yB], [LAWN_TOP, 1, w.yB, w.H]]
  for (const [from, to, top, bottom] of bands) {
    ctx.drawImage(img, cropX, sh * from, cropW, sh * (to - from), 0, top, w.W, bottom - top)
  }
  w.towerX = (sw * .78 - cropX) / cropW * w.W
  w.towerY = .384 / WATER_TOP * w.y0
}

/** The sky is generated from Seoul time; photographs contribute only masked land. */
export function composePhoto(w: PhotoWorld, p: Palette, images: Scenery) {
  const ctx = w.base.getContext('2d')!, { W, H, y0, yB, dpr } = w
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'
  ctx.clearRect(0, 0, W, H)
  w.lastReflection = -Infinity
  const sx = w.sky.getContext('2d')!
  sx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const sky = sx.createLinearGradient(0, 0, 0, y0)
  sky.addColorStop(0, p.top); sky.addColorStop(.55, p.mid); sky.addColorStop(1, p.horizon)
  sx.fillStyle = sky; sx.fillRect(0, 0, W, y0)
  const glowX = p.sun ? (1 - p.sun.x) * W : W * .3
  const glow = sx.createRadialGradient(glowX, y0, 0, glowX, y0, Math.max(W, H) * .65)
  glow.addColorStop(0, p.glow); glow.addColorStop(1, 'rgba(0,0,0,0)')
  sx.fillStyle = glow; sx.fillRect(0, 0, W, y0)
  const rnd = seeded(615)
  for (let i = 0; i < 100; i++) {
    sx.fillStyle = `rgba(226,238,255,${p.stars * (.1 + rnd() * .4)})`
    sx.fillRect(rnd() * W, rnd() * y0 * .66, .5 + rnd() * .6, .7)
  }
  const sun = p.sun, veil = 1 - p.cloud
  if (sun && p.night < .85 && p.cloud < .8) {
    const x = (1 - sun.x) * W, y = y0 - (.06 + sun.alt * .62) * y0
    const bloom = sx.createRadialGradient(x, y, 2, x, y, 110)
    bloom.addColorStop(0, `rgba(255,227,175,${veil * .55})`); bloom.addColorStop(1, 'rgba(255,211,146,0)')
    sx.fillStyle = bloom; sx.fillRect(x - 110, y - 110, 220, 220)
    sx.globalAlpha = veil; sx.fillStyle = sun.alt < .15 ? '#ffd1a0' : '#fff6e1'
    sx.beginPath(); sx.arc(x, y, 7, 0, Math.PI * 2); sx.fill(); sx.globalAlpha = 1
  }
  if (p.night > .5 && p.cloud < .7) {
    const x = W * .64, y = y0 * .19, a = (p.night - .5) * 2 * veil
    const bloom = sx.createRadialGradient(x, y, 0, x, y, 60)
    bloom.addColorStop(0, `rgba(217,232,251,${a * .16})`); bloom.addColorStop(1, 'rgba(217,232,251,0)')
    sx.fillStyle = bloom; sx.fillRect(x - 60, y - 60, 120, 120)
    sx.fillStyle = `rgba(240,239,220,${a})`; sx.beginPath(); sx.arc(x, y, 5, -.5 * Math.PI, .5 * Math.PI)
    sx.bezierCurveTo(x + 3, y + 2, x + 3, y - 2, x, y - 5); sx.fill()
  }

  const n = p.night
  const dusk = Math.min(1, n / .35), night = Math.max(0, (n - .35) / .65)
  const any = images.day ?? images.sunset ?? images.night
  if (!any || !images.land) return
  paintPlate(ctx, images.day ?? any, w)
  ctx.globalAlpha = dusk
  paintPlate(ctx, images.sunset ?? images.day ?? any, w)
  ctx.globalAlpha = night
  paintPlate(ctx, images.night ?? images.sunset ?? any, w)
  ctx.globalAlpha = 1

  // A single alpha-mask draw preserves both disconnected land regions.
  const mx = w.mask.getContext('2d')!
  mx.setTransform(dpr, 0, 0, dpr, 0, 0); mx.clearRect(0, 0, W, H)
  paintPlate(mx, images.land, w)
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(w.mask, 0, 0, W, H)
  ctx.globalCompositeOperation = 'source-atop'

  // Weather remains live: mute clear-sky colour without losing photographic detail.
  const grey = Math.max(0, p.cloud - .05) * .5
  if (grey) {
    ctx.globalCompositeOperation = 'saturation'
    ctx.fillStyle = `rgba(128,128,128,${grey})`; ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = `rgba(24,39,53,${grey * .54 * (1 - n * .55)})`; ctx.fillRect(0, 0, W, H)
  }
  if (p.weather === 'fog' || p.weather === 'snow') {
    const mist = ctx.createLinearGradient(0, y0 * .3, 0, yB)
    const rgb = n > .5 ? '100,121,140' : '205,216,222'
    mist.addColorStop(0, `rgba(${rgb},0)`)
    mist.addColorStop(.58, `rgba(${rgb},${p.weather === 'fog' ? .6 : .24})`)
    mist.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = mist; ctx.fillRect(0, 0, W, yB)
  }
  if (p.weather === 'snow') {
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = `rgba(183,199,211,${.48 * (1 - n * .7)})`
    ctx.fillRect(0, yB + 2, W, H - yB)
    ctx.globalCompositeOperation = 'source-atop'
  }
  ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(w.mask, 0, 0, W, H)
  ctx.globalCompositeOperation = 'source-over'
}

export function drawPhotoFrame(ctx: CanvasRenderingContext2D, w: PhotoWorld, p: Palette, t: number, dt: number, still = false) {
  const { W, H, y0, yB, dpr } = w, riverH = yB - y0, n = p.night
  const targetRain = p.weather === 'storm' ? 1.4 : p.weather === 'rain' ? 1 : 0
  const targetSnow = p.weather === 'snow' ? 1 : 0
  const blend = still ? 1 : 1 - Math.exp(-dt * .8)
  w.rainAmount = w.rainAmount < 0 ? targetRain : w.rainAmount + (targetRain - w.rainAmount) * blend
  w.snowAmount = w.snowAmount < 0 ? targetSnow : w.snowAmount + (targetSnow - w.snowAmount) * blend
  const rain = w.rainAmount < .01 ? 0 : w.rainAmount
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = p.bank[0]; ctx.fillRect(0, 0, W, H)
  ctx.drawImage(w.sky, 0, 0, W, y0)

  // Gentle moving cloud cover, composited beneath precipitation.
  if (p.cloud > .02) {
    const off = Math.floor(t * 2.2) % CLOUD_WIDTH, ch = y0 * .8
    for (const [image, amount] of [[w.cloudsDay, 1 - n], [w.cloudsNight, n]] as const) {
      ctx.globalAlpha = amount * Math.min(1, .12 + p.cloud * .95)
      for (let x = -off; x < W; x += CLOUD_WIDTH) ctx.drawImage(image, x, 0, CLOUD_WIDTH, ch)
    }
    ctx.globalAlpha = 1
  }
  ctx.drawImage(w.base, 0, 0, W, H)
  if (n > .3) {
    ctx.fillStyle = `rgba(255,93,64,${n * (.25 + Math.max(0, Math.sin(t * 1.8)) ** 3 * .6)})`
    ctx.fillRect(w.towerX - .6, w.towerY, 1.2, 1.2)
  }
  for (const car of w.cars) {
    car.x = (car.x + car.direction * car.speed * dt + W) % W
    ctx.fillStyle = car.direction < 0 ? `rgba(248,99,72,${n * .6})` : `rgba(250,231,186,${n * .7})`
    ctx.fillRect(car.x, y0 - 4, 1.4, .65)
  }

  // Refresh the reflected sky/clouds/city, never including any water pixels.
  if (t - w.lastReflection > .35) {
    const ex = w.environment.getContext('2d')!
    ex.drawImage(ctx.canvas, 0, 0, ctx.canvas.width, Math.round(y0 * dpr), 0, 0, W, y0)
    w.river.setEnvironment(w.environment); w.lastReflection = t
  }
  ctx.drawImage(w.river.draw(p, t, .8 + rain * .8 + p.cloud * .22), 0, y0, W, riverH)
  // Preserve the photographed shoreline and blades that overlap the water edge.
  ctx.save(); ctx.beginPath(); ctx.rect(0, yB - 6, W, H - yB + 6); ctx.clip()
  ctx.drawImage(w.base, 0, 0, W, H)
  ctx.restore()

  if (rain) {
    if (dt > 0) for (let i = 0; i < W * rain * dt * .08; i++) {
      const depth = Math.random()
      w.ripples.push({ x: Math.random() * W, y: y0 + 5 + depth * (riverH - 10), age: 0, radius: 2 + depth * 7 })
    }
    ctx.lineWidth = .65
    w.ripples = w.ripples.filter(r => (r.age += dt) < 1)
    for (const r of w.ripples) {
      ctx.strokeStyle = `rgba(206,223,232,${.18 * (1 - r.age)})`
      ctx.beginPath(); ctx.ellipse(r.x, r.y, .5 + r.radius * r.age, .2 + r.radius * r.age * .25, 0, 0, Math.PI * 2); ctx.stroke()
    }
    const count = Math.round(W * .18 * rain)
    while (w.drops.length < count) w.drops.push({ x: Math.random() * W * 1.2, y: Math.random() * H, speed: 640 + Math.random() * 420, length: 8 + Math.random() * 16 })
    ctx.strokeStyle = n > .5 ? `rgba(190,207,222,${.28 * Math.min(1, rain)})` : `rgba(227,238,245,${.34 * Math.min(1, rain)})`
    ctx.lineWidth = .7; ctx.beginPath()
    for (const drop of w.drops) {
      drop.y += drop.speed * dt; drop.x -= drop.speed * dt * .1
      if (drop.y > H || drop.x < -20) { drop.y = -drop.length; drop.x = Math.random() * W * 1.2 }
      ctx.moveTo(drop.x, drop.y); ctx.lineTo(drop.x + drop.length * .1, drop.y - drop.length)
    }
    ctx.stroke()
  } else { w.drops.length = 0; w.ripples.length = 0 }

  if (w.snowAmount > .01) {
    while (w.flakes.length < W * .14) w.flakes.push({ x: Math.random() * W, y: Math.random() * H, speed: 16 + Math.random() * 38, r: .6 + Math.random() * 1.8, phase: Math.random() * 6 })
    for (const flake of w.flakes) {
      flake.y += flake.speed * dt; flake.x += Math.sin(t * .7 + flake.phase) * 9 * dt
      if (flake.y > H) { flake.y = -4; flake.x = Math.random() * W }
      ctx.fillStyle = `rgba(245,249,251,${(.3 + flake.r * .22) * w.snowAmount})`
      ctx.beginPath(); ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2); ctx.fill()
    }
  } else w.flakes.length = 0

  if (p.weather === 'storm') {
    w.nextFlash -= dt
    if (w.nextFlash < 0) { w.flash = 1; w.nextFlash = 5 + Math.random() * 10 }
    if (w.flash > 0) {
      ctx.fillStyle = `rgba(219,231,249,${w.flash * .26})`; ctx.fillRect(0, 0, W, H)
      w.flash = Math.max(0, w.flash - dt * 3.2)
    }
  } else w.flash = 0
  if (p.weather === 'fog') {
    ctx.globalAlpha = .22
    const fog = n > .5 ? w.cloudsNight : w.cloudsDay, off = Math.floor(t * 4) % CLOUD_WIDTH
    for (let x = -off; x < W; x += CLOUD_WIDTH) ctx.drawImage(fog, x, y0 - riverH * .4, CLOUD_WIDTH, riverH * 1.2)
    ctx.globalAlpha = 1
  }
}
