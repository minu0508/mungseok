import type { Palette } from './sky'

// Live surface geometry. Reflections sample only the sky and skyline, never a water photograph.
const WAVES = [
  [.13, 3.8, .9, .018], [-.24, 7.1, 1.2, .012], [.4, 11.7, -1.4, .008],
  [-.67, 20.3, 1.8, .004], [1.3, 35.2, -2.1, .002], [-2.1, 58.8, 2.6, .001],
] as const
const NORMAL_SIZE = 128
function normalMap() {
  const size = NORMAL_SIZE, heights = new Float32Array(size * size), map = new Uint8Array(size * size * 4)
  const hash = (x: number, y: number) => { let n = Math.imul(x + 17, 374761393) + Math.imul(y + 31, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295 }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let h = 0
    for (const [cells, weight] of [[8, .55], [16, .3], [32, .15]]) {
      const u = x / size * cells, v = y / size * cells, ix = Math.floor(u), iy = Math.floor(v)
      const a = (u - ix) ** 2 * (3 - 2 * (u - ix)), b = (v - iy) ** 2 * (3 - 2 * (v - iy))
      h += ((hash(ix, iy) * (1 - a) + hash((ix + 1) % cells, iy) * a) * (1 - b) + (hash(ix, (iy + 1) % cells) * (1 - a) + hash((ix + 1) % cells, (iy + 1) % cells) * a) * b) * weight
    }
    heights[y * size + x] = h
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    const dx = heights[y * size + (x + 1) % size] - heights[y * size + (x + size - 1) % size]
    const dy = heights[((y + 1) % size) * size + x] - heights[((y + size - 1) % size) * size + x]
    map[i] = Math.max(0, Math.min(255, 128 + dx * 510)); map[i + 1] = Math.max(0, Math.min(255, 128 + dy * 510))
    map[i + 2] = 128; map[i + 3] = 255
  }
  return map
}
const NORMALS = normalMap()
function normalAt(u: number, v: number, channel: number) {
  const x = (u - Math.floor(u)) * NORMAL_SIZE, y = (v - Math.floor(v)) * NORMAL_SIZE
  const ix = Math.floor(x), iy = Math.floor(y), a = x - ix, b = y - iy
  const at = (x: number, y: number) => NORMALS[((y % NORMAL_SIZE) * NORMAL_SIZE + x % NORMAL_SIZE) * 4 + channel] / 127.5 - 1
  return (at(ix, iy) * (1 - a) + at(ix + 1, iy) * a) * (1 - b) + (at(ix, iy + 1) * (1 - a) + at(ix + 1, iy + 1) * a) * b
}
const vertex = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = (a_position + 1.0) * .5; gl_Position = vec4(a_position, 0.0, 1.0); }
`
const fragment = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_environment;
uniform sampler2D u_normals;
uniform float u_time, u_night, u_roughness, u_light, u_sun;
uniform vec3 u_water;
void main() {
  float v = 1.0 - v_uv.y;
  float z = 10.0 / (.08 + v);
  vec2 point = vec2((v_uv.x - .5) * z * 1.5, z);
  vec2 slope = vec2(0.0);
  ${WAVES.map(([x, z, speed, a]) => `slope += cos(dot(point, vec2(${x}, ${z})) + u_time * ${speed}) * ${a} * vec2(${x}, ${z});`).join('\n')}
  vec2 grain = texture2D(u_normals, point * vec2(.08, .34) + u_time * vec2(.012, -.021)).rg * 2.0 - 1.0;
  grain += (texture2D(u_normals, point * vec2(.19, .71) + u_time * vec2(-.009, .014)).rg * 2.0 - 1.0) * .6;
  slope = (slope * .25 + grain * vec2(.17, .75)) * u_roughness;
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 view = normalize(vec3(-point.x, 3.0, z));
  float fresnel = .18 + .78 * pow(1.0 - max(dot(normal, view), 0.0), 3.0);
  vec2 reflected = vec2(v_uv.x + slope.x * (.025 + v * .018), 1.0 - v * .72 + slope.y * .24);
  vec3 environment = texture2D(u_environment, clamp(reflected, .002, .998)).rgb;
  vec3 colour = mix(u_water * .78, environment, fresnel);
  vec3 lights = texture2D(u_environment, clamp(vec2(reflected.x, 1.0 - v * .12 + slope.y * .055), .002, .998)).rgb;
  colour += max(lights - vec3(.18), vec3(0.0)) * u_night * (1.0 - v * .45) * .7;
  float path = exp(-pow((v_uv.x - u_sun + slope.x * .13) / (.012 + v * .075), 2.0));
  float glint = pow(max(0.0, 1.0 - abs(slope.y + .04) * 5.0), 12.0);
  colour += vec3(1.0, .88, .68) * path * glint * u_light * (.12 + v * .24);
  colour *= .95 + slope.y * .5;
  colour *= 1.0 - smoothstep(.82, 1.0, v) * .22;
  gl_FragColor = vec4(colour, 1.0);
}
`
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))

