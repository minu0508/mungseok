type Context = CanvasRenderingContext2D

export function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647
}

/** Tileable fractal cloud density, shared by the day and night light treatments. */
export function drawClouds(day: Context, night: Context, W: number, H: number) {
  const width = Math.ceil(W / 2), height = Math.ceil(H / 2)
  const texture = document.createElement('canvas')
  texture.width = width; texture.height = height
  const cx = texture.getContext('2d')!
  const data = cx.createImageData(width, height)
  const density = new Float32Array(width * height)
  const smooth = (v: number) => v * v * (3 - 2 * v)
  const hash = (x: number, y: number) => {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295
  }
  const noise = (u: number, v: number, period: number) => {
    const x = Math.floor(u), y = Math.floor(v), a = smooth(u - x), b = smooth(v - y)
    const left = (x % period + period) % period, right = (left + 1) % period
    const top = hash(left, y) * (1 - a) + hash(right, y) * a
    return top * (1 - b) + (hash(left, y + 1) * (1 - a) + hash(right, y + 1) * a) * b
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value = 0, weight = .56
    for (let octave = 0; octave < 5; octave++) {
      const frequency = 5 * 2 ** octave
      value += noise(x / width * frequency, y / height * frequency * .65 + 11, frequency) * weight
      weight *= .5
    }
    density[y * width + x] = smooth(Math.max(0, Math.min(1, (value - .34) * 2.5))) * Math.sin(y / height * Math.PI) ** 1.4
  }
  for (const dark of [false, true]) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, d = density[i]
      const upper = density[Math.max(0, y - 5) * width + x]
      const light = Math.max(0, Math.min(1, .6 + (d - upper) * 1.5 - y / height * .22))
      data.data[i * 4] = dark ? 34 + light * 19 : 153 + light * 92
      data.data[i * 4 + 1] = dark ? 43 + light * 21 : 170 + light * 78
      data.data[i * 4 + 2] = dark ? 59 + light * 25 : 185 + light * 64
      data.data[i * 4 + 3] = Math.round(d * 230)
    }
    cx.putImageData(data, 0, 0)
    ;(dark ? night : day).drawImage(texture, 0, 0, W, H)
  }
}

