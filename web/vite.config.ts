import path from 'node:path'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 공유 미리보기(og:image)는 절대 주소여야 한다. SITE_URL, 없으면 Vercel 의 운영 주소로 채운다
function siteOrigin(): Plugin {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const origin = (process.env.SITE_URL || (vercel ? `https://${vercel}` : 'http://localhost:4173')).replace(/\/$/, '')
  return { name: 'site-origin', transformIndexHtml: html => html.replaceAll('__ORIGIN__', origin) }
}

// 개발 중에도 preview와 같은 WebSocket 경로를 사용한다.
const proxy: Record<string, ProxyOptions> = {
  '/ws': {
    target: 'ws://127.0.0.1:8787',
    ws: true,
    configure: proxy => {
      proxy.on('proxyReqWs', (proxyReq, req) => {
        proxyReq.setHeader('CF-Connecting-IP', (req.socket.remoteAddress ?? '').replace(/^::ffff:/, ''))
      })
    },
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), siteOrigin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { proxy },
  preview: { proxy },
})