export interface River {
  setEnvironment(source: HTMLCanvasElement): void
  draw(p: Palette, time: number, roughness: number): HTMLCanvasElement
  dispose(): void
}

/** Software fallback for devices where WebGL is disabled or its context is lost. */
export function createSoftwareRiver(W: number, H: number): River {
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(320, Math.round(W)); canvas.height = Math.min(96, Math.round(H))
  const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(canvas.width, canvas.height)
  const environment = document.createElement('canvas')
  environment.width = 640; environment.height = 256
  const ex = environment.getContext('2d', { willReadFrequently: true })!
  let env = ex.getImageData(0, 0, 640, 256).data
  return {
    setEnvironment(source) {
      ex.clearRect(0, 0, 640, 256); ex.drawImage(source, 0, 0, 640, 256)
      env = ex.getImageData(0, 0, 640, 256).data
    },
    draw(p, time, roughness) {
      const water = rgb(p.water[0]), sun = p.sun ? 1 - p.sun.x : .64
      const light = p.sun ? (1 - p.night) * (1 - p.cloud) : p.night * .12 * (1 - p.cloud)
      const tone = [1, .88, .68]
      const cosines = new Float64Array(6), sines = new Float64Array(6), deltaCos = new Float64Array(6), deltaSin = new Float64Array(6)
      for (let y = 0; y < canvas.height; y++) {
        const v = (y + .5) / canvas.height, z = 10 / (.08 + v)
        const edge = clamp((v - .82) / .18), shore = 1 - edge * edge * (3 - 2 * edge) * .22
        WAVES.forEach(([kx, kz, speed], j) => {
          const phase = (.5 / canvas.width - .5) * z * 1.5 * kx + z * kz + time * speed
          cosines[j] = Math.cos(phase); sines[j] = Math.sin(phase)
          deltaCos[j] = Math.cos(z * 1.5 * kx / canvas.width); deltaSin[j] = Math.sin(z * 1.5 * kx / canvas.width)
        })
        for (let x = 0; x < canvas.width; x++) {
          const u = (x + .5) / canvas.width, px = (u - .5) * z * 1.5
          let sx = 0, sz = 0
          for (let j = 0; j < WAVES.length; j++) {
            const [kx, kz, , a] = WAVES[j], c = cosines[j], s = sines[j]
            const wave = c * a
            sx += wave * kx; sz += wave * kz
            cosines[j] = c * deltaCos[j] - s * deltaSin[j]
            sines[j] = s * deltaCos[j] + c * deltaSin[j]
          }
          sx = (sx * .25 + (normalAt(px * .08 + time * .012, z * .34 - time * .021, 0) + normalAt(px * .19 - time * .009, z * .71 + time * .014, 0) * .6) * .17) * roughness
          sz = (sz * .25 + (normalAt(px * .08 + time * .012, z * .34 - time * .021, 1) + normalAt(px * .19 - time * .009, z * .71 + time * .014, 1) * .6) * .75) * roughness
          const dot = clamp((sx * px + 3 - sz * z) / Math.sqrt((sx * sx + 1 + sz * sz) * (px * px + 9 + z * z)))
          const fresnel = .18 + .78 * (1 - dot) ** 3
          const exx = Math.floor(clamp(u + sx * (.025 + v * .018), .002, .998) * 639)
          const eyy = Math.floor(clamp(1 - v * .72 + sz * .24, .002, .998) * 255)
          const ei = (eyy * 640 + exx) * 4, i = (y * canvas.width + x) * 4
          const ly = Math.floor(clamp(1 - v * .12 + sz * .055, .002, .998) * 255), li = (ly * 640 + exx) * 4
          const path = Math.exp(-(((u - sun + sx * .13) / (.012 + v * .075)) ** 2))
          const glint = Math.max(0, 1 - Math.abs(sz + .04) * 5) ** 12
          for (let c = 0; c < 3; c++) {
            const reflected = env[ei + c] / 255
            let value = water[c] * .78 * (1 - fresnel) + reflected * fresnel
            value += Math.max(0, env[li + c] / 255 - .18) * p.night * (1 - v * .45) * .7
            value += tone[c] * path * glint * light * (.12 + v * .24)
            pixels.data[i + c] = clamp(value * (.95 + sz * .5) * shore) * 255
          }
          pixels.data[i + 3] = 255
        }
      }
      ctx.putImageData(pixels, 0, 0)
      return canvas
    },
    dispose() {},
  }
}

