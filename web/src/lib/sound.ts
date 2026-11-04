import { useCallback, useEffect, useRef, useState } from 'react'
import type { Weather } from '@/lib/sky'

/*
 * 강물 소리를 파일 없이 만든다.
 * 낮은 갈색 잡음(흐르는 물) + 천천히 부풀었다 잦아드는 물결 + 비 오는 날의 빗소리.
 * 브라우저는 사용자가 누르기 전에는 소리를 못 내므로 버튼으로만 켠다.
 */

function noise(ctx: AudioContext, brown: boolean) {
  const len = ctx.sampleRate * 4
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    d[i] = brown ? (last = (last + 0.02 * white) / 1.02) * 3.5 : white
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  return src
}

type Graph = { ctx: AudioContext; master: GainNode; rain: GainNode }

function buildGraph(): Graph {
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  const flow = noise(ctx, true)
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'; low.frequency.value = 420
  const flowGain = ctx.createGain()
  flowGain.gain.value = 0.55
  flow.connect(low).connect(flowGain).connect(master)

  const lap = noise(ctx, false)
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'; band.frequency.value = 850; band.Q.value = 0.6
  const lapGain = ctx.createGain()
  lapGain.gain.value = 0.05
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.09
  const depth = ctx.createGain()
  depth.gain.value = 0.04
  lfo.connect(depth).connect(lapGain.gain)
  lap.connect(band).connect(lapGain).connect(master)

  const rainSrc = noise(ctx, false)
  const high = ctx.createBiquadFilter()
  high.type = 'highpass'; high.frequency.value = 2400
  const rain = ctx.createGain()
  rain.gain.value = 0
  rainSrc.connect(high).connect(rain).connect(master)

  for (const s of [flow, lap, rainSrc]) s.start()
  lfo.start()
  return { ctx, master, rain }
}

export function useRiverSound(weather: Weather) {
  const [on, setOn] = useState(false)
  const g = useRef<Graph | null>(null)

  const toggle = useCallback(() => {
    const next = !on
    setOn(next)
    if (next && !g.current) {
      try { g.current = buildGraph() } catch { setOn(false); return } // 소리를 지원하지 않는 브라우저
    }
    const graph = g.current
    if (!graph) return
    const t = graph.ctx.currentTime
    if (next) graph.ctx.resume()
    graph.master.gain.cancelScheduledValues(t)
    graph.master.gain.setTargetAtTime(next ? 0.32 : 0, t, next ? 0.6 : 0.25)
  }, [on])

  useEffect(() => {
    const graph = g.current
    if (!graph) return
    const amount = weather === 'storm' ? 0.12 : weather === 'rain' ? 0.08 : 0
    graph.rain.gain.setTargetAtTime(amount, graph.ctx.currentTime, 1.5)
  }, [weather, on])

  // 작은 종소리: "아직 계세요?"를 물을 때. 물소리를 켠 사람에게만 울린다
  const chime = useCallback(() => {
    const graph = g.current
    if (!graph || !on) return
    const { ctx } = graph, t = ctx.currentTime
    for (const [freq, delay] of [[784, 0], [1175, 0.18]] as const) {
      const osc = ctx.createOscillator(), env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      env.gain.setValueAtTime(0, t + delay)
      env.gain.linearRampToValueAtTime(0.12, t + delay + 0.02)
      env.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.6)
      osc.connect(env).connect(ctx.destination)
      osc.start(t + delay)
      osc.stop(t + delay + 1.7)
    }
  }, [on])

  useEffect(() => () => { g.current?.ctx.close() }, [])
  return { on, toggle, chime }
}
