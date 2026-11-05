import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { interpolatePalette, type Palette } from '@/lib/sky'
import { buildPhotoWorld, composePhoto, drawPhotoFrame, SCENERY, type PhotoWorld, type Scenery } from '@/lib/photo-scene'

// Detailed land textures sit between a live sky and a separately simulated river.
export function Scene({ pal, sitting, children }: { pal: Palette; sitting: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const palRef = useRef(pal)
  const targetPal = useRef(pal)
  const sittingRef = useRef(sitting)
  const redraw = useRef<() => void>(() => {})
  const reducedMotion = useReducedMotion()
  sittingRef.current = sitting

  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext('2d')!
    const motionQuery = matchMedia('(prefers-reduced-motion: reduce)')
    const images: Scenery = {}
    let world: PhotoWorld | null = null, disposed = false
    let raf = 0, last = performance.now(), drawn = 0, resizeTimer = 0
    let transitionStart = -Infinity, fromPalette = palRef.current, lastComposed = 0
    const paint = (time: number, dt: number) => {
      if (world) drawPhotoFrame(ctx, world, palRef.current, time / 1000, dt, motionQuery.matches)
    }
    const compose = () => {
      if (!world || disposed) return
      composePhoto(world, palRef.current, images)
      paint(last, 0)
    }
    const setup = () => {
      const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      world?.river.dispose()
      world = buildPhotoWorld(W, H, dpr)
      compose()
    }
    const loop = (time: number) => {
      raf = requestAnimationFrame(loop)
      if (sittingRef.current && time - drawn < 32) return
      const dt = Math.min(.1, (time - last) / 1000)
      last = time; drawn = time
      if (Number.isFinite(transitionStart)) {
        const progress = Math.min(1, (time - transitionStart) / 4500)
        palRef.current = interpolatePalette(fromPalette, targetPal.current, progress * progress * (3 - 2 * progress))
        if (world && (time - lastComposed > 100 || progress === 1)) {
          composePhoto(world, palRef.current, images); lastComposed = time
        }
        if (progress === 1) transitionStart = -Infinity
      }
      paint(time, dt)
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      last = performance.now()
      if (!motionQuery.matches && !document.hidden) raf = requestAnimationFrame(loop)
      else { palRef.current = targetPal.current; compose() }
    }
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(setup, 150) }
    redraw.current = () => {
      fromPalette = palRef.current; transitionStart = performance.now()
      if (motionQuery.matches || document.hidden) { palRef.current = targetPal.current; compose() }
    }
    setup()

    // Load the current time of day first; any available image is a fallback.
    const preferred = palRef.current.night > .7 ? 'night' : palRef.current.night > .1 ? 'sunset' : 'day'
    const entries = Object.entries(SCENERY).sort(([a], [b]) => Number(b === preferred) - Number(a === preferred))
    for (const [key, url] of entries) {
      const img = new Image()
      img.decoding = 'async'
      img.fetchPriority = key === preferred || key === 'land' ? 'high' : 'low'
      img.onload = () => { if (!disposed) { images[key as keyof Scenery] = img; compose() } }
      img.onerror = () => { /* Keep the available photograph if an asset fails. */ }
      img.src = url
    }
    schedule()
    addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', schedule)
    motionQuery.addEventListener('change', schedule)
    return () => {
      disposed = true; cancelAnimationFrame(raf); clearTimeout(resizeTimer)
      world?.river.dispose()
      removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', schedule)
      motionQuery.removeEventListener('change', schedule)
      redraw.current = () => {}
    }
  }, [])

  useEffect(() => { targetPal.current = pal; redraw.current() }, [pal])

  return (
    <motion.div className="scene" aria-hidden="true"
      animate={{ scale: sitting && !reducedMotion ? 1.045 : 1 }}
      transition={{ duration: sitting ? 40 : 1.6, ease: sitting ? 'linear' : 'easeOut' }}>
      <canvas ref={ref} className="scene-canvas" />
      {children}
      <div className="vignette" />
    </motion.div>
  )
}