export function createRiver(W: number, H: number, dpr: number): River {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(W * Math.min(dpr, 1.5)); canvas.height = Math.round(H * Math.min(dpr, 1.5))
  let gl: WebGLRenderingContext | null = null
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false }) } catch { /* Fall back below. */ }
  if (!gl) return createSoftwareRiver(W, H)
  const shaders: WebGLShader[] = []
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, texture: WebGLTexture | null = null, normals: WebGLTexture | null = null
  let source: HTMLCanvasElement | null = null, fallback: River | null = null
  const useFallback = () => {
    if (!fallback) { fallback = createSoftwareRiver(W, H); if (source) fallback.setEnvironment(source) }
    return fallback
  }
  try {
    for (const [type, text] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type)!
      shaders.push(shader); gl.shaderSource(shader, text); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('River shader compilation failed')
    }
    program = gl.createProgram()!
    shaders.forEach(shader => gl!.attachShader(program!, shader))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('River shader link failed')
    gl.useProgram(program)
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    normals = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, normals)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NORMAL_SIZE, NORMAL_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, NORMALS)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.activeTexture(gl.TEXTURE0)
  } catch {
    shaders.forEach(shader => gl!.deleteShader(shader))
    if (program) gl.deleteProgram(program)
    if (buffer) gl.deleteBuffer(buffer)
    if (texture) gl.deleteTexture(texture)
    if (normals) gl.deleteTexture(normals)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return createSoftwareRiver(W, H)
  }
  const locations = Object.fromEntries(['time', 'night', 'roughness', 'light', 'sun', 'water', 'environment', 'normals'].map(name => [name, gl!.getUniformLocation(program!, `u_${name}`)]))
  const lost = (event: Event) => { event.preventDefault(); useFallback() }
  canvas.addEventListener('webglcontextlost', lost)
  return {
    setEnvironment(image) {
      source = image
      if (fallback || gl!.isContextLost()) { useFallback().setEnvironment(image); return }
      gl!.bindTexture(gl!.TEXTURE_2D, texture)
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, image)
    },
    draw(p, time, roughness) {
      if (fallback || gl!.isContextLost()) return useFallback().draw(p, time, roughness)
      gl!.viewport(0, 0, canvas.width, canvas.height)
      gl!.uniform1f(locations.time, time); gl!.uniform1f(locations.night, p.night)
      gl!.uniform1f(locations.roughness, roughness)
      gl!.uniform1f(locations.sun, p.sun ? 1 - p.sun.x : .64)
      gl!.uniform1f(locations.light, p.sun ? (1 - p.night) * (1 - p.cloud) : p.night * .12 * (1 - p.cloud))
      gl!.uniform3fv(locations.water, rgb(p.water[0])); gl!.uniform1i(locations.environment, 0)
      gl!.uniform1i(locations.normals, 1)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
      return canvas
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', lost)
      shaders.forEach(shader => gl!.deleteShader(shader))
      gl!.deleteProgram(program); gl!.deleteBuffer(buffer); gl!.deleteTexture(texture); gl!.deleteTexture(normals)
      gl!.getExtension('WEBGL_lose_context')?.loseContext()
      fallback?.dispose()
    },
  }
}
