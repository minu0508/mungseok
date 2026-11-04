import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 공유 미리보기(og:image)는 절대 주소여야 한다. SITE_URL, 없으면 Vercel 의 운영 주소로 채운다
function siteOrigin(): Plugin {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const origin = (process.env.SITE_URL || (vercel ? `https://${vercel}` : 'http://localhost:4173')).replace(/\/$/, '')
  return { name: 'site-origin', transformIndexHtml: html => html.replaceAll('__ORIGIN__', origin) }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), siteOrigin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // 내 PC 에서 볼 때: vite preview 가 /ws 를 wrangler dev(8787)로 넘긴다. 바깥에는 화면 포트 하나만 열면 된다.
  // 접속한 기기의 IP 를 실제 Cloudflare 처럼 CF-Connecting-IP 로 넘겨 "IP 하나당 한 명" 이 기기별로 동작하게 한다
  preview: {
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
        configure: proxy => {
          proxy.on('proxyReqWs', (proxyReq, req) => {
            proxyReq.setHeader('CF-Connecting-IP', (req.socket.remoteAddress ?? '').replace(/^::ffff:/, ''))
          })
        },
      },
    },
  },
})
